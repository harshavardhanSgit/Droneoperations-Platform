import { ResourceConflictException } from '../../common/errors/app.exception';
import type { BookingStatus } from '../../generated/prisma/client';

/**
 * The booking lifecycle, declared once.
 *
 * Note UNASSIGNED <-> ASSIGNED in both directions: that is D9. A rejection does
 * not kill the booking, it returns it to the pool with its requirement, its
 * quote and its history intact. Modelling assignment as a table (S1) is what
 * makes that possible — with a provider_id column there would be nothing to
 * return to.
 */
const TRANSITIONS: Record<BookingStatus, readonly BookingStatus[]> = {
  UNASSIGNED: ['ASSIGNED', 'CANCELLED'],
  ASSIGNED: ['SCHEDULED', 'UNASSIGNED', 'CANCELLED'],
  SCHEDULED: ['AWAITING_CONFIRMATION', 'CANCELLED'],
  AWAITING_CONFIRMATION: ['COMPLETED', 'SCHEDULED'],
  COMPLETED: [],
  CANCELLED: [],
};

/** Nothing may change after these. BR9 — cancellation is terminal. */
const TERMINAL: readonly BookingStatus[] = ['COMPLETED', 'CANCELLED'];

export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: BookingStatus, to: BookingStatus): void {
  if (!canTransition(from, to)) {
    throw new ResourceConflictException(
      'BOOKING_INVALID_TRANSITION',
      `A booking cannot move from ${from} to ${to}`,
      { from, attempted: to, allowed: TRANSITIONS[from] },
    );
  }
}

export function isTerminal(status: BookingStatus): boolean {
  return TERMINAL.includes(status);
}

export function assertNotTerminal(status: BookingStatus): void {
  if (isTerminal(status)) {
    throw new ResourceConflictException(
      'BOOKING_ALREADY_CLOSED',
      `This booking is ${status.toLowerCase()} and can no longer be changed`,
      { status },
    );
  }
}
