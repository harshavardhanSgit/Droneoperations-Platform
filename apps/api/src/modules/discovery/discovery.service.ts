import { Injectable } from '@nestjs/common';

import { OfferingInclusion } from '../../generated/prisma/client';
import { coarsenOrNull } from '../../common/geo/coarsen';
import { distanceBetween, type GeoPoint } from '../../common/geo/distance';
import { CatalogueService } from '../catalogue/catalogue.service';
import { ReputationService } from '../reputation/reputation.service';
import { DiscoveryRepository, type MatchCandidate } from './discovery.repository';
import { MatchSort, type MatchDto, type MatchResultsDto } from './dto/discovery.dto';

const ALL_INCLUSIONS = Object.values(OfferingInclusion);

/** A requirement, decoupled from HTTP. */
export interface MatchRequirement {
  serviceTypeId: string;
  quantity: number;

  /** Where the work is. Required — coverage is measured from this point. */
  latitude: number;
  longitude: number;

  sort?: MatchSort;

  /** Carried through for the booking that follows; not a filter. */
  areaId?: string;
}

@Injectable()
export class DiscoveryService {
  constructor(
    private readonly discovery: DiscoveryRepository,
    private readonly catalogue: CatalogueService,
    private readonly reputation: ReputationService,
  ) {}

  async findMatches(requirement: MatchRequirement): Promise<MatchResultsDto> {
    const sort = requirement.sort ?? MatchSort.PRICE_ASC;
    const origin = { latitude: requirement.latitude, longitude: requirement.longitude };

    // Validate the requirement against the catalogue.
    const serviceType = await this.catalogue.requireActiveServiceType(requirement.serviceTypeId);

    if (requirement.areaId) {
      await this.catalogue.requireActiveArea(requirement.areaId);
    }

    const candidates = await this.discovery.findCandidates({
      serviceTypeId: requirement.serviceTypeId,
      quantity: requirement.quantity,
      latitude: requirement.latitude,
      longitude: requirement.longitude,
    });

    // One batched call for every candidate's rating.
    const ratings = await this.reputation.ratingsFor(
      candidates.map((candidate) => candidate.provider.id),
    );

    const matches = candidates
      // The exact cut. The repository's bounding box is deliberately generous,
      // so a candidate 400 km away can survive it; only the great-circle
      // distance against THIS provider's own declared range decides.
      .filter((candidate) => this.reaches(candidate, origin))
      .map((candidate) => this.toMatch(candidate, requirement.quantity, ratings, origin))
      .filter((match): match is MatchDto => match !== null);

    this.sort(matches, sort);

    return {
      quantity: requirement.quantity,
      serviceTypeName: serviceType.name,
      pricingUnit: serviceType.pricingUnit,
      matches,
      total: matches.length,
    };
  }

  /** Can this provider reach the customer's pin? */
  private reaches(candidate: MatchCandidate, origin: GeoPoint): boolean {
    const radius = candidate.provider.serviceRadiusKm;

    if (radius == null) return false;

    const distance = distanceBetween(origin, candidate.provider);

    return distance !== null && distance <= radius;
  }

  private toMatch(
    candidate: MatchCandidate,
    quantity: number,
    ratings: Map<string, { average: number | null; count: number }>,
    origin: GeoPoint | null,
  ): MatchDto | null {
    const version = candidate.versions[0];

    // Defensive: the query guarantees a current version, and its absence would mean an offering
    // with no price — a data bug rather than a match.
    if (!version) {
      return null;
    }

    const included = version.inclusions;
    const city = candidate.provider.city;
    const rating = ratings.get(candidate.provider.id);

    // Rounded to one decimal here, not at the edge: the number that leaves this service IS the
    // published figure.
    const distance = distanceBetween(origin, candidate.provider);
    const distanceKm = distance === null ? null : Math.round(distance * 10) / 10;

    // Where the map may draw them.
    const approx = coarsenOrNull(candidate.provider);

    return {
      offeringId: candidate.id,
      offeringVersionNumber: version.versionNumber,
      provider: {
        providerId: candidate.provider.id,
        name: candidate.provider.organisation.name,
        ...(city ? { city } : {}),
        // A provider with no reviews reports a count of 0 and no average, so the UI can say
        // "new" rather than implying a rating of zero.
        ...(rating?.average != null ? { rating: rating.average } : {}),
        ratingCount: rating?.count ?? 0,
        ...(distanceKm !== null ? { distanceKm } : {}),
        ...(approx ? { approxLatitude: approx.latitude, approxLongitude: approx.longitude } : {}),
      },
      price: {
        unitPriceMinor: version.unitPriceMinor,
        // Integer arithmetic throughout.
        estimatedTotalMinor: version.unitPriceMinor * quantity,
        currency: version.currency,
        pricingUnit: version.pricingUnit,
      },
      included,
      // Stating what is NOT covered is the point.
      notIncluded: ALL_INCLUSIONS.filter((item) => !included.includes(item)),
      ...(version.minQuantity !== null ? { minQuantity: version.minQuantity } : {}),
      ...(version.notes ? { notes: version.notes } : {}),
    };
  }

  /** Sorted in memory. */
  private sort(matches: MatchDto[], sort: MatchSort): void {
    if (sort === MatchSort.DISTANCE_ASC) {
      // Providers with no location sort last, exactly as unrated ones do under RATING_DESC.
      matches.sort((a, b) => {
        const ad = a.provider.distanceKm ?? Number.POSITIVE_INFINITY;
        const bd = b.provider.distanceKm ?? Number.POSITIVE_INFINITY;
        return ad - bd || a.price.unitPriceMinor - b.price.unitPriceMinor;
      });
      return;
    }

    if (sort === MatchSort.RATING_DESC) {
      // Unrated providers sort last rather than as zero.
      matches.sort((a, b) => {
        const ar = a.provider.rating ?? -1;
        const br = b.provider.rating ?? -1;
        return br - ar || a.price.unitPriceMinor - b.price.unitPriceMinor;
      });
      return;
    }

    matches.sort((a, b) =>
      sort === MatchSort.PRICE_DESC
        ? b.price.unitPriceMinor - a.price.unitPriceMinor
        : a.price.unitPriceMinor - b.price.unitPriceMinor,
    );
  }
}
