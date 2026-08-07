import { Injectable } from '@nestjs/common';

import type {
  OfferingModel,
  OfferingVersionModel,
  OrganisationModel,
  ProviderModel,
  ServiceTypeModel,
} from '../../generated/prisma/models';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

/**
 * The largest radius a provider may declare (UpdateProviderProfileDto caps it).
 * Nobody can reach further than this, so nobody outside a box this big can be a
 * candidate — which is what makes the prefilter safe.
 */
const MAX_SERVICE_RADIUS_KM = 500;

/**
 * A latitude/longitude box that certainly contains every point within `km`.
 *
 * Postgres cannot compute a great-circle distance without PostGIS or
 * earthdistance, and neither is installed. So the database narrows with a cheap
 * indexable box and the service does the exact haversine on what comes back —
 * the box is deliberately GENEROUS, because a box that is too small silently
 * loses real matches while one that is too large only costs a few rows.
 *
 * LIMITATION: fine at hundreds of offerings. At thousands, this becomes a real
 * spatial index — the same trade already documented for in-memory sorting.
 */
function boundingBox(latitude: number, longitude: number, km: number) {
  const latDelta = km / 111; // a degree of latitude is ~111 km everywhere

  // Degrees of longitude shrink towards the poles. The cosine guard keeps the
  // box from collapsing to zero near them, which would drop every candidate.
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
   * Every filter here is a business rule, not an optimisation:
   *
   *   provider.stage = ACTIVATED        BR1 — only an activated provider is bookable
   *   organisation.status = ACTIVE      a suspended org disappears from the market
   *   offering.status = ACTIVE          withdrawn offerings stay for history, not sale
   *   provider within the box           BR13 — coverage is a base plus a radius,
   *                                     so the exact cut is a distance, done in
   *                                     the service; this box only narrows rows
   *   version.effectiveTo = null        only the price currently in force
   *   minQuantity <= quantity           respect the provider's minimum job size
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
          // A provider without a base or a declared range has stated no
          // coverage, so there is nothing to match against. Silent absence is
          // correct: guessing a range would send them work they never accepted.
          latitude: { gte: box.minLat, lte: box.maxLat },
          longitude: { gte: box.minLon, lte: box.maxLon },
          serviceRadiusKm: { not: null },
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
        // No `areas` join. It gated matching until coverage became a radius,
        // and nothing downstream reads it now — leaving it would be a join per
        // search for data no caller uses. OfferingArea itself stays: the
        // provider's services screen still edits it, and the coverage map
        // still has a use for declared districts.
      },
    });
  }
}
