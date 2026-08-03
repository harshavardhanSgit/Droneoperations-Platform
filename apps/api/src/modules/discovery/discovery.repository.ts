import { Injectable } from '@nestjs/common';

import type {
  AreaModel,
  OfferingModel,
  OfferingVersionModel,
  OrganisationModel,
  ProviderModel,
  ServiceTypeModel,
} from '../../generated/prisma/models';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

export type MatchCandidate = OfferingModel & {
  serviceType: ServiceTypeModel;
  provider: ProviderModel & { organisation: OrganisationModel };
  versions: OfferingVersionModel[];
  areas: { area: AreaModel }[];
};

@Injectable()
export class DiscoveryRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Every filter here is a business rule, not an optimisation:
   *
   *   provider.stage = ACTIVATED        BR1 — only an activated provider is bookable
   *   organisation.status = ACTIVE      a suspended org disappears from the market
   *   offering.status = ACTIVE          withdrawn offerings stay for history, not sale
   *   areas.some(areaId)                BR13 — must serve the requested area
   *   version.effectiveTo = null        only the price currently in force
   *   minQuantity <= quantity           respect the provider's minimum job size
   */
  findCandidates(input: {
    serviceTypeId: string;
    areaId: string;
    quantity: number;
  }): Promise<MatchCandidate[]> {
    return this.prisma.offering.findMany({
      where: {
        status: 'ACTIVE',
        serviceTypeId: input.serviceTypeId,
        areas: { some: { areaId: input.areaId } },
        provider: {
          stage: 'ACTIVATED',
          organisation: { status: 'ACTIVE' },
        },
        versions: {
          some: {
            effectiveTo: null,
            // A null minimum means "no minimum". Without this OR, Prisma's
            // `lte` silently excludes every offering that never set one.
            OR: [{ minQuantity: null }, { minQuantity: { lte: input.quantity } }],
          },
        },
      },
      include: {
        serviceType: true,
        provider: { include: { organisation: true } },
        versions: { where: { effectiveTo: null } },
        areas: { where: { areaId: input.areaId }, include: { area: true } },
      },
    });
  }
}
