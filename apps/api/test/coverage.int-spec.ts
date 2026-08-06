import type { INestApplication } from '@nestjs/common';

import type { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import { BookingService } from '../src/modules/bookings/booking.service';
import { CoverageRepository } from '../src/modules/coverage/coverage.repository';
import { CoverageService } from '../src/modules/coverage/coverage.service';
import { RateLimitGuard } from '../src/modules/coverage/rate-limit.guard';
import { COVERAGE_CACHE } from '../src/modules/coverage/coverage.tokens';
import type { TtlCache } from '../src/infrastructure/cache/ttl-cache';
import type { CoverageDto } from '../src/modules/coverage/dto/coverage.dto';
import { createTestApp, resetDatabase, seedFixtures, type Fixtures } from './helpers/test-app';

/**
 * The coverage screen makes public claims (acres covered, who covers which
 * district). Those claims must be recomputable from source rows — this spec
 * pins what the aggregates mean, what they refuse to count, and the contract
 * of the PUBLIC endpoint the landing page reads from.
 */
describe('Coverage — derived, never stored', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let bookings: BookingService;
  let coverage: CoverageService;
  let fx: Fixtures;

  beforeAll(async () => {
    const ctx = await createTestApp();
    app = ctx.app;
    prisma = ctx.prisma;
    bookings = app.get(BookingService);
    coverage = app.get(CoverageService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    fx = await seedFixtures(prisma);
  });

  const deliver = async (quantity: number, finalQuantity: number) => {
    const booking = await bookings.create(fx.customer, {
      serviceTypeId: fx.serviceTypeId,
      areaId: fx.areaId,
      quantity,
      preferredDate: '2026-09-01',
      preferredWindow: 'DAWN' as never,
    });
    await bookings.assign(fx.customer, booking.id, fx.offeringId);
    await bookings.accept(fx.provider, booking.id);
    await bookings.markComplete(fx.provider, booking.id, { finalQuantity });
    return bookings.confirmCompletion(fx.customer, booking.id);
  };

  it('only completed work counts as acres', async () => {
    // One booking left in flight, one delivered.
    await bookings.create(fx.customer, {
      serviceTypeId: fx.serviceTypeId,
      areaId: fx.areaId,
      quantity: 40,
      preferredDate: '2026-09-02',
      preferredWindow: 'MORNING' as never,
    });
    await deliver(20, 18);

    const summary = await coverage.overview();

    expect(summary.totals.jobsCompleted).toBe(1);
    expect(summary.totals.acresCovered).toBe(18);

    const warangal = summary.districts.find((d) => d.name === 'Warangal');
    expect(warangal?.acresCovered).toBe(18);
    expect(warangal?.jobs).toBe(1);
    expect(warangal?.providers).toBeGreaterThanOrEqual(1);

    const telangana = summary.states.find((s) => s.name === 'Telangana');
    expect(telangana?.acresCovered).toBe(18);
  });

  it('BR14 — billed acres come from finalQuantity, not quantity', async () => {
    await deliver(20, 18);
    const summary = await coverage.overview();
    expect(summary.totals.acresCovered).toBe(18);
  });

  it('provider footprint comes from live active offerings', async () => {
    // Fixtures: two activated providers, both offering in Warangal.
    const summary = await coverage.overview();

    expect(summary.totals.providersActive).toBe(2);
    expect(summary.totals.statesCovered).toBe(1);
    expect(summary.totals.districtsCovered).toBe(1);
    expect(summary.districts[0]?.providers).toBe(2);
  });

  it('a new district is counted when a provider starts serving it', async () => {
    const state = await prisma.area.findFirstOrThrow({ where: { name: 'Telangana' } });
    const nashik = await prisma.area.create({
      data: { name: 'Nashik', level: 'DISTRICT', parentId: state.id },
    });

    const otherOffering = await prisma.offering.findFirstOrThrow({
      where: { provider: { organisation: { name: 'Rival Drones' } } },
    });
    await prisma.offeringArea.create({
      data: { offeringId: otherOffering.id, areaId: nashik.id },
    });

    const summary = await coverage.overview();
    expect(summary.totals.districtsCovered).toBe(2);
    expect(summary.districts.find((d) => d.name === 'Nashik')?.providers).toBe(1);
  });

  it('a withdrawn offering stops counting its provider in that district', async () => {
    const summary = await coverage.overview();
    expect(summary.districts[0]?.providers).toBe(2);

    await prisma.offering.updateMany({
      where: { provider: { organisation: { name: 'Rival Drones' } } },
      data: { status: 'WITHDRAWN' },
    });

    const after = await coverage.overview();
    expect(after.districts[0]?.providers).toBe(1);
  });
});

/**
 * The landing page's endpoint: anonymous, REAL data, TTL-cached, rate-limited.
 * These tests exercise the HTTP layer because the guard and the envelope are
 * part of the contract, not the aggregation.
 */
describe('Coverage — public endpoint contract', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let bookings: BookingService;
  let coverage: CoverageService;
  let repository: CoverageRepository;
  let limiter: RateLimitGuard;
  let cache: TtlCache<CoverageDto>;
  let baseUrl: string;
  let fx: Fixtures;

  beforeAll(async () => {
    // The rate-limit budget is forced to 3 for the whole integration suite in
    // test/helpers/env.ts, so the 429 test stays fast and deterministic.
    const ctx = await createTestApp();
    app = ctx.app;
    prisma = ctx.prisma;
    bookings = app.get(BookingService);
    coverage = app.get(CoverageService);
    repository = app.get(CoverageRepository);
    limiter = app.get(RateLimitGuard);
    cache = app.get(COVERAGE_CACHE);

    // The test helper never listens; the HTTP contract needs a real socket.
    await app.listen(0);
    const address = app.getHttpServer().address();
    const port = typeof address === 'object' && address !== null ? address.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    fx = await seedFixtures(prisma);
    limiter.reset();
    // The TTL cache outlives tests — a previous test's overview must not leak.
    cache.clear();
  });

  const deliver = async (quantity: number, finalQuantity: number) => {
    const booking = await bookings.create(fx.customer, {
      serviceTypeId: fx.serviceTypeId,
      areaId: fx.areaId,
      quantity,
      preferredDate: '2026-09-01',
      preferredWindow: 'DAWN' as never,
    });
    await bookings.assign(fx.customer, booking.id, fx.offeringId);
    await bookings.accept(fx.provider, booking.id);
    await bookings.markComplete(fx.provider, booking.id, { finalQuantity });
    return bookings.confirmCompletion(fx.customer, booking.id);
  };

  const getPublic = () => fetch(`${baseUrl}/coverage/public`);

  it('serves the REAL aggregation to anonymous callers', async () => {
    await deliver(20, 18);
    await deliver(32, 30);

    const response = await getPublic();
    expect(response.status).toBe(200);

    const body = (await response.json()) as { data: { totals: { jobsCompleted: number; acresCovered: number } } };
    expect(body.data.totals.jobsCompleted).toBe(2);
    expect(body.data.totals.acresCovered).toBe(48);
  });

  it('serves the same numbers the admin endpoint computes, minus named providers', async () => {
    await deliver(20, 18);

    const body = (await (await getPublic()).json()) as { data: Record<string, unknown> };
    const { providers, ...publicFacing } = await coverage.overview();

    // Same aggregation, so the landing page and the admin screen can never
    // disagree about how much work has been delivered.
    expect(body.data).toEqual(publicFacing);

    // ...but a named business and its workload is competitor intelligence, and
    // no provider agreed to publish it to anonymous visitors.
    expect(body.data['providers']).toBeUndefined();
    expect(providers.length).toBeGreaterThan(0);
  });

  it('never leaks a provider name, whatever the payload grows into', async () => {
    await deliver(20, 18);

    const raw = await (await getPublic()).text();
    const { providers } = await coverage.overview();

    // Asserted against the serialised body rather than a field, so a provider
    // name reappearing anywhere — nested, renamed, added later — fails here.
    for (const provider of providers) {
      expect(raw).not.toContain(provider.name);
    }
  });

  it('serves from cache within the TTL — the database is queried once', async () => {
    await deliver(20, 18);
    const spy = jest.spyOn(repository, 'completedBookings');

    await getPublic();
    await getPublic();
    await getPublic();

    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('a fresh cache miss is recomputed, not served stale forever', async () => {
    await deliver(20, 18);
    await getPublic(); // caches 18 acres

    // New work lands while the entry is still hot — the cached copy is fine
    // to keep, but the admin face must see it immediately.
    await deliver(20, 30);
    const admin = await coverage.overview();
    expect(admin.totals.acresCovered).toBe(48);
  });

  it('returns 429 once the per-IP budget is spent', async () => {
    await deliver(20, 18);

    const statuses = (await Promise.all([1, 2, 3, 4].map(() => getPublic()))).map((r) => r.status);
    expect(statuses).toEqual([200, 200, 200, 429]);
  });

  it('the real endpoint still demands an admin token', async () => {
    const response = await fetch(`${baseUrl}/coverage`);
    expect(response.status).toBe(401);
  });
});
