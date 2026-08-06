import { Inject, Injectable } from '@nestjs/common';

import type { TtlCache } from '../../infrastructure/cache/ttl-cache';
import type { AreaModel } from '../../generated/prisma/models';
import { COVERAGE_CACHE, COVERAGE_CACHE_KEY } from './coverage.tokens';
import { CoverageRepository } from './coverage.repository';
import type {
  CoverageDistrictDto,
  CoverageDto,
  CoverageProviderDto,
  CoverageStateDto,
  PublicCoverageDto,
} from './dto/coverage.dto';

type AreaWithParent = AreaModel & {
  parent?: (AreaModel & { parent?: AreaModel | null }) | null;
};

type DistrictKey = { id: string; name: string; state: string };
type DistrictAcc = DistrictKey & {
  acres: number;
  jobs: number;
  providers: Set<string>;
};
type StateAcc = { name: string; acres: number; jobs: number; providers: Set<string> };
type ProviderAcc = { name: string; acres: number; jobs: number; drones: number };

@Injectable()
export class CoverageService {
  constructor(
    private readonly repository: CoverageRepository,
    @Inject(COVERAGE_CACHE) private readonly cache: TtlCache<PublicCoverageDto>,
  ) {}

  /**
   * Resolves any area to its DISTRICT for roll-up purposes. Talukas fold into
   * their district; a state-level area has no district row, so it contributes
   * to the state total but not the district list.
   */
  private districtOf(area: AreaWithParent): DistrictKey | null {
    if (area.level === 'DISTRICT') {
      return { id: area.id, name: area.name, state: area.parent?.name ?? 'Unknown' };
    }
    if (area.level === 'TALUKA' && area.parent?.level === 'DISTRICT') {
      return {
        id: area.parent.id,
        name: area.parent.name,
        state: area.parent.parent?.name ?? 'Unknown',
      };
    }
    return null;
  }

  /** The STATE a booking or offering area belongs to, if one is reachable. */
  private stateOf(area: AreaWithParent): string | null {
    if (area.level === 'STATE') return area.name;
    if (area.level === 'DISTRICT') return area.parent?.name ?? null;
    if (area.level === 'TALUKA') {
      if (area.parent?.level === 'DISTRICT') return area.parent.parent?.name ?? null;
      if (area.parent?.level === 'STATE') return area.parent.name;
    }
    return null;
  }

  /**
   * The public face of the SAME aggregation. TTL-cached so anonymous page
   * loads never hammer the database; the admin endpoint calls overview()
   * directly and always gets fresh numbers. Both endpoints share one code
   * path, so the landing page and the admin screen can never drift.
   */
  async publicOverview(): Promise<PublicCoverageDto> {
    const cached = this.cache.get(COVERAGE_CACHE_KEY);
    if (cached) return cached;

    // Destructured away, not deleted after the fact: `providers` never enters
    // the cached object, so the cache itself holds nothing private. If it were
    // ever dumped or shared, there would be no named business in it.
    const { providers: _staffOnly, ...publicFacing } = await this.overview();

    this.cache.set(COVERAGE_CACHE_KEY, publicFacing);
    return publicFacing;
  }

  async overview(): Promise<CoverageDto> {
    const [bookings, offerings, providers] = await Promise.all([
      this.repository.completedBookings(),
      this.repository.activeOfferings(),
      this.repository.activeProviders(),
    ]);

    const districts = new Map<string, DistrictAcc>();
    const states = new Map<string, StateAcc>();
    const providerStats = new Map<string, ProviderAcc>();

    providers.forEach((p) => {
      providerStats.set(p.id, {
        name: p.organisation.name,
        acres: 0,
        jobs: 0,
        drones: p.drones.length,
      });
    });

    const ensureDistrict = (key: DistrictKey): DistrictAcc => {
      const existing = districts.get(key.id);
      if (existing) return existing;
      const fresh: DistrictAcc = { ...key, acres: 0, jobs: 0, providers: new Set() };
      districts.set(key.id, fresh);
      return fresh;
    };

    const ensureState = (name: string): StateAcc => {
      const existing = states.get(name);
      if (existing) return existing;
      const fresh: StateAcc = { name, acres: 0, jobs: 0, providers: new Set() };
      states.set(name, fresh);
      return fresh;
    };

    // Delivered work: the acres a map may truthfully claim. Only PER_ACRE
    // bookings produce an acre count — a survey in square kilometres is work,
    // but it is not acres covered, and conflating them is how dashboards lie.
    for (const booking of bookings) {
      const acres =
        booking.pricingUnit === 'PER_ACRE'
          ? booking.finalQuantity ?? booking.quantity
          : 0;
      const providerId = booking.offeringVersion?.offering.providerId;

      const district = this.districtOf(booking.area);
      if (district) {
        const acc = ensureDistrict(district);
        acc.acres += acres;
        acc.jobs += 1;
        if (providerId) acc.providers.add(providerId);
      }

      const stateName = this.stateOf(booking.area);
      if (stateName) {
        const acc = ensureState(stateName);
        acc.acres += acres;
        acc.jobs += 1;
        if (providerId) acc.providers.add(providerId);
      }

      if (providerId) {
        const acc = providerStats.get(providerId);
        if (acc) {
          acc.acres += acres;
          acc.jobs += 1;
        }
      }
    }

    // Live footprint: where providers say they will take work today.
    for (const offering of offerings) {
      for (const { area } of offering.areas) {
        const district = this.districtOf(area);
        if (district) ensureDistrict(district).providers.add(offering.providerId);

        const stateName = this.stateOf(area);
        if (stateName) ensureState(stateName).providers.add(offering.providerId);
      }
    }

    const toState = (acc: StateAcc): CoverageStateDto => ({
      name: acc.name,
      acresCovered: acc.acres,
      jobs: acc.jobs,
      providers: acc.providers.size,
    });

    const toDistrict = (acc: DistrictAcc): CoverageDistrictDto => ({
      id: acc.id,
      name: acc.name,
      state: acc.state,
      acresCovered: acc.acres,
      jobs: acc.jobs,
      providers: acc.providers.size,
    });

    const toProvider = (acc: ProviderAcc): CoverageProviderDto => ({
      name: acc.name,
      acresCovered: acc.acres,
      jobs: acc.jobs,
      drones: acc.drones,
    });

    const statesList = [...states.values()].map(toState).sort((a, b) => b.acresCovered - a.acresCovered);
    const districtsList = [...districts.values()]
      .map(toDistrict)
      .sort((a, b) => b.acresCovered - a.acresCovered);
    const providersList = [...providerStats.values()]
      .map(toProvider)
      .sort((a, b) => b.acresCovered - a.acresCovered);

    return {
      totals: {
        acresCovered: statesList.reduce((sum, s) => sum + s.acresCovered, 0),
        jobsCompleted: statesList.reduce((sum, s) => sum + s.jobs, 0),
        providersActive: providers.length,
        dronesServiceable: providers.reduce((sum, p) => sum + p.drones.length, 0),
        statesCovered: statesList.length,
        districtsCovered: districtsList.length,
      },
      states: statesList,
      districts: districtsList,
      providers: providersList,
    };
  }
}
