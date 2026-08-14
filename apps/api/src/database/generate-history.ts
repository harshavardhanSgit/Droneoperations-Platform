import 'dotenv/config';

import { NestFactory } from '@nestjs/core';

import { AppModule } from '../app.module';
import type { PaymentMethod, TimeWindow } from '../generated/prisma/client';
import { PrismaService } from '../infrastructure/prisma/prisma.service';
import { BookingService } from '../modules/bookings/booking.service';
import type { ActorContext } from '../modules/identity/actor-context';
import { ReputationService } from '../modules/reputation/reputation.service';
import { SettlementService } from '../modules/settlement/settlement.service';
import {
  DAY_MS,
  DISTRICT_WEIGHTS,
  generateHistoryPlan,
  HISTORY_MARKER_DAYS,
  HISTORY_TARGETS,
  MIN_FLEET,
  type BookingIntent,
  type GenCatalogue,
  type GenCustomer,
  type GenProvider,
  type HistoryPlan,
  type InFlightStage,
  type IntentStatus,
} from './generate-history.plan';

/** The EXECUTOR half of the history seed. */

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
 * Spreads a booking's timestamps over its own timeline so the detail page and dashboards read
 * like real history rather than a burst of writes.
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

    // Idempotency marker: history bookings are backdated; a completed booking older than a
    // month can only have come from a previous seed run.
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
