import { Injectable } from '@nestjs/common';

import { AccessDeniedException } from '../../common/errors/app.exception';
import { CatalogueService } from '../catalogue/catalogue.service';
import type { ActorContext } from '../identity/actor-context';
import { CustomerRepository, type CustomerProfileWithArea } from './customer.repository';
import type { CustomerProfileDto, UpdateCustomerProfileDto } from './dto/customer.dto';

/** The buyer's saved preferences. */
@Injectable()
export class CustomerService {
  constructor(
    private readonly customers: CustomerRepository,
    private readonly catalogue: CatalogueService,
  ) {}

  async findOwn(actor: ActorContext): Promise<CustomerProfileDto> {
    this.requireCustomer(actor);

    return this.toDto(await this.customers.findByOrganisation(actor.organisationId));
  }

  async updateOwn(
    actor: ActorContext,
    dto: UpdateCustomerProfileDto,
  ): Promise<CustomerProfileDto> {
    this.requireCustomer(actor);

    // Validated against the catalogue rather than trusted: a retired district saved as a
    // default would fail later, at booking time, where the customer has no idea why.
    if (dto.defaultAreaId) {
      await this.catalogue.requireActiveArea(dto.defaultAreaId);
    }

    const saved = await this.customers.save(actor.organisationId, {
      latitude: dto.latitude,
      longitude: dto.longitude,
      // Trimmed to null rather than "" so "cleared" is one value in the column, not two that
      // every reader has to know about.
      locationLabel:
        dto.locationLabel === undefined ? undefined : dto.locationLabel?.trim() || null,
      defaultAreaId: dto.defaultAreaId,
    });

    return this.toDto(saved);
  }

  /** LEVEL-2 check. */
  private requireCustomer(actor: ActorContext): void {
    if (actor.organisationKind !== 'CUSTOMER') {
      throw new AccessDeniedException('This account is not a customer organisation');
    }
  }

  private toDto(profile: CustomerProfileWithArea | null): CustomerProfileDto {
    if (!profile) return {};

    return {
      ...(profile.latitude !== null ? { latitude: profile.latitude } : {}),
      ...(profile.longitude !== null ? { longitude: profile.longitude } : {}),
      ...(profile.locationLabel ? { locationLabel: profile.locationLabel } : {}),
      ...(profile.defaultAreaId ? { defaultAreaId: profile.defaultAreaId } : {}),
      ...(profile.defaultArea ? { defaultAreaName: profile.defaultArea.name } : {}),
      ...(profile.defaultArea?.parentId
        ? { defaultAreaParentId: profile.defaultArea.parentId }
        : {}),
    };
  }
}
