import type { INestApplication } from '@nestjs/common';

import type { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import { BookingService } from '../src/modules/bookings/booking.service';
import { OfferingService } from '../src/modules/offerings/offering.service';
import { createTestApp, resetDatabase, seedFixtures, type Fixtures } from './helpers/test-app';

/**
 * These exercise the rules a mocked repository CANNOT: database constraints,
 * transaction boundaries and concurrency. Everything here runs against real
 * Postgres with real indexes.
 */
describe('Booking — database-enforced rules', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let bookings: BookingService;
  let offerings: OfferingService;
  let fx: Fixtures;

  beforeAll(async () => {
    const ctx = await createTestApp();
    app = ctx.app;
    prisma = ctx.prisma;
    bookings = app.get(BookingService);
    offerings = app.get(OfferingService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    fx = await seedFixtures(prisma);
  });

  const newBooking = (quantity = 20) =>
    bookings.create(fx.customer, {
      serviceTypeId: fx.serviceTypeId,
      areaId: fx.areaId,
      quantity,
      preferredDate: '2026-09-01',
      preferredWindow: 'DAWN' as never,
    });

  describe('BR2 — at most one active assignment', () => {
    it('two simultaneous assignments produce exactly one winner', async () => {
      const booking = await newBooking();

      // The whole point. Both calls read status UNASSIGNED before either
      // writes. An application-level "is it already assigned?" check would let
      // both through; the optimistic version column and the partial unique
      // index make the second one lose.
      const results = await Promise.allSettled([
        bookings.assign(fx.customer, booking.id, fx.offeringId),
        bookings.assign(fx.customer, booking.id, fx.otherOfferingId),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      expect(fulfilled).toHaveLength(1);

      const active = await prisma.bookingAssignment.count({
        where: { bookingId: booking.id, status: { in: ['PENDING', 'ACCEPTED'] } },
      });
      expect(active).toBe(1);
    });

    it('the partial index refuses a second active row even bypassing the service', async () => {
      const booking = await newBooking();
      await bookings.assign(fx.customer, booking.id, fx.offeringId);

      const version = await prisma.offeringVersion.findFirstOrThrow({
        where: { offering: { id: fx.otherOfferingId } },
      });

      await expect(
        prisma.bookingAssignment.create({
          data: {
            bookingId: booking.id,
            providerId: fx.providerId,
            offeringVersionId: version.id,
            assignedByUserId: fx.customer.userId,
          },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });
    });

    it('D9 — after a rejection a second assignment is allowed', async () => {
      const booking = await newBooking();
      await bookings.assign(fx.customer, booking.id, fx.offeringId);
      await bookings.reject(fx.provider, booking.id, 'Machine in for service');

      const reassigned = await bookings.assign(fx.customer, booking.id, fx.otherOfferingId);

      expect(reassigned.status).toBe('ASSIGNED');
      expect(reassigned.assignments).toHaveLength(2);
      expect(reassigned.assignments.map((a) => a.status).sort()).toEqual(['PENDING', 'REJECTED']);
    });
  });

  describe('BR8 — a quoted price never moves', () => {
    it('repricing the offering leaves an existing booking untouched', async () => {
      const booking = await newBooking(20);
      const assigned = await bookings.assign(fx.customer, booking.id, fx.offeringId);

      expect(assigned.unitPriceMinor).toBe(50000);
      expect(assigned.estimatedTotalMinor).toBe(1_000_000);

      // The provider raises their price by 40%.
      await offerings.publishVersion(fx.provider, fx.offeringId, { unitPriceMinor: 70000 });

      const after = await bookings.findOne(fx.customer, booking.id);

      expect(after.unitPriceMinor).toBe(50000);
      expect(after.estimatedTotalMinor).toBe(1_000_000);
    });

    it('the booking still points at the ORIGINAL immutable version', async () => {
      const booking = await newBooking();
      await bookings.assign(fx.customer, booking.id, fx.offeringId);

      const before = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });

      await offerings.publishVersion(fx.provider, fx.offeringId, { unitPriceMinor: 70000 });

      const version = await prisma.offeringVersion.findUniqueOrThrow({
        where: { id: before.offeringVersionId as string },
      });

      // v1 is closed but unchanged — the row the quote depends on was never edited.
      expect(version.versionNumber).toBe(1);
      expect(version.unitPriceMinor).toBe(50000);
      expect(version.effectiveTo).not.toBeNull();
    });

    it('a NEW booking gets the new price', async () => {
      await offerings.publishVersion(fx.provider, fx.offeringId, { unitPriceMinor: 70000 });

      const booking = await newBooking(10);
      const assigned = await bookings.assign(fx.customer, booking.id, fx.offeringId);

      expect(assigned.unitPriceMinor).toBe(70000);
      expect(assigned.estimatedTotalMinor).toBe(700_000);
    });
  });

  describe('BR14 — the final amount comes from what was delivered', () => {
    it('20 acres booked, 18 delivered, 18 billed', async () => {
      const booking = await newBooking(20);
      await bookings.assign(fx.customer, booking.id, fx.offeringId);
      await bookings.accept(fx.provider, booking.id);

      const completed = await bookings.markComplete(fx.provider, booking.id, {
        finalQuantity: 18,
        note: 'Wind picked up',
      });

      expect(completed.estimatedTotalMinor).toBe(1_000_000);
      expect(completed.finalQuantity).toBe(18);
      expect(completed.finalAmountMinor).toBe(900_000);
    });
  });

  describe('BR16 — every transition is recorded, in the same transaction', () => {
    it('the timeline reconstructs the whole life of a booking', async () => {
      const booking = await newBooking();
      await bookings.assign(fx.customer, booking.id, fx.offeringId);
      await bookings.reject(fx.provider, booking.id, 'Fully booked');
      await bookings.assign(fx.customer, booking.id, fx.otherOfferingId);
      await bookings.accept(fx.otherProvider, booking.id);
      await bookings.markComplete(fx.otherProvider, booking.id, { finalQuantity: 20 });
      const done = await bookings.confirmCompletion(fx.customer, booking.id);

      expect(done.history.map((h) => h.toStatus)).toEqual([
        'UNASSIGNED',
        'ASSIGNED',
        'UNASSIGNED',
        'ASSIGNED',
        'SCHEDULED',
        'AWAITING_CONFIRMATION',
        'COMPLETED',
      ]);

      const rejection = done.history.find((h) => h.reason === 'Fully booked');
      expect(rejection?.toStatus).toBe('UNASSIGNED');
    });

    it('a failed transition writes NO history entry', async () => {
      const booking = await newBooking();
      const before = await prisma.bookingStatusHistory.count({ where: { bookingId: booking.id } });

      // Illegal: cannot accept a booking nobody is assigned to.
      await expect(bookings.accept(fx.provider, booking.id)).rejects.toBeDefined();

      const after = await prisma.bookingStatusHistory.count({ where: { bookingId: booking.id } });
      expect(after).toBe(before);
    });
  });

  describe('optimistic locking', () => {
    it('two simultaneous cancels leave exactly one cancellation', async () => {
      const booking = await newBooking();

      const results = await Promise.allSettled([
        bookings.cancel(fx.customer, booking.id, 'changed my mind'),
        bookings.cancel(fx.customer, booking.id, 'also changed my mind'),
      ]);

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);

      const cancellations = await prisma.bookingStatusHistory.count({
        where: { bookingId: booking.id, toStatus: 'CANCELLED' },
      });
      expect(cancellations).toBe(1);
    });
  });
});
