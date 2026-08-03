import { Injectable } from '@nestjs/common';

import type { PartyRole, PaymentMethod } from '../../generated/prisma/client';
import type { PaymentModel } from '../../generated/prisma/models';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type { Tx } from '../../infrastructure/prisma/transaction';

@Injectable()
export class SettlementRepository {
  constructor(private readonly prisma: PrismaService) {}

  private db(tx?: Tx) {
    return tx ?? this.prisma;
  }

  create(
    data: {
      bookingId: string;
      amountMinor: number;
      method: PaymentMethod;
      paidOn: Date;
      reference?: string | undefined;
      note?: string | undefined;
      recordedByUserId: string;
      recordedByRole: PartyRole;
    },
    tx?: Tx,
  ): Promise<PaymentModel> {
    return this.db(tx).payment.create({ data });
  }

  findByBooking(bookingId: string, tx?: Tx): Promise<PaymentModel | null> {
    return this.db(tx).payment.findUnique({ where: { bookingId } });
  }

  /**
   * Earnings are DERIVED from completed bookings and their payments, never
   * kept as a running total on the provider. A stored total is a second source
   * of truth that drifts the first time a write fails halfway.
   */
  async earningsFor(providerId: string): Promise<{
    completedJobs: number;
    paidJobs: number;
    receivedMinor: number;
    billedMinor: number;
  }> {
    const completed = await this.prisma.booking.findMany({
      where: {
        status: 'COMPLETED',
        assignments: { some: { providerId, status: 'ACCEPTED' } },
      },
      select: { finalAmountMinor: true, payment: { select: { amountMinor: true } } },
    });

    return completed.reduce(
      (acc, booking) => ({
        completedJobs: acc.completedJobs + 1,
        paidJobs: acc.paidJobs + (booking.payment ? 1 : 0),
        receivedMinor: acc.receivedMinor + (booking.payment?.amountMinor ?? 0),
        billedMinor: acc.billedMinor + (booking.finalAmountMinor ?? 0),
      }),
      { completedJobs: 0, paidJobs: 0, receivedMinor: 0, billedMinor: 0 },
    );
  }
}
