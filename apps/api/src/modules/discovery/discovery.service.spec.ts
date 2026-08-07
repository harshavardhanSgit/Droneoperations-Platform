import { Test } from '@nestjs/testing';

import { CatalogueService } from '../catalogue/catalogue.service';
import { ReputationService } from '../reputation/reputation.service';
import { DiscoveryRepository, type MatchCandidate } from './discovery.repository';
import { DiscoveryService } from './discovery.service';
import { MatchSort } from './dto/discovery.dto';

/**
 * BR13, as it now reads: a provider covers a base plus a declared travel
 * radius, and discovery returns everyone whose own radius reaches the pin.
 *
 * These are the rules that used to be a district join. Losing them silently is
 * the failure mode worth guarding — a broken radius filter does not throw, it
 * just quietly returns the wrong providers, which looks like a working search.
 *
 * No database: the repository's bounding box is deliberately generous and does
 * NOT decide anything, so a candidate 400 km away is a legitimate input here.
 */

// Warangal. Every distance below is measured from this point.
const PIN = { latitude: 17.9689, longitude: 79.5941 };

// Khammam, ~100 km south-east of the pin by great circle.
const KHAMMAM = { latitude: 17.2473, longitude: 80.1514 };

// Guntur, ~205 km south — reachable, but only by a provider who says so.
const GUNTUR = { latitude: 16.3067, longitude: 80.4365 };

const candidate = (
  id: string,
  provider: { latitude: number | null; longitude: number | null; serviceRadiusKm: number | null },
): MatchCandidate =>
  ({
    id,
    versions: [
      {
        versionNumber: 1,
        unitPriceMinor: 50000,
        currency: 'INR',
        pricingUnit: 'PER_ACRE',
        inclusions: [],
        minQuantity: null,
        notes: null,
      },
    ],
    provider: {
      id: `prov-${id}`,
      city: 'Somewhere',
      organisation: { name: `Org ${id}` },
      ...provider,
    },
  }) as unknown as MatchCandidate;

describe('DiscoveryService — radius coverage', () => {
  let service: DiscoveryService;
  let findCandidates: jest.Mock;

  const setup = async (candidates: MatchCandidate[]) => {
    findCandidates = jest.fn().mockResolvedValue(candidates);

    const moduleRef = await Test.createTestingModule({
      providers: [
        DiscoveryService,
        { provide: DiscoveryRepository, useValue: { findCandidates } },
        {
          provide: CatalogueService,
          useValue: {
            requireActiveServiceType: jest
              .fn()
              .mockResolvedValue({ name: 'Crop spraying', pricingUnit: 'PER_ACRE' }),
            requireActiveArea: jest.fn().mockResolvedValue({ id: 'area-1' }),
          },
        },
        { provide: ReputationService, useValue: { ratingsFor: jest.fn().mockResolvedValue(new Map()) } },
      ],
    }).compile();

    service = moduleRef.get(DiscoveryService);
  };

  const search = (overrides: Record<string, unknown> = {}) =>
    service.findMatches({ serviceTypeId: 'svc-1', quantity: 20, ...PIN, ...overrides });

  it('includes a provider whose radius reaches the pin', async () => {
    await setup([candidate('a', { ...KHAMMAM, serviceRadiusKm: 120 })]);

    const results = await search();

    expect(results.matches.map((m) => m.offeringId)).toEqual(['a']);
  });

  it('excludes a provider whose radius falls short', async () => {
    // Same provider, same distance — only the number they declared differs.
    // This is the whole feature: the provider decides their own range.
    await setup([candidate('a', { ...KHAMMAM, serviceRadiusKm: 40 })]);

    expect((await search()).matches).toHaveLength(0);
  });

  it('excludes a provider who has declared no radius', async () => {
    // Null is "not stated yet", never "unlimited". Guessing a range would send
    // a business work it never agreed to travel for.
    await setup([candidate('a', { ...KHAMMAM, serviceRadiusKm: null })]);

    expect((await search()).matches).toHaveLength(0);
  });

  it('excludes a provider with a radius but no base', async () => {
    // A distance from nowhere. Belt and braces: the provider service refuses to
    // save this combination, but discovery must not depend on that holding.
    await setup([candidate('a', { latitude: null, longitude: null, serviceRadiusKm: 200 })]);

    expect((await search()).matches).toHaveLength(0);
  });

  it('does not filter on the district, even when one is supplied', async () => {
    // areaId rides along for the booking that follows. If it ever reached the
    // repository as a filter again, this assertion is what would catch it.
    await setup([candidate('a', { ...KHAMMAM, serviceRadiusKm: 120 })]);

    const results = await search({ areaId: 'area-elsewhere' });

    expect(results.matches).toHaveLength(1);
    expect(findCandidates).toHaveBeenCalledWith(
      expect.not.objectContaining({ areaId: expect.anything() }),
    );
  });

  it('reports the distance it matched on, rounded to a tenth', async () => {
    await setup([candidate('a', { ...KHAMMAM, serviceRadiusKm: 120 })]);

    const distance = (await search()).matches[0]?.provider.distanceKm;

    expect(distance).toBeGreaterThan(95);
    expect(distance).toBeLessThan(105);
    expect(distance).toBeCloseTo(Math.round((distance ?? 0) * 10) / 10, 10);
  });

  it('never leaks the provider’s own coordinates', async () => {
    // "100 km away" is a far smaller disclosure than a business's exact base,
    // and nothing on the customer's side needs the raw point.
    await setup([candidate('a', { ...KHAMMAM, serviceRadiusKm: 120 })]);

    const payload = JSON.stringify((await search()).matches);

    expect(payload).not.toContain(String(KHAMMAM.latitude));
    expect(payload).not.toContain(String(KHAMMAM.longitude));
  });

  it('sorts nearest first, cheapest breaking the tie', async () => {
    await setup([
      candidate('far', { ...GUNTUR, serviceRadiusKm: 300 }),
      candidate('near', { ...KHAMMAM, serviceRadiusKm: 120 }),
    ]);

    const results = await search({ sort: MatchSort.DISTANCE_ASC });

    expect(results.matches.map((m) => m.offeringId)).toEqual(['near', 'far']);
  });
});
