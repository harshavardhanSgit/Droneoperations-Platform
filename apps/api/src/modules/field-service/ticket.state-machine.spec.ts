import { assertTransition, OPEN_STATUSES } from './ticket.state-machine';

const can = (from: Parameters<typeof assertTransition>[0], to: Parameters<typeof assertTransition>[1]) => {
  try {
    assertTransition(from, to);
    return true;
  } catch {
    return false;
  }
};

describe('maintenance ticket state machine', () => {
  it('walks dispatch to closure', () => {
    expect(can('OPEN', 'ASSIGNED')).toBe(true);
    expect(can('ASSIGNED', 'IN_PROGRESS')).toBe(true);
    expect(can('IN_PROGRESS', 'CLOSED')).toBe(true);
  });

  it('cannot close a ticket nobody has started', () => {
    expect(can('OPEN', 'CLOSED')).toBe(false);
    expect(can('ASSIGNED', 'CLOSED')).toBe(false);
  });

  it('can be handed back to the queue or reassigned', () => {
    expect(can('ASSIGNED', 'OPEN')).toBe(true);
    expect(can('IN_PROGRESS', 'ASSIGNED')).toBe(true);
  });

  it('closed and cancelled are terminal', () => {
    expect(can('CLOSED', 'OPEN')).toBe(false);
    expect(can('CLOSED', 'IN_PROGRESS')).toBe(false);
    expect(can('CANCELLED', 'OPEN')).toBe(false);
  });

  it('work in progress cannot be cancelled out from under the engineer', () => {
    expect(can('IN_PROGRESS', 'CANCELLED')).toBe(false);
  });

  it('a drone is grounded for exactly the open statuses', () => {
    expect([...OPEN_STATUSES]).toEqual(['OPEN', 'ASSIGNED', 'IN_PROGRESS']);
    expect(OPEN_STATUSES).not.toContain('CLOSED');
    expect(OPEN_STATUSES).not.toContain('CANCELLED');
  });
});
