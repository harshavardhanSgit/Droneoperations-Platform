/**
 * Events this module publishes.
 *
 * Booking emits these and knows nothing about who listens. The payload carries
 * only what a subscriber needs — never an entity, because an entity's shape is
 * this module's private business and a payload is a public contract.
 */
export const BOOKING_EVENTS = {
  ASSIGNED: 'booking.assigned',
  ACCEPTED: 'booking.accepted',
  REJECTED: 'booking.rejected',
  SCHEDULE_PROPOSED: 'booking.schedule_proposed',
  SCHEDULE_CONFIRMED: 'booking.schedule_confirmed',
  WORK_COMPLETED: 'booking.work_completed',
  COMPLETION_CONFIRMED: 'booking.completion_confirmed',
  CANCELLED: 'booking.cancelled',
} as const;

interface BookingEventBase {
  bookingId: string;
  /** The organisation that owns the booking. */
  customerOrganisationId: string;
  /** The organisation of the assigned provider, when there is one. */
  providerOrganisationId?: string;
  serviceTypeName: string;
  quantity: number;
  pricingUnit: string;
}

export interface BookingAssignedEvent extends BookingEventBase {
  providerOrganisationId: string;
  customerName: string;
}

export interface BookingAnsweredEvent extends BookingEventBase {
  providerOrganisationId: string;
  providerName: string;
  reason?: string;
}

export interface BookingScheduleEvent extends BookingEventBase {
  providerOrganisationId: string;
  date: string;
  window: string;
  /** Who moved — the notification goes to the OTHER side. */
  actedByRole: 'CUSTOMER' | 'PROVIDER';
  customerName: string;
  providerName: string;
}

export interface BookingCompletionEvent extends BookingEventBase {
  providerOrganisationId: string;
  providerName: string;
  finalQuantity?: number;
  finalAmountMinor?: number;
}

export interface BookingCancelledEvent extends BookingEventBase {
  reason: string;
  cancelledByRole: 'CUSTOMER' | 'PROVIDER';
  customerName: string;
}
