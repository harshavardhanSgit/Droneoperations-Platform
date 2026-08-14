import { Injectable } from '@nestjs/common';

import {
  AccessDeniedException,
  BusinessRuleException,
  ResourceNotFoundException,
} from '../../common/errors/app.exception';
import type { ProviderDocumentKind, ProviderStage } from '../../generated/prisma/client';
import { DocumentService, type DocumentDescriptor } from '../documents/document.service';
import type { ActorContext } from '../identity/actor-context';
import type {
  ProviderDetailDto,
  ProviderDto,
  ProviderListDto,
  UpdateProviderCoverageDto,
  UpdateProviderProfileDto,
} from './dto/provider.dto';
import {
  assertCoverageEditable,
  assertEditable,
  assertTransition,
  BOOKABLE_STAGE,
} from './provider-stage.machine';
import { ProviderRepository, type ProviderWithOrganisation } from './provider.repository';

@Injectable()
export class ProviderService {
  constructor(
    private readonly providers: ProviderRepository,
    private readonly documents: DocumentService,
  ) {}

  // ---------------------------------------------------------------- provider

  async findOwn(actor: ActorContext): Promise<ProviderDetailDto> {
    const provider = await this.requireOwn(actor);

    return {
      ...this.toDto(provider),
      history: (await this.providers.listStageHistory(provider.id)).map((event) => ({
        ...(event.fromStage ? { fromStage: event.fromStage } : {}),
        toStage: event.toStage,
        ...(event.reason ? { reason: event.reason } : {}),
        at: event.createdAt.toISOString(),
      })),
    };
  }

  /**
   * Saving business details advances REGISTERED (or REJECTED, on resubmission) to
   * PROFILE_COMPLETE.
   */
  async updateOwnProfile(actor: ActorContext, dto: UpdateProviderProfileDto): Promise<ProviderDto> {
    const provider = await this.requireOwn(actor);

    assertEditable(provider.stage);

    /** A radius is a distance FROM somewhere. */
    const willHaveBase = (dto.latitude ?? provider.latitude) != null;

    if (dto.serviceRadiusKm !== undefined && !willHaveBase) {
      throw new BusinessRuleException(
        'LOCATION_REQUIRED',
        'Pick your base on the map before setting how far you will travel',
      );
    }

    await this.providers.updateProfile(provider.id, {
      legalName: dto.legalName.trim(),
      registrationNumber: dto.registrationNumber?.trim(),
      contactPhone: dto.contactPhone.trim(),
      addressLine: dto.addressLine.trim(),
      city: dto.city.trim(),
      state: dto.state.trim(),
      pincode: dto.pincode.trim(),
      // undefined is passed through untouched: Prisma treats it as "leave the column alone", so
      // a profile save without coordinates never wipes a previously picked point.
      latitude: dto.latitude,
      longitude: dto.longitude,
      serviceRadiusKm: dto.serviceRadiusKm,
    });

    if (provider.stage !== 'PROFILE_COMPLETE') {
      await this.transition(provider, 'PROFILE_COMPLETE', actor.userId);
    }

    return this.toDto(await this.reload(provider.id));
  }

  /** Change coverage without re-entering review. */
  async updateOwnCoverage(
    actor: ActorContext,
    dto: UpdateProviderCoverageDto,
  ): Promise<ProviderDto> {
    const provider = await this.requireOwn(actor);

    assertCoverageEditable(provider.stage);

    // Same rule as the profile path: a radius is a distance FROM somewhere, so it needs a base
    // either already saved or arriving in this request.
    const willHaveBase = (dto.latitude ?? provider.latitude) != null;

    if (dto.serviceRadiusKm !== undefined && !willHaveBase) {
      throw new BusinessRuleException(
        'LOCATION_REQUIRED',
        'Pick your base on the map before setting how far you will travel',
      );
    }

    await this.providers.updateCoverage(provider.id, {
      latitude: dto.latitude,
      longitude: dto.longitude,
      serviceRadiusKm: dto.serviceRadiusKm,
    });

    return this.toDto(await this.reload(provider.id));
  }

  async requestDocumentUpload(
    actor: ActorContext,
    input: { kind: string; filename: string; contentType: string },
  ) {
    const provider = await this.requireOwn(actor);

    assertEditable(provider.stage);

    return this.documents.requestUpload({
      ownerType: 'PROVIDER',
      ownerId: provider.id,
      kind: input.kind as ProviderDocumentKind,
      filename: input.filename,
      contentType: input.contentType,
      uploadedByUserId: actor.userId,
    });
  }

  /** Confirming the FIRST document advances PROFILE_COMPLETE to DOCUMENTS_SUBMITTED. */
  async confirmDocumentUpload(
    actor: ActorContext,
    documentId: string,
    sizeBytes: number,
  ): Promise<DocumentDescriptor> {
    const provider = await this.requireOwn(actor);
    const document = await this.documents.requireById(documentId);

    // Ownership: the document must belong to THIS provider.
    if (document.ownerType !== 'PROVIDER' || document.ownerId !== provider.id) {
      throw new ResourceNotFoundException('Document', documentId);
    }

    const confirmed = await this.documents.confirmUpload(documentId, sizeBytes);

    if (provider.stage === 'PROFILE_COMPLETE') {
      await this.transition(provider, 'DOCUMENTS_SUBMITTED', actor.userId);
    }

    return confirmed;
  }

  async listOwnDocuments(actor: ActorContext): Promise<DocumentDescriptor[]> {
    const provider = await this.requireOwn(actor);

    return this.documents.listFor('PROVIDER', provider.id);
  }

  async submitForReview(actor: ActorContext): Promise<ProviderDto> {
    const provider = await this.requireOwn(actor);

    await this.transition(provider, 'UNDER_REVIEW', actor.userId);

    return this.toDto(await this.reload(provider.id));
  }

  // ------------------------------------------------------------------- admin

  countByStage(): Promise<Record<string, number>> {
    return this.providers.countByStage();
  }

  async list(
    filter: { stage?: ProviderStage },
    page: { skip: number; take: number },
  ): Promise<ProviderListDto> {
    const { items, total } = await this.providers.list(filter, page);

    return { items: items.map((item) => this.toDto(item)), total };
  }

  /** Full detail for review, including stage history. */
  async findByIdDetail(providerId: string): Promise<ProviderDetailDto> {
    const provider = await this.requireById(providerId);

    return {
      ...this.toDto(provider),
      history: (await this.providers.listStageHistory(provider.id)).map((event) => ({
        ...(event.fromStage ? { fromStage: event.fromStage } : {}),
        toStage: event.toStage,
        ...(event.reason ? { reason: event.reason } : {}),
        at: event.createdAt.toISOString(),
      })),
    };
  }

  async listDocumentsFor(providerId: string): Promise<DocumentDescriptor[]> {
    const provider = await this.requireById(providerId);

    return this.documents.listFor('PROVIDER', provider.id);
  }

  /** Issues a short-lived read URL for a reviewer. */
  async createDocumentDownloadUrl(providerId: string, documentId: string): Promise<string> {
    const provider = await this.requireById(providerId);
    const document = await this.documents.requireById(documentId);

    if (document.ownerType !== 'PROVIDER' || document.ownerId !== provider.id) {
      throw new ResourceNotFoundException('Document', documentId);
    }

    return this.documents.createDownloadUrl(documentId);
  }

  async activate(providerId: string, actor: ActorContext): Promise<ProviderDto> {
    const provider = await this.requireById(providerId);

    await this.transition(provider, 'ACTIVATED', actor.userId);

    return this.toDto(await this.reload(providerId));
  }

  async reject(providerId: string, actor: ActorContext, reason: string): Promise<ProviderDto> {
    const provider = await this.requireById(providerId);

    await this.transition(provider, 'REJECTED', actor.userId, reason.trim());

    return this.toDto(await this.reload(providerId));
  }

  // ----------------------------------------------------------------- private

  /** LEVEL-2 check. */
  private async requireOwn(actor: ActorContext): Promise<ProviderWithOrganisation> {
    if (actor.organisationKind !== 'PROVIDER') {
      throw new AccessDeniedException('This account is not a provider organisation');
    }

    return this.requireByOrganisation(actor.organisationId);
  }

  private async requireByOrganisation(organisationId: string): Promise<ProviderWithOrganisation> {
    const provider = await this.providers.findByOrganisation(organisationId);

    if (!provider) {
      throw new ResourceNotFoundException('Provider profile', organisationId);
    }

    return provider;
  }

  private async requireById(id: string): Promise<ProviderWithOrganisation> {
    const provider = await this.providers.findById(id);

    if (!provider) {
      throw new ResourceNotFoundException('Provider', id);
    }

    return provider;
  }

  private async reload(id: string): Promise<ProviderWithOrganisation> {
    return this.requireById(id);
  }

  private async transition(
    provider: ProviderWithOrganisation,
    to: ProviderStage,
    actorUserId: string,
    reason?: string,
  ): Promise<void> {
    assertTransition(provider.stage, to);

    await this.providers.transition({
      id: provider.id,
      from: provider.stage,
      to,
      actorUserId,
      reason,
    });
  }

  private toDto(provider: ProviderWithOrganisation): ProviderDto {
    return {
      id: provider.id,
      organisationId: provider.organisationId,
      organisationName: provider.organisation.name,
      stage: provider.stage,
      bookable: provider.stage === BOOKABLE_STAGE,
      stageEnteredAt: provider.stageEnteredAt.toISOString(),
      ...(provider.legalName ? { legalName: provider.legalName } : {}),
      ...(provider.registrationNumber ? { registrationNumber: provider.registrationNumber } : {}),
      ...(provider.contactPhone ? { contactPhone: provider.contactPhone } : {}),
      ...(provider.addressLine ? { addressLine: provider.addressLine } : {}),
      ...(provider.city ? { city: provider.city } : {}),
      ...(provider.state ? { state: provider.state } : {}),
      ...(provider.pincode ? { pincode: provider.pincode } : {}),
      ...(provider.latitude !== null && provider.latitude !== undefined
        ? { latitude: provider.latitude }
        : {}),
      ...(provider.longitude !== null && provider.longitude !== undefined
        ? { longitude: provider.longitude }
        : {}),
      ...(provider.serviceRadiusKm !== null && provider.serviceRadiusKm !== undefined
        ? { serviceRadiusKm: provider.serviceRadiusKm }
        : {}),
      ...(provider.rejectionReason ? { rejectionReason: provider.rejectionReason } : {}),
    };
  }
}
