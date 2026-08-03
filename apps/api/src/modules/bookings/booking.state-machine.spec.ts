import type { BookingStatus } from '../../generated/prisma/client';
import { assertNotTerminal, assertTransition, canTransition, isTerminal } from './booking.state-machine';

const ALL: BookingStatus[] = [
  'UNASSIGNED',
  'ASSIGNED',
  'SCHEDULED',
  'AWAITING_CONFIRMATION',
  'COMPLETED',
  'CANCELLED',
];

describe('booking state machine', () => {
  it('D9 — a rejected booking returns to UNASSIGNED rather than dying', () => {
    expect(canTransition('ASSIGNED', 'UNASSIGNED')).toBe(true);
  });

  it('supports the full happy path', () => {
    expect(canTransition('UNASSIGNED', 'ASSIGNED')).toBe(true);
    expect(canTransition('ASSIGNED', 'SCHEDULED')).toBe(true);
    expect(canTransition('SCHEDULED', 'AWAITING_CONFIRMATION')).toBe(true);
    expect(canTransition('AWAITING_CONFIRMATION', 'COMPLETED')).toBe(true);
  });

  it('refuses to skip the customer’s confirmation (D10)', () => {
    expect(canTransition('SCHEDULED', 'COMPLETED')).toBe(false);
  });

  it('refuses to assign a booking that is already scheduled', () => {
    expect(canTransition('SCHEDULED', 'ASSIGNED')).toBe(false);
  });

  it('BR9 — cancellation is reachable from every open state', () => {
    expect(canTransition('UNASSIGNED', 'CANCELLED')).toBe(true);
    expect(canTransition('ASSIGNED', 'CANCELLED')).toBe(true);
    expect(canTransition('SCHEDULED', 'CANCELLED')).toBe(true);
  });

  it('BR9 — and terminal states allow nothing at all', () => {
    for (const target of ALL) {
      expect(canTransition('COMPLETED', target)).toBe(false);
      expect(canTransition('CANCELLED', target)).toBe(false);
    }
  });

  it('never allows a self-transition', () => {
    for (const status of ALL) {
      expect(canTransition(status, status)).toBe(false);
    }
  });

  it('reports terminality correctly', () => {
    expect(isTerminal('COMPLETED')).toBe(true);
    expect(isTerminal('CANCELLED')).toBe(true);
    expect(isTerminal('SCHEDULED')).toBe(false);
  });

  describe('assertions carry a stable code and the allowed set', () => {
    it('assertTransition explains what was possible', () => {
      try {
        assertTransition('COMPLETED', 'CANCELLED');
        throw new Error('should have thrown');
      } catch (error) {
        const typed = error as { code: string; details?: { allowed: string[] } };
        expect(typed.code).toBe('BOOKING_INVALID_TRANSITION');
        expect(typed.details?.allowed).toEqual([]);
      }
    });

    it('assertNotTerminal refuses a closed booking', () => {
      expect(() => assertNotTerminal('CANCELLED')).toThrow();
      expect(() => assertNotTerminal('SCHEDULED')).not.toThrow();
    });
  });
});
