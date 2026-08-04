import { Injectable } from '@nestjs/common';

import { OfferingInclusion } from '../../generated/prisma/client';
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
  areaId: string;
  quantity: number;
  sort?: MatchSort;
}

@Injectable()
export class DiscoveryService {
  constructor(
    private readonly discovery: DiscoveryRepository,
    private readonly catalogue: CatalogueService,
    private readonly reputation: ReputationService,
  ) {}

  async findMatches(requirement: MatchRequirement): Promise<MatchResultsDto> {
    // Validate the requirement against the catalogue first. A retired service
    // or area should say so, not silently return zero matches — "nothing
    // available" and "you asked for something that no longer exists" are
    // different answers.
    const serviceType = await this.catalogue.requireActiveServiceType(requirement.serviceTypeId);
    await this.catalogue.requireActiveArea(requirement.areaId);

    const candidates = await this.discovery.findCandidates({
      serviceTypeId: requirement.serviceTypeId,
      areaId: requirement.areaId,
      quantity: requirement.quantity,
    });

    // One batched call for every candidate's rating. Reputation owns the
    // aggregate; Discovery only displays it. Fetching inside toMatch() would be
    // an N+1 — the reason the batch method exists at all.
    const ratings = await this.reputation.ratingsFor(
      candidates.map((candidate) => candidate.provider.id),
    );

    const matches = candidates
      .map((candidate) => this.toMatch(candidate, requirement.quantity, ratings))
      .filter((match): match is MatchDto => match !== null);

    this.sort(matches, requirement.sort ?? MatchSort.PRICE_ASC);

    return {
      quantity: requirement.quantity,
      serviceTypeName: serviceType.name,
      pricingUnit: serviceType.pricingUnit,
      matches,
      total: matches.length,
    };
  }

  private toMatch(
    candidate: MatchCandidate,
    quantity: number,
    ratings: Map<string, { average: number | null; count: number }>,
  ): MatchDto | null {
    const version = candidate.versions[0];
    const area = candidate.areas[0]?.area;

    // Defensive: the query guarantees both, but a null here would mean an
    // offering with no current price, which is a data bug rather than a match.
    if (!version || !area) {
      return null;
    }

    const included = version.inclusions;
    const city = candidate.provider.city;
    const rating = ratings.get(candidate.provider.id);

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
      matchedArea: area.name,
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
