import { Injectable } from '@nestjs/common';

import type {
  OfferingModel,
  OfferingVersionModel,
  OrganisationModel,
  ProviderModel,
  ServiceTypeModel,
} from '../../generated/prisma/models';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

/** The largest radius a provider may declare (UpdateProviderProfileDto caps it). */
const MAX_SERVICE_RADIUS_KM = 500;

/** A latitude/longitude box that certainly contains every point within `km`. */
function boundingBox(latitude: number, longitude: number, km: number) {
  const latDelta = km / 111; // a degree of latitude is ~111 km everywhere

  // Degrees of longitude shrink towards the poles.
  const cos = Math.max(0.01, Math.cos((latitude * Math.PI) / 180));
  const lonDelta = km / (111 * cos);

  return {
    minLat: latitude - latDelta,
    maxLat: latitude + latDelta,
    minLon: longitude - lonDelta,
    maxLon: longitude + lonDelta,
  };
}

export type MatchCandidate = OfferingModel & {
  serviceType: ServiceTypeModel;
  provider: ProviderModel & { organisation: OrganisationModel };
  versions: OfferingVersionModel[];
};

@Injectable()
export class DiscoveryRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Every filter here is a business rule, not an optimisation: provider.stage = ACTIVATED BR1 —
   * only an activated provider is bookable organisation.status = ACTIVE a suspended org
   * disappears.
   */
  findCandidates(input: {
    serviceTypeId: string;
    quantity: number;
    latitude: number;
    longitude: number;
  }): Promise<MatchCandidate[]> {
    const box = boundingBox(input.latitude, input.longitude, MAX_SERVICE_RADIUS_KM);

    return this.prisma.offering.findMany({
      where: {
        status: 'ACTIVE',
        serviceTypeId: input.serviceTypeId,
        provider: {
          stage: 'ACTIVATED',
          organisation: { status: 'ACTIVE' },
          // A provider without a base or a declared range has stated no coverage, so there is
          // nothing to match against.
          latitude: { gte: box.minLat, lte: box.maxLat },
          longitude: { gte: box.minLon, lte: box.maxLon },
          serviceRadiusKm: { not: null },
        },
        versions: {
          some: {
            effectiveTo: null,
            // A null minimum means "no minimum".
            OR: [{ minQuantity: null }, { minQuantity: { lte: input.quantity } }],
          },
        },
      },
      include: {
        serviceType: true,
        provider: { include: { organisation: true } },
        versions: { where: { effectiveTo: null } },
        // No `areas` join. It gated matching until coverage became a radius,
        // and nothing downstream reads it now — leaving it would be a join per
        // search for data no caller uses. OfferingArea itself stays: the
        // provider's services screen still edits it, and the coverage map
        // still has a use for declared districts.
      },
    });
  }
}
