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

    const completed = await this.settlement.earningsFor(provider.id);

    const jobs = completed.map((booking) => ({
      bookingId: booking.id,
      customerName: booking.customerOrganisation.name,
      ...(booking.completedAt
        ? { completedOn: booking.completedAt.toISOString().slice(0, 10) }
        : {}),
      // finalAmount is what was actually delivered (BR14). Falling back to the
      // estimate only covers older rows completed before a final was recorded.
      amountMinor: booking.finalAmountMinor ?? booking.estimatedTotalMinor ?? 0,
      paid: booking.payment !== null,
      ...(booking.payment ? { paidOn: booking.payment.paidOn.toISOString().slice(0, 10) } : {}),
    }));

    // Unpaid first — that is the question this screen exists to answer. Within
    // each group the repository's newest-first order is preserved.
    jobs.sort((a, b) => Number(a.paid) - Number(b.paid));

    const receivedMinor = completed.reduce((sum, b) => sum + (b.payment?.amountMinor ?? 0), 0);
    const billedMinor = jobs.reduce((sum, job) => sum + job.amountMinor, 0);

    return {
      completedJobs: jobs.length,
      paidJobs: jobs.filter((job) => job.paid).length,
      receivedMinor,
      outstandingMinor: Math.max(0, billedMinor - receivedMinor),
      currency: 'INR',
      jobs,
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
