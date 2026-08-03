import type { INestApplication } from '@nestjs/common';

import type { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import { BookingService } from '../src/modules/bookings/booking.service';
import { ReputationService } from '../src/modules/reputation/reputation.service';
import { SettlementService } from '../src/modules/settlement/settlement.service';
import { createTestApp, resetDatabase, seedFixtures, type Fixtures } from './helpers/test-app';

describe('Settlement and Reputation — gated on completion', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let bookings: BookingService;
  let settlement: SettlementService;
  let reputation: ReputationService;
  let fx: Fixtures;

  beforeAll(async () => {
    const ctx = await createTestApp();
    app = ctx.app;
    prisma = ctx.prisma;
    bookings = app.get(BookingService);
    settlement = app.get(SettlementService);
    reputation = app.get(ReputationService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    fx = await seedFixtures(prisma);
  });

  const bookingAt = async (stage: 'ASSIGNED' | 'SCHEDULED' | 'COMPLETED') => {
    const booking = await bookings.create(fx.customer, {
      serviceTypeId: fx.serviceTypeId,
      areaId: fx.areaId,
      quantity: 20,
      preferredDate: '2026-09-01',
      preferredWindow: 'DAWN' as never,
    });

    await bookings.assign(fx.customer, booking.id, fx.offeringId);
    if (stage === 'ASSIGNED') return booking.id;

    await bookings.accept(fx.provider, booking.id);
    if (stage === 'SCHEDULED') return booking.id;

    await bookings.markComplete(fx.provider, booking.id, { finalQuantity: 18 });
    await bookings.confirmCompletion(fx.customer, booking.id);
    return booking.id;
  };

  describe('BR6 — payment only against completed work', () => {
    it('is refused while the job is merely scheduled', async () => {
      const id = await bookingAt('SCHEDULED');

      await expect(
        settlement.record(fx.customer, id, { method: 'UPI' as never, paidOn: '2026-09-02' }),
      ).rejects.toMatchObject({ code: 'BOOKING_NOT_COMPLETED' });
    });

    it('defaults to the FINAL amount, not the estimate', async () => {
      const id = await bookingAt('COMPLETED');

      const payment = await settlement.record(fx.customer, id, {
        method: 'UPI' as never,
        paidOn: '2026-09-02',
      });

      // 18 delivered x Rs500, not 20 booked.
      expect(payment.amountMinor).toBe(900_000);
      expect(payment.recordedByRole).toBe('CUSTOMER');
    });

    it('records who logged it — the platform witnesses, it does not verify', async () => {
      const id = await bookingAt('COMPLETED');

      const payment = await settlement.record(fx.provider, id, {
        method: 'CASH' as never,
        paidOn: '2026-09-02',
      });

      expect(payment.recordedByRole).toBe('PROVIDER');
    });

    it('the unique index refuses a second payment for the same booking', async () => {
      const id = await bookingAt('COMPLETED');
      await settlement.record(fx.customer, id, { method: 'UPI' as never, paidOn: '2026-09-02' });

      await expect(
        settlement.record(fx.provider, id, { method: 'CASH' as never, paidOn: '2026-09-03' }),
      ).rejects.toMatchObject({ code: 'PAYMENT_ALREADY_RECORDED' });
    });

    it('earnings are derived from completed bookings, never a stored total', async () => {
      const first = await bookingAt('COMPLETED');
      await bookingAt('COMPLETED');
      await settlement.record(fx.customer, first, { method: 'UPI' as never, paidOn: '2026-09-02' });

      const earnings = await settlement.earnings(fx.provider);

      expect(earnings.completedJobs).toBe(2);
      expect(earnings.paidJobs).toBe(1);
      expect(earnings.receivedMinor).toBe(900_000);
      expect(earnings.outstandingMinor).toBe(900_000);
    });
  });

  describe('BR7 — one review, by the customer, after completion', () => {
    it('is refused before the work is confirmed', async () => {
      const id = await bookingAt('SCHEDULED');

      await expect(reputation.create(fx.customer, id, { rating: 5 })).rejects.toMatchObject({
        code: 'BOOKING_NOT_COMPLETED',
      });
    });

    it('is refused for a provider even on a completed booking', async () => {
      const id = await bookingAt('COMPLETED');

      await expect(reputation.create(fx.provider, id, { rating: 5 })).rejects.toMatchObject({
        code: 'ACCESS_DENIED',
      });
    });

    it('the unique index refuses a second review', async () => {
      const id = await bookingAt('COMPLETED');
      await reputation.create(fx.customer, id, { rating: 4, comment: 'Even coverage' });

      await expect(reputation.create(fx.customer, id, { rating: 1 })).rejects.toMatchObject({
        code: 'ALREADY_REVIEWED',
      });
    });

    it('the check constraint refuses an out-of-range rating written directly', async () => {
      const id = await bookingAt('COMPLETED');

      await expect(
        prisma.review.create({
          data: {
            bookingId: id,
            providerId: fx.providerId,
            customerOrganisationId: fx.customer.organisationId,
            rating: 9,
            createdByUserId: fx.customer.userId,
          },
        }),
      ).rejects.toThrow(/reviews_rating_range/);
    });

    it('the average is recomputed from reviews, not stored', async () => {
      const a = await bookingAt('COMPLETED');
      const b = await bookingAt('COMPLETED');
      await reputation.create(fx.customer, a, { rating: 5 });
      await reputation.create(fx.customer, b, { rating: 2 });

      const rating = await reputation.ratingFor(fx.providerId);

      expect(rating.count).toBe(2);
      expect(rating.average).toBe(3.5);
    });
  });
});
