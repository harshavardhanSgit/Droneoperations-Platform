import { Injectable } from '@nestjs/common';

import {
  BusinessRuleException,
  ResourceConflictException,
  ResourceNotFoundException,
} from '../../common/errors/app.exception';
import { Prisma } from '../../generated/prisma/client';
import type { PartyRole } from '../../generated/prisma/client';
import type { PaymentModel } from '../../generated/prisma/models';
import { BookingService } from '../bookings/booking.service';
import type { ActorContext } from '../identity/actor-context';
import { ProviderRepository } from '../organisations/provider.repository';
import type { EarningsDto, PaymentDto, RecordPaymentDto } from './dto/payment.dto';
import { SettlementRepository } from './settlement.repository';

const UNIQUE_VIOLATION = 'P2002';

@Injectable()
export class SettlementService {
  constructor(
    private readonly settlement: SettlementRepository,
    private readonly bookings: BookingService,
    private readonly providers: ProviderRepository,
  ) {}

  /**
   * Either party may record payment. The platform never sees the money (D6),
   * so it cannot verify this — it only witnesses the claim. R8 stands: both
   * sides can read the record, and disagreement is a V2 dispute flow.
   */
  async record(
    actor: ActorContext,
    bookingId: string,
    dto: RecordPaymentDto,
  ): Promise<PaymentDto> {
    const booking = await this.bookings.findOne(actor, bookingId);

    // BR6 — payment only against completed work.
    if (booking.status !== 'COMPLETED') {
      throw new BusinessRuleException(
        'BOOKING_NOT_COMPLETED',
        'Payment can only be recorded once the work is confirmed complete',
        { status: booking.status },
      );
    }

    const amountMinor = dto.amountMinor ?? booking.finalAmountMinor;

    if (!amountMinor) {
      throw new BusinessRuleException(
        'AMOUNT_REQUIRED',
        'This booking has no final amount, so an explicit amount is required',
      );
    }

    const role: PartyRole = actor.organisationKind === 'PROVIDER' ? 'PROVIDER' : 'CUSTOMER';

    try {
      return this.toDto(
        await this.settlement.create({
          bookingId,
          amountMinor,
          method: dto.method,
          paidOn: new Date(dto.paidOn),
          reference: dto.reference?.trim(),
          note: dto.note?.trim(),
          recordedByUserId: actor.userId,
          recordedByRole: role,
        }),
      );
    } catch (error) {
      // The unique index on booking_id caught a second record.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === UNIQUE_VIOLATION) {
        throw new ResourceConflictException(
          'PAYMENT_ALREADY_RECORDED',
          'A payment has already been recorded for this booking',
        );
      }
      throw error;
    }
  }

  async findForBooking(actor: ActorContext, bookingId: string): Promise<PaymentDto | null> {
    // Reuses Booking's own visibility rule rather than re-deriving it — the
    // module that owns the booking is the only one that knows who may see it.
    await this.bookings.findOne(actor, bookingId);

    const payment = await this.settlement.findByBooking(bookingId);

    return payment ? this.toDto(payment) : null;
  }

  async earnings(actor: ActorContext): Promise<EarningsDto> {
    const provider = await this.providers.findByOrganisation(actor.organisationId);

    if (!provider) {
      throw new ResourceNotFoundException('Provider profile', actor.organisationId);
    }

    const totals = await this.settlement.earningsFor(provider.id);

    return {
      completedJobs: totals.completedJobs,
      paidJobs: totals.paidJobs,
      receivedMinor: totals.receivedMinor,
      outstandingMinor: Math.max(0, totals.billedMinor - totals.receivedMinor),
      currency: 'INR',
    };
  }

  private toDto(payment: PaymentModel): PaymentDto {
    return {
      id: payment.id,
      bookingId: payment.bookingId,
      amountMinor: payment.amountMinor,
      currency: payment.currency,
      method: payment.method,
      paidOn: payment.paidOn.toISOString().slice(0, 10),
      ...(payment.reference ? { reference: payment.reference } : {}),
      ...(payment.note ? { note: payment.note } : {}),
      recordedByRole: payment.recordedByRole,
      recordedAt: payment.createdAt.toISOString(),
    };
  }
}
