import { Injectable } from '@nestjs/common';

import { AccessDeniedException, ResourceNotFoundException } from '../../common/errors/app.exception';
import type { OrganisationKind } from '../../generated/prisma/client';
import type { OrganisationModel } from '../../generated/prisma/models';
import type { ActorContext } from '../identity/actor-context';
import type { OrganisationDto, OrganisationListDto } from './dto/organisation.dto';
import { OrganisationRepository } from './organisation.repository';

@Injectable()
export class OrganisationService {
  constructor(private readonly organisations: OrganisationRepository) {}

  /** LEVEL-2 authorisation lives here, not in a guard. */
  async findOwn(actor: ActorContext): Promise<OrganisationDto> {
    const organisation = await this.organisations.findById(actor.organisationId);

    if (!organisation) {
      throw new ResourceNotFoundException('Organisation', actor.organisationId);
    }

    return this.toDto(organisation);
  }

  async renameOwn(actor: ActorContext, name: string): Promise<OrganisationDto> {
    const organisation = await this.organisations.findById(actor.organisationId);

    if (!organisation) {
      throw new ResourceNotFoundException('Organisation', actor.organisationId);
    }

    if (organisation.status !== 'ACTIVE') {
      throw new AccessDeniedException('A suspended organisation cannot be modified');
    }

    return this.toDto(await this.organisations.updateName(organisation.id, name.trim()));
  }

  /** Platform-only. The guard has already enforced organisation:read-any. */
  async list(
    filter: { kind?: OrganisationKind },
    page: { skip: number; take: number },
  ): Promise<OrganisationListDto> {
    const { items, total } = await this.organisations.list(filter, page);

    return { items: items.map((item) => this.toDto(item)), total };
  }

  private toDto(organisation: OrganisationModel): OrganisationDto {
    return {
      id: organisation.id,
      name: organisation.name,
      kind: organisation.kind,
      type: organisation.type,
      status: organisation.status,
      createdAt: organisation.createdAt.toISOString(),
    };
  }
}
