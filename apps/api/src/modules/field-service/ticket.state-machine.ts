import { ResourceConflictException } from '../../common/errors/app.exception';
import type { TicketStatus } from '../../generated/prisma/client';

/** Fourth state machine in this codebase, same shape as the other three. */
const TRANSITIONS: Record<TicketStatus, readonly TicketStatus[]> = {
  OPEN: ['ASSIGNED', 'CANCELLED'],
  ASSIGNED: ['IN_PROGRESS', 'OPEN', 'CANCELLED'],
  IN_PROGRESS: ['CLOSED', 'ASSIGNED'],
  CLOSED: [],
  CANCELLED: [],
};

/** A drone is grounded while any of these is true. */
export const OPEN_STATUSES: readonly TicketStatus[] = ['OPEN', 'ASSIGNED', 'IN_PROGRESS'];

export function assertTransition(from: TicketStatus, to: TicketStatus): void {
  if (!TRANSITIONS[from].includes(to)) {
    throw new ResourceConflictException(
      'TICKET_INVALID_TRANSITION',
      `A ticket cannot move from ${from} to ${to}`,
      { from, attempted: to, allowed: TRANSITIONS[from] },
    );
  }
}
