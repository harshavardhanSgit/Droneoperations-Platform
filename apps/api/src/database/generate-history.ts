import 'dotenv/config';

import { NestFactory } from '@nestjs/core';

import { AppModule } from '../app.module';
import type { PaymentMethod, TimeWindow } from '../generated/prisma/client';
import { PrismaService } from '../infrastructure/prisma/prisma.service';
import { BookingService } from '../modules/bookings/booking.service';
import type { ActorContext } from '../modules/identity/actor-context';
import { ReputationService } from '../modules/reputation/reputation.service';
import { SettlementService } from '../modules/settlement/settlement.service';

/**
 * The landing page shows REAL data now — which means the database needs a
 * believable operating history. This module generates one, with two halves:
 *
 *  1. A PURE, deterministic planner (generateHistoryPlan) — given the
 *     activated marketplace and a seed, it produces the same ~415-job story
 *     every time. Pure means it is unit-testable without a database.
 *
 *  2. An executor (generateHistory) — bootstraps the real application and
 *     drives every booking through the REAL BookingService
 *     (create -> assign -> accept -> markComplete -> confirmCompletion), then
 *     SettlementService for payments and ReputationService for reviews. Every
 *     state-machine transition and event is therefore genuine — this is
 *     operating history, not inserts masquerading as it.
 *
 * Idempotency: history bookings are BACKDATED up to a year. If any completed
 * booking older than a month exists, the database has already been through
 * this seed, so a re-run skips. Smoke-test bookings are created today, so
 * they never trip the marker.
 *
 * Known limitation, accepted for a dev seed: the marker is the existence of
 * backdated COMPLETED work, not a fingerprint of the plan. A seed that fails
 * halfway is therefore never "healed" to the full 300-completed target, and a
 * run that failed after creating only cancelled/in-flight rows could duplicate
 * those on re-run. The seed throws on any failure, so this is visible.
 */

// --------------------------------------------------------------- the planner

export type IntentStatus = 'COMPLETED' | 'CANCELLED' | 'IN_FLIGHT';
export type InFlightStage = 'ASSIGNED' | 'SCHEDULED' | 'AWAITING_CONFIRMATION';

export interface GenProvider {
  providerId: string;
  offeringId: string;
  minQuantity: number;
  districts: Array<{ id: string; weight: number }>;
}

export interface GenCustomer {
  organisationId: string;
  userId: string;
  membershipId: string;
}

export interface GenCatalogue {
  serviceTypeId: string;
  providers: GenProvider[];
  customers: GenCustomer[];
}

export interface BookingIntent {
  status: IntentStatus;
  /** For IN_FLIGHT: how far the job got before being left there. */
  inFlightStage?: InFlightStage;
  providerId: string;
  offeringId: string;
  areaId: string;
  quantity: number;
  /** What was actually delivered (BR14) — completed and awaiting-confirmation only. */
  finalQuantity?: number;
  /** Days before today the work happened. Bigger = older. */
  serviceDaysAgo: number;
  /** Days before today the customer booked. Always > serviceDaysAgo. */
  bookedDaysAgo: number;
  window: TimeWindow;
  /** Completed-only enrichment. */
  paid?: boolean;
  method?: PaymentMethod;
  paidDaysAfter?: number;
  rating?: number;
  comment?: string;
  /** Cancelled-only. */
  reason?: string;
}

export interface HistoryPlan {
  bookings: BookingIntent[];
}

export const HISTORY_TARGETS = {
  completed: 300,
  cancelled: 60,
  inFlight: 55,
} as const;

/** A booking older than this proves the history seed has run before. */
const HISTORY_MARKER_DAYS = 30;
const MIN_FLEET = 3;

const DISTRICT_WEIGHTS: Record<string, number> = {
  Warangal: 1.7,
  Guntur: 1.5,
  Nashik: 1.4,
  Khammam: 1.2,
  Nizamabad: 1.15,
  Krishna: 1.1,
  Karimnagar: 1.1,
  'West Godavari': 1.1,
  Jalgaon: 1.05,
  Ahmednagar: 1.0,
  Medak: 1.0,
  Kurnool: 1.0,
  Anantapur: 0.95,
  Nalgonda: 0.9,
  Solapur: 0.9,
};

/** Spraying happens at dawn and morning; evening is the niche. */
const WINDOWS: Array<[TimeWindow, number]> = [
  ['DAWN', 0.35],
  ['MORNING', 0.45],
  ['EVENING', 0.2],
];

const CANCEL_REASONS = [
  'Crop was harvested earlier than expected',
  'Heavy rain forecast for the week',
  'Switched to a different treatment',
  'Land was handed over before the spray date',
  'Farmer could not arrange water for the mix',
] as const;

const REVIEW_COMMENTS = [
  'Smooth service — the team arrived on time.',
  'Excellent spraying, the fields look clean.',
  'Professional crew and clear communication throughout.',
  'Very satisfied with the outcome.',
  'Good quality work at a fair price.',
  'Careful near the boundary, nothing damaged.',
  'Done exactly as promised, no surprises.',
  'Fast turnaround, will book again.',
  'Clear pricing from the start.',
  'Held up well through the kharif rush.',
] as const;

const PAYMENT_METHODS = ['UPI', 'BANK_TRANSFER', 'CASH', 'CHEQUE'] as const;
const DAY_MS = 86_400_000;

/** Deterministic PRNG — same seed, same story, every time. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function weightedPick<T>(items: T[], weights: number[], rng: () => number): T {
  const total = weights.reduce((sum, w) => sum + w, 0);
  let r = rng() * total;
  for (let i = 0; i < items.length; i += 1) {
    r -= weights[i]!;
    if (r <= 0) return items[i]!;
  }
  return items[items.length - 1]!;
}

/** Bigger providers (more districts) win more jobs, like the real market. */
function providerWeight(provider: GenProvider): number {
  return 1 + 0.5 * Math.max(0, provider.districts.length - 1);
}

/** 5–60 acres, skewed small — most farms are small farms. */
function sampleQuantity(rng: () => number, minQuantity: number): number {
  const q = 5 + Math.pow(rng(), 1.8) * 55;
  return Math.min(60, Math.max(minQuantity, Math.round(q)));
}

/**
 * A service date in the last year, weighted towards the kharif season
 * (June–October) when spraying demand peaks.
 */
function sampleServiceDaysAgo(rng: () => number, nowMs: number): number {
  for (;;) {
    const daysAgo = 1 + Math.floor(rng() * 365);
    const month = new Date(nowMs - daysAgo * DAY_MS).getMonth() + 1;
    const kharif = month >= 6 && month <= 10;
    if (kharif || rng() < 0.45) return daysAgo;
  }
}

export function generateHistoryPlan(
  catalogue: GenCatalogue,
  seed = 2026,
  nowMs: number = Date.now(),
): HistoryPlan {
  const bookings: BookingIntent[] = [];

  if (catalogue.providers.length === 0 || catalogue.customers.length === 0) {
    return { bookings };
  }

  const rng = mulberry32(seed);
  const pickProvider = () => weightedPick(catalogue.providers, catalogue.providers.map(providerWeight), rng);
  const pickDistrict = (provider: GenProvider) =>
    weightedPick(
      provider.districts,
      provider.districts.map((d) => d.weight),
      rng,
    );
  const pickWindow = () => weightedPick(WINDOWS.map(([w]) => w), WINDOWS.map(([, weight]) => weight), rng);

  // A completed job is booked 2–14 days ahead of the service date.
  const schedule = () => {
    const serviceDaysAgo = sampleServiceDaysAgo(rng, nowMs);
    const bookedDaysAgo = serviceDaysAgo + 2 + Math.floor(rng() * 13);
    return { serviceDaysAgo, bookedDaysAgo };
  };

  for (let i = 0; i < HISTORY_TARGETS.completed; i += 1) {
    const provider = pickProvider();
    const area = pickDistrict(provider);
    const quantity = sampleQuantity(rng, provider.minQuantity);
    const finalQuantity = rng() < 0.7 ? quantity : Math.max(1, quantity - (1 + Math.floor(rng() * 3)));

    const intent: BookingIntent = {
      status: 'COMPLETED',
      providerId: provider.providerId,
      offeringId: provider.offeringId,
      areaId: area.id,
      quantity,
      finalQuantity,
      window: pickWindow(),
      ...schedule(),
    };

    if (rng() < 0.8) {
      intent.paid = true;
      intent.method = PAYMENT_METHODS[Math.floor(rng() * PAYMENT_METHODS.length)];
      intent.paidDaysAfter = 1 + Math.floor(rng() * 7);
    }

    if (rng() < 0.6) {
      intent.rating = 3 + Math.floor(rng() * 3);
      if (rng() < 0.8) intent.comment = REVIEW_COMMENTS[Math.floor(rng() * REVIEW_COMMENTS.length)];
    }

    bookings.push(intent);
  }

  for (let i = 0; i < HISTORY_TARGETS.cancelled; i += 1) {
    const provider = pickProvider();
    const area = pickDistrict(provider);
    const quantity = sampleQuantity(rng, provider.minQuantity);
    const { serviceDaysAgo } = schedule();
    // Cancellations happen close to the booked date, usually before service.
    const bookedDaysAgo = serviceDaysAgo + 1 + Math.floor(rng() * 7);

    bookings.push({
      status: 'CANCELLED',
      providerId: provider.providerId,
      offeringId: provider.offeringId,
      areaId: area.id,
      quantity,
      window: pickWindow(),
      serviceDaysAgo,
      bookedDaysAgo,
      reason: CANCEL_REASONS[Math.floor(rng() * CANCEL_REASONS.length)],
    });
  }

  for (let i = 0; i < HISTORY_TARGETS.inFlight; i += 1) {
    const provider = pickProvider();
    const area = pickDistrict(provider);
    const quantity = sampleQuantity(rng, provider.minQuantity);
    // In-flight work is recent — it is what the dashboards should show live.
    const serviceDaysAgo = Math.floor(rng() * 21);
    const bookedDaysAgo = serviceDaysAgo + 2 + Math.floor(rng() * 13);
    const stage: InFlightStage = i < 20 ? 'ASSIGNED' : i < 40 ? 'SCHEDULED' : 'AWAITING_CONFIRMATION';

    bookings.push({
      status: 'IN_FLIGHT',
      inFlightStage: stage,
      providerId: provider.providerId,
      offeringId: provider.offeringId,
      areaId: area.id,
      quantity,
      ...(stage === 'AWAITING_CONFIRMATION' ? { finalQuantity: quantity } : {}),
      window: pickWindow(),
      serviceDaysAgo,
      bookedDaysAgo,
    });
  }

  return { bookings };
}

// -------------------------------------------------------------- the executor

const DRONE_MODELS = ['Marut AG365', 'Marut AG365N', 'Skyfarm SF-60', 'Corvus X1', 'Daksha K10'];

function dateDaysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(9, 30, 0, 0);
  return d;
}

function dateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * DAY_MS);
}

function addHours(d: Date, hours: number): Date {
  return new Date(d.getTime() + hours * 3_600_000);
}

/**
 * Spreads a booking's timestamps over its own timeline so the detail page and
 * dashboards read like real history rather than a burst of writes. The
 * transitions themselves were real (they went through the state machines);
 * this only relabels the clock.
 */
async function backdate(
  prisma: PrismaService,
  bookingId: string,
  startAt: Date,
  endAt: Date,
  opts: { completed?: boolean; cancelled?: boolean } = {},
): Promise<void> {
  const writes: Promise<unknown>[] = [];

  writes.push(
    prisma.booking.update({
      where: { id: bookingId },
      data: { createdAt: startAt, preferredDate: endAt },
    }),
    prisma.bookingSchedule.updateMany({
      where: { bookingId },
      data: { proposedDate: endAt },
    }),
  );

  if (opts.completed) {
    writes.push(
      prisma.booking.update({
        where: { id: bookingId },
        data: { completedAt: addHours(endAt, 6) },
      }),
    );
  } else if (opts.cancelled) {
    writes.push(
      prisma.booking.update({
        where: { id: bookingId },
        data: { cancelledAt: endAt },
      }),
    );
  }

  const history = await prisma.bookingStatusHistory.findMany({
    where: { bookingId },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });

  const spanMs = Math.max(1, endAt.getTime() - startAt.getTime());
  history.forEach((row, i) => {
    writes.push(
      prisma.bookingStatusHistory.update({
        where: { id: row.id },
        data: { createdAt: new Date(startAt.getTime() + (spanMs * (i + 1)) / (history.length + 1)) },
      }),
    );
  });

  await Promise.all(writes);
}

/** Every activated provider runs at least MIN_FLEET serviceable machines. */
async function ensureFleet(prisma: PrismaService): Promise<void> {
  const providers = await prisma.provider.findMany({
    where: { stage: 'ACTIVATED' },
    select: { id: true, _count: { select: { drones: true } } },
  });

  let added = 0;
  for (const provider of providers) {
    const missing = Math.max(0, MIN_FLEET - provider._count.drones);
    for (let i = 0; i < missing; i += 1) {
      await prisma.drone.create({
        data: {
          providerId: provider.id,
          model: DRONE_MODELS[(provider.id.charCodeAt(0) + i) % DRONE_MODELS.length]!,
          registrationNumber: `UIN-SEED-${provider.id.slice(0, 8).toUpperCase()}-${i + 1}`,
          capacityLitres: 10,
        },
      });
      added += 1;
    }
  }

  if (added > 0) console.log(`  history: topped up fleets (+${added} drones)`);
}

export async function generateHistory(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });

  try {
    const prisma = app.get(PrismaService);
    const bookings = app.get(BookingService);
    const settlement = app.get(SettlementService);
    const reputation = app.get(ReputationService);

    // Idempotency marker: history bookings are backdated; a completed booking
    // older than a month can only have come from a previous seed run.
    const marker = await prisma.booking.count({
      where: {
        status: 'COMPLETED',
        createdAt: { lt: addDays(new Date(), -HISTORY_MARKER_DAYS) },
      },
    });
    if (marker > 0) {
      console.log(`  history already seeded (${marker} backdated completed bookings) — skipping`);
      return;
    }

    const serviceType = await prisma.serviceType.findUnique({ where: { code: 'CROP_SPRAYING' } });
    if (!serviceType) {
      console.log('  history: CROP_SPRAYING service type missing — skipping');
      return;
    }

    const providers = await prisma.provider.findMany({
      where: { stage: 'ACTIVATED' },
      select: {
        id: true,
        organisationId: true,
        organisation: { select: { name: true } },
        offerings: {
          where: { status: 'ACTIVE', serviceTypeId: serviceType.id },
          select: {
            id: true,
            versions: { orderBy: { versionNumber: 'desc' }, take: 1, select: { minQuantity: true } },
            areas: { select: { area: { select: { id: true, name: true } } } },
          },
        },
      },
    });

    const usable = providers.filter(
      (p) => p.offerings.length > 0 && p.offerings[0]!.areas.length > 0,
    );
    if (usable.length === 0) {
      console.log('  history: no activated providers with active offerings — skipping');
      return;
    }

    const customerOrgs = await prisma.organisation.findMany({
      where: { kind: 'CUSTOMER' },
      select: {
        id: true,
        memberships: { where: { role: 'OWNER' }, select: { id: true, userId: true } },
      },
    });
    const customers = customerOrgs
      .filter((org) => org.memberships.length > 0)
      .map((org) => ({
        organisationId: org.id,
        userId: org.memberships[0]!.userId,
        membershipId: org.memberships[0]!.id,
      }));
    if (customers.length === 0) {
      console.log('  history: no customer organisations — skipping');
      return;
    }

    const providerMemberships = await prisma.membership.findMany({
      where: { organisationId: { in: usable.map((p) => p.organisationId) }, role: 'OWNER' },
      select: { id: true, userId: true, organisationId: true },
    });
    const membershipByOrg = new Map(providerMemberships.map((m) => [m.organisationId, m]));

    const catalogue: GenCatalogue = {
      serviceTypeId: serviceType.id,
      providers: usable.map((p) => ({
        providerId: p.id,
        offeringId: p.offerings[0]!.id,
        minQuantity: p.offerings[0]!.versions[0]?.minQuantity ?? 1,
        districts: p.offerings[0]!.areas.map((a) => ({
          id: a.area.id,
          weight: DISTRICT_WEIGHTS[a.area.name] ?? 1,
        })),
      })),
      customers,
    };

    const plan = generateHistoryPlan(catalogue, 2026);
    console.log(`  history: ${plan.bookings.length} bookings through the real booking services…`);

    await ensureFleet(prisma);

    const actor = (
      u: string,
      m: string,
      o: string,
      organisationKind: ActorContext['organisationKind'],
    ): ActorContext => ({
      userId: u,
      membershipId: m,
      organisationId: o,
      organisationKind,
      role: 'OWNER',
      principalOrganisationId: o,
    });

    let done = 0;
    let failed = 0;

    for (const intent of plan.bookings) {
      const provider = usable.find((p) => p.id === intent.providerId);
      const membership = provider ? membershipByOrg.get(provider.organisationId) : undefined;
      if (!provider || !membership) {
        failed += 1;
        continue;
      }

      const customerSeed = customers[done % customers.length]!;
      const customerActor = actor(
        customerSeed.userId,
        customerSeed.membershipId,
        customerSeed.organisationId,
        'CUSTOMER',
      );
      const providerActor = actor(
        membership.userId,
        membership.id,
        provider.organisationId,
        'PROVIDER',
      );

      try {
        const bookedAt = dateDaysAgo(intent.bookedDaysAgo);
        const serviceAt = dateDaysAgo(intent.serviceDaysAgo);

        // create() with an offeringId assigns immediately (UNASSIGNED -> ASSIGNED).
        const booking = await bookings.create(customerActor, {
          serviceTypeId: catalogue.serviceTypeId,
          areaId: intent.areaId,
          quantity: intent.quantity,
          preferredDate: dateString(serviceAt),
          preferredWindow: intent.window,
          offeringId: intent.offeringId,
        });

        if (intent.status === 'CANCELLED') {
          await bookings.cancel(customerActor, booking.id, intent.reason ?? 'Circumstances changed');
          // Cancellations are decided days before the service date.
          await backdate(prisma, booking.id, bookedAt, addDays(bookedAt, 1), { cancelled: true });
          done += 1;
          continue;
        }

        await bookings.accept(providerActor, booking.id);

        if (intent.status === 'IN_FLIGHT' && intent.inFlightStage === 'ASSIGNED') {
          await backdate(prisma, booking.id, bookedAt, serviceAt);
          done += 1;
          continue;
        }

        await bookings.markComplete(providerActor, booking.id, {
          finalQuantity: intent.finalQuantity ?? intent.quantity,
        });

        if (intent.status === 'COMPLETED') {
          await bookings.confirmCompletion(customerActor, booking.id);

          if (intent.paid) {
            await settlement.record(customerActor, booking.id, {
              method: intent.method ?? 'UPI',
              paidOn: dateString(addDays(serviceAt, intent.paidDaysAfter ?? 2)),
            });
          }

          if (intent.rating) {
            await reputation.create(customerActor, booking.id, {
              rating: intent.rating,
              ...(intent.comment ? { comment: intent.comment } : {}),
            });
          }

          await backdate(prisma, booking.id, bookedAt, serviceAt, { completed: true });
        } else {
          await backdate(prisma, booking.id, bookedAt, serviceAt);
        }

        done += 1;
        if (done % 50 === 0) console.log(`  history: ${done}/${plan.bookings.length}`);
      } catch (error) {
        failed += 1;
        console.error(
          `  history: booking failed (${intent.status} ${intent.areaId})`,
          error instanceof Error ? error.message : error,
        );
      }
    }

    if (failed > 0) {
      console.error(`  history: ${failed}/${plan.bookings.length} bookings failed`);
      throw new Error(`${failed} history bookings failed — re-running the seed will not duplicate them`);
    }
    console.log(`  history: ${done} bookings executed`);
  } finally {
    await app.close();
  }
}
