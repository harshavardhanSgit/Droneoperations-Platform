import { Injectable } from '@nestjs/common';

import {
  InvalidInputException,
  ResourceConflictException,
  ResourceNotFoundException,
} from '../../common/errors/app.exception';
import { Prisma } from '../../generated/prisma/client';
import type { OfferingVersionModel } from '../../generated/prisma/models';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { CatalogueService } from '../catalogue/catalogue.service';
import type { ActorContext } from '../identity/actor-context';
import { ProviderRepository } from '../organisations/provider.repository';
import type {
  CreateOfferingDto,
  OfferingDto,
  OfferingHistoryDto,
  OfferingVersionDto,
  CreateOfferingVersionDto,
  SetOfferingAreasDto,
} from './dto/offering.dto';
import { OfferingRepository, type OfferingWithDetail } from './offering.repository';

const UNIQUE_VIOLATION = 'P2002';

@Injectable()
export class OfferingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly offerings: OfferingRepository,
    private readonly providers: ProviderRepository,
    private readonly catalogue: CatalogueService,
  ) {}

  async listOwn(actor: ActorContext): Promise<OfferingDto[]> {
    const provider = await this.requireProvider(actor);
    const offerings = await this.offerings.listForProvider(provider.id, 'ACTIVE');

    return offerings.map((offering) => this.toDto(offering));
  }

  async create(actor: ActorContext, dto: CreateOfferingDto): Promise<OfferingDto> {
    const provider = await this.requireProvider(actor);
    const serviceType = await this.catalogue.requireActiveServiceType(dto.serviceTypeId);

    await this.assertAreasExist(dto.areaIds ?? []);

    try {
      const offering = await this.prisma.$transaction(async (tx) => {
        const created = await this.offerings.createOffering(
          { providerId: provider.id, serviceTypeId: serviceType.id },
          tx,
        );

        await this.offerings.createVersion(
          {
            offeringId: created.id,
            versionNumber: 1,
            unitPriceMinor: dto.unitPriceMinor,
            // Copied from the catalogue so the version records the unit the
            // price was agreed in, independent of later catalogue changes.
            pricingUnit: serviceType.pricingUnit,
            minQuantity: dto.minQuantity,
            inclusions: dto.inclusions ?? [],
            notes: dto.notes?.trim(),
            createdByUserId: actor.userId,
          },
          tx,
        );

        if (dto.areaIds?.length) {
          await this.offerings.replaceAreas(created.id, dto.areaIds, tx);
        }

        return created;
      });

      return this.toDto(await this.requireOffering(offering.id));
    } catch (error) {
      // The partial unique index caught a duplicate. An application-level check
      // would have raced; this cannot.
      if (this.isUniqueViolation(error)) {
        throw new ResourceConflictException(
          'OFFERING_ALREADY_EXISTS',
          'You already offer this service. Reprice the existing offering instead.',
          { serviceTypeId: dto.serviceTypeId },
        );
      }
      throw error;
    }
  }

  /**
   * F3 in one method: close the current version, open a new one. The existing
   * version is never touched, so any quote referencing it keeps its price.
   *
   * The new version REPLACES the terms wholesale — it does not inherit from
   * its predecessor. See CreateOfferingVersionDto.
   */
  async publishVersion(
    actor: ActorContext,
    offeringId: string,
    dto: CreateOfferingVersionDto,
  ): Promise<OfferingDto> {
    const offering = await this.requireOwnOffering(actor, offeringId);
    const current = offering.versions[0];

    if (!current) {
      throw new ResourceConflictException(
        'OFFERING_HAS_NO_CURRENT_VERSION',
        'This offering has no active price',
      );
    }

    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      const closed = await this.offerings.closeCurrentVersion(offering.id, now, tx);

      // Conditional update returned nothing: a concurrent reprice already
      // closed this version. Fail rather than create a second current one.
      if (closed.count === 0) {
        throw new ResourceConflictException(
          'OFFERING_CONCURRENTLY_MODIFIED',
          'This offering was repriced by someone else. Reload and try again.',
        );
      }

      const nextNumber = (await this.offerings.highestVersionNumber(offering.id, tx)) + 1;

      await this.offerings.createVersion(
        {
          offeringId: offering.id,
          versionNumber: nextNumber,
          unitPriceMinor: dto.unitPriceMinor,
          pricingUnit: current.pricingUnit,
          minQuantity: dto.minQuantity,
          inclusions: dto.inclusions ?? [],
          notes: dto.notes?.trim(),
          createdByUserId: actor.userId,
        },
        tx,
      );
    });

    return this.toDto(await this.requireOffering(offering.id));
  }

  async setAreas(
    actor: ActorContext,
    offeringId: string,
    dto: SetOfferingAreasDto,
  ): Promise<OfferingDto> {
    const offering = await this.requireOwnOffering(actor, offeringId);

    await this.assertAreasExist(dto.areaIds);
    await this.offerings.replaceAreas(offering.id, dto.areaIds);

    return this.toDto(await this.requireOffering(offering.id));
  }

  async withdraw(actor: ActorContext, offeringId: string): Promise<OfferingDto> {
    const offering = await this.requireOwnOffering(actor, offeringId);

    await this.offerings.withdraw(offering.id);

    return this.toDto(await this.requireOffering(offering.id));
  }

  /** The whole price history. This is what a snapshot column could never give. */
  async history(actor: ActorContext, offeringId: string): Promise<OfferingHistoryDto> {
    const offering = await this.requireOwnOffering(actor, offeringId);
    const versions = await this.offerings.listVersions(offering.id);

    return {
      ...this.toDto(offering),
      versions: versions.map((version) => this.toVersionDto(version)),
    };
  }

  // --------------------------------------------------------------- private

  private async requireProvider(actor: ActorContext) {
    const provider = await this.providers.findByOrganisation(actor.organisationId);

    if (!provider) {
      throw new ResourceNotFoundException('Provider profile', actor.organisationId);
    }

    return provider;
  }

  private async requireOffering(id: string): Promise<OfferingWithDetail> {
    const offering = await this.offerings.findById(id);

    if (!offering) {
      throw new ResourceNotFoundException('Offering', id);
    }

    return offering;
  }

  /** Level-2: the offering must belong to the actor's own provider. */
  private async requireOwnOffering(
    actor: ActorContext,
    offeringId: string,
  ): Promise<OfferingWithDetail> {
    const provider = await this.requireProvider(actor);
    const offering = await this.requireOffering(offeringId);

    if (offering.providerId !== provider.id) {
      // 404 rather than 403: confirming that someone else's offering exists is
      // itself a small leak.
      throw new ResourceNotFoundException('Offering', offeringId);
    }

    return offering;
  }

  private async assertAreasExist(areaIds: string[]): Promise<void> {
    for (const areaId of areaIds) {
      await this.catalogue.requireActiveArea(areaId);
    }
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError && error.code === UNIQUE_VIOLATION
    );
  }

  private toDto(offering: OfferingWithDetail): OfferingDto {
    const current = offering.versions[0];

    if (!current) {
      throw new InvalidInputException('Offering has no current version', { id: offering.id });
    }

    return {
      id: offering.id,
      serviceTypeId: offering.serviceTypeId,
      serviceTypeCode: offering.serviceType.code,
      serviceTypeName: offering.serviceType.name,
      status: offering.status,
      currentVersion: this.toVersionDto(current),
      areas: offering.areas.map(({ area }) => ({
        id: area.id,
        name: area.name,
        level: area.level,
      })),
    };
  }

  private toVersionDto(version: OfferingVersionModel): OfferingVersionDto {
    return {
      versionNumber: version.versionNumber,
      unitPriceMinor: version.unitPriceMinor,
      currency: version.currency,
      pricingUnit: version.pricingUnit,
      ...(version.minQuantity !== null ? { minQuantity: version.minQuantity } : {}),
      inclusions: version.inclusions,
      ...(version.notes ? { notes: version.notes } : {}),
      effectiveFrom: version.effectiveFrom.toISOString(),
      ...(version.effectiveTo ? { effectiveTo: version.effectiveTo.toISOString() } : {}),
    };
  }
}
