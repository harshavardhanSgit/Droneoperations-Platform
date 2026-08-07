import { Injectable } from '@nestjs/common';

import { OfferingInclusion } from '../../generated/prisma/client';
import { BusinessRuleException } from '../../common/errors/app.exception';
import { distanceBetween, type GeoPoint } from '../../common/geo/distance';
import { CatalogueService } from '../catalogue/catalogue.service';
import { ReputationService } from '../reputation/reputation.service';
import { DiscoveryRepository, type MatchCandidate } from './discovery.repository';
import { MatchSort, type MatchDto, type MatchQueryDto, type MatchResultsDto } from './dto/discovery.dto';

const ALL_INCLUSIONS = Object.values(OfferingInclusion);

/**
 * A requirement, decoupled from HTTP.
 *
 * V2's auto-assignment will call findMatches() with one of these and rank the
 * same objects a human ranks today. That is the whole reason Discovery is its
 * own module rather than a query inside the customer-facing search feature.
 */
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

    // Validate the requirement against the catalogue. A retired service should
    // say so, not silently return zero matches — "nothing available" and "you
    // asked for something that no longer exists" are different answers. The
    // area is checked only when supplied: it no longer gates matching, and a
    // pin outside the catalogue must still return providers who can reach it.
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

    // One batched call for every candidate's rating. Reputation owns the
    // aggregate; Discovery only displays it. Fetching inside toMatch() would be
    // an N+1 — the reason the batch method exists at all.
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

  /**
   * Can this provider reach the customer's pin?
   *
   * BR13, restated: coverage is a base plus a declared range, not a list of
   * districts. Everything the provider chose is respected — they set the
   * number — and a provider missing either half has declared no coverage and
   * matches nothing.
   */
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

    // Defensive: the query guarantees a current version, and its absence would
    // mean an offering with no price — a data bug rather than a match.
    //
    // Note what is NOT checked any more: a declared area. Under radius coverage
    // a provider need not list districts at all, and gating on one here would
    // silently drop exactly the providers who adopted the new model.
    if (!version) {
      return null;
    }

    const included = version.inclusions;
    const city = candidate.provider.city;
    const rating = ratings.get(candidate.provider.id);

    // Rounded to one decimal here, not at the edge: the number that leaves this
    // service IS the published figure, so the ordering and the label can never
    // disagree about which of two providers is nearer.
    const distance = distanceBetween(origin, candidate.provider);
    const distanceKm = distance === null ? null : Math.round(distance * 10) / 10;

    return {
      offeringId: candidate.id,
      offeringVersionNumber: version.versionNumber,
      provider: {
        providerId: candidate.provider.id,
        name: candidate.provider.organisation.name,
        ...(city ? { city } : {}),
        // A provider with no reviews reports a count of 0 and no average, so
        // the UI can say "new" rather than implying a rating of zero.
        ...(rating?.average != null ? { rating: rating.average } : {}),
        ratingCount: rating?.count ?? 0,
        ...(distanceKm !== null ? { distanceKm } : {}),
      },
      price: {
        unitPriceMinor: version.unitPriceMinor,
        // Integer arithmetic throughout. Multiplying minor units by a whole
        // quantity cannot introduce a rounding error; multiplying rupees as
        // floats can.
        estimatedTotalMinor: version.unitPriceMinor * quantity,
        currency: version.currency,
        pricingUnit: version.pricingUnit,
      },
      included,
      // Stating what is NOT covered is the point. "Chemical not included" is
      // what a farmer actually needs before agreeing a price (R9).
      notIncluded: ALL_INCLUSIONS.filter((item) => !included.includes(item)),
      ...(version.minQuantity !== null ? { minQuantity: version.minQuantity } : {}),
      ...(version.notes ? { notes: version.notes } : {}),
    };
  }

  /**
   * Sorted in memory.
   *
   * LIMITATION: the price lives on a related row, so the database cannot order
   * by it without a join Prisma will not express. At tens of offerings per
   * area this is free. It stops being free somewhere in the low thousands, and
   * the fix then is a denormalised current-price column on Offering,
   * maintained on reprice — deliberately not built now, because it adds a
   * synchronisation burden to solve a problem this system does not have.
   */
  private sort(matches: MatchDto[], sort: MatchSort): void {
    if (sort === MatchSort.DISTANCE_ASC) {
      // Providers with no location sort last, exactly as unrated ones do under
      // RATING_DESC. Treating "unknown" as 0 km would put every provider who
      // never opened a map at the top of a nearest-first list.
      matches.sort((a, b) => {
        const ad = a.provider.distanceKm ?? Number.POSITIVE_INFINITY;
        const bd = b.provider.distanceKm ?? Number.POSITIVE_INFINITY;
        return ad - bd || a.price.unitPriceMinor - b.price.unitPriceMinor;
      });
      return;
    }

    if (sort === MatchSort.RATING_DESC) {
      // Unrated providers sort last rather than as zero. A new business is an
      // unknown, not a bad one, and ranking it below a single one-star review
      // would be a lie the data does not support. Price breaks ties so the
      // order is deterministic.
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
