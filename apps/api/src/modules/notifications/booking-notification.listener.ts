import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Logger } from 'nestjs-pino';

import { BOOKING_EVENTS } from '../bookings/booking.events';
import type {
  BookingAnsweredEvent,
  BookingAssignedEvent,
  BookingCancelledEvent,
  BookingCompletionEvent,
  BookingScheduleEvent,
} from '../bookings/booking.events';
import { NotificationRepository } from './notification.repository';

const money = (minor?: number) =>
  minor === undefined ? '' : `₹${(minor / 100).toLocaleString('en-IN')}`;

/**
 * The ONLY file that knows both about booking events and about notifications.
 *
 * The dependency runs one way: this module imports Booking's event contract;
 * Booking imports nothing from here. That is what makes email in V2 another
 * listener rather than a change to any domain service.
 *
 * Every handler swallows its own errors. A notification that fails must never
 * surface as a failed booking — the business operation already committed.
 */
@Injectable()
export class BookingNotificationListener {
  constructor(
    private readonly notifications: NotificationRepository,
    private readonly logger: Logger,
  ) {}

  @OnEvent(BOOKING_EVENTS.ASSIGNED)
  async onAssigned(event: BookingAssignedEvent): Promise<void> {
    await this.safely(() =>
      this.notifications.create({
        organisationId: event.providerOrganisationId,
        type: 'BOOKING_ASSIGNED',
        title: `New request from ${event.customerName}`,
        body: `${event.quantity} ${this.unit(event.pricingUnit)} of ${event.serviceTypeName}. Accept, propose another date, or decline.`,
        bookingId: event.bookingId,
      }),
    );
  }

  @OnEvent(BOOKING_EVENTS.ACCEPTED)
  async onAccepted(event: BookingAnsweredEvent): Promise<void> {
    await this.safely(() =>
      this.notifications.create({
        organisationId: event.customerOrganisationId,
        type: 'BOOKING_ACCEPTED',
        title: `${event.providerName} accepted your booking`,
        bookingId: event.bookingId,
      }),
    );
  }

  @OnEvent(BOOKING_EVENTS.REJECTED)
  async onRejected(event: BookingAnsweredEvent): Promise<void> {
    await this.safely(() =>
      this.notifications.create({
        organisationId: event.customerOrganisationId,
        type: 'BOOKING_REJECTED',
        title: `${event.providerName} declined your booking`,
        body: `${event.reason ?? 'No reason given'}. Your request is intact — choose another provider.`,
        bookingId: event.bookingId,
      }),
    );
  }

  /** Goes to whichever side did NOT act. */
  @OnEvent(BOOKING_EVENTS.SCHEDULE_PROPOSED)
  async onScheduleProposed(event: BookingScheduleEvent): Promise<void> {
    const toProvider = event.actedByRole === 'CUSTOMER';

    await this.safely(() =>
      this.notifications.create({
        organisationId: toProvider ? event.providerOrganisationId : event.customerOrganisationId,
        type: 'BOOKING_SCHEDULE_PROPOSED',
        title: `${toProvider ? event.customerName : event.providerName} proposed a new date`,
        body: `${event.date}, ${event.window.toLowerCase()}. Confirm it or propose another.`,
        bookingId: event.bookingId,
      }),
    );
  }

  @OnEvent(BOOKING_EVENTS.SCHEDULE_CONFIRMED)
  async onScheduleConfirmed(event: BookingScheduleEvent): Promise<void> {
    const toProvider = event.actedByRole === 'CUSTOMER';

    await this.safely(() =>
      this.notifications.create({
        organisationId: toProvider ? event.providerOrganisationId : event.customerOrganisationId,
        type: 'BOOKING_SCHEDULE_CONFIRMED',
        title: `Date agreed: ${event.date}, ${event.window.toLowerCase()}`,
        bookingId: event.bookingId,
      }),
    );
  }

  @OnEvent(BOOKING_EVENTS.WORK_COMPLETED)
  async onWorkCompleted(event: BookingCompletionEvent): Promise<void> {
    await this.safely(() =>
      this.notifications.create({
        organisationId: event.customerOrganisationId,
        type: 'BOOKING_WORK_COMPLETED',
        title: `${event.providerName} marked the work done`,
        body: `${event.finalQuantity ?? event.quantity} ${this.unit(event.pricingUnit)} · ${money(event.finalAmountMinor)}. Please confirm.`,
        bookingId: event.bookingId,
      }),
    );
  }

  @OnEvent(BOOKING_EVENTS.COMPLETION_CONFIRMED)
  async onCompletionConfirmed(event: BookingCompletionEvent): Promise<void> {
    if (!event.providerOrganisationId) return;

    await this.safely(() =>
      this.notifications.create({
        organisationId: event.providerOrganisationId as string,
        type: 'BOOKING_COMPLETION_CONFIRMED',
        title: 'Work confirmed by the customer',
        body: 'You can now record payment against this booking.',
        bookingId: event.bookingId,
      }),
    );
  }

  @OnEvent(BOOKING_EVENTS.CANCELLED)
  async onCancelled(event: BookingCancelledEvent): Promise<void> {
    const toProvider = event.cancelledByRole === 'CUSTOMER';
    const recipient = toProvider ? event.providerOrganisationId : event.customerOrganisationId;

    if (!recipient) return;

    await this.safely(() =>
      this.notifications.create({
        organisationId: recipient,
        type: 'BOOKING_CANCELLED',
        title: 'Booking cancelled',
        body: event.reason,
        bookingId: event.bookingId,
      }),
    );
  }

  private unit(pricingUnit: string): string {
    return pricingUnit.replace('PER_', '').toLowerCase();
  }

  private async safely(work: () => Promise<unknown>): Promise<void> {
    try {
      await work();
    } catch (error) {
      // Logged, never rethrown. The booking already happened; a failed notice
      // must not turn a successful operation into an error for the user.
      this.logger.error({ err: error }, 'Failed to write notification');
    }
  }
}
