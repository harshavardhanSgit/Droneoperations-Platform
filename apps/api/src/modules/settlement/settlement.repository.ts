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
  /**
   * Every completed job for this provider, each with its payment or the absence
   * of one.
   *
   * Returns the rows rather than only the totals: the caller needs both, and
   * the totals are derived from exactly these rows. Summing here and fetching
   * the same bookings again for the breakdown would be two queries answering
   * one question — and two chances for the list and the total to disagree.
   */
  earningsFor(providerId: string) {
    return this.prisma.booking.findMany({
      where: {
        status: 'COMPLETED',
        assignments: { some: { providerId, status: 'ACCEPTED' } },
      },
      select: {
        id: true,
        finalAmountMinor: true,
        estimatedTotalMinor: true,
        completedAt: true,
        customerOrganisation: { select: { name: true } },
        payment: { select: { amountMinor: true, paidOn: true } },
      },
      // Unpaid work is what the provider came here to find, and the oldest
      // unpaid job is the one that needs chasing.
      orderBy: { completedAt: 'desc' },
    });
  }
}
