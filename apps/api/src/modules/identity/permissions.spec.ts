import type { ActorContext } from './actor-context';
import { actorHasPermission, permissionsFor, PERMISSIONS } from './permissions';

/**
 * The permission map is a pure function of (organisation kind, membership role).
 * That is precisely why it is testable without a database, a request or a Nest
 * module — and why level-1 authorisation was kept free of domain lookups.
 */
const actor = (
  organisationKind: ActorContext['organisationKind'],
  role: ActorContext['role'],
): ActorContext => ({
  userId: 'u1',
  membershipId: 'm1',
  organisationId: 'o1',
  organisationKind,
  role,
  principalOrganisationId: 'o1',
});

describe('permission map', () => {
  describe('customers', () => {
    it('an OWNER can create and cancel bookings and leave reviews', () => {
      const a = actor('CUSTOMER', 'OWNER');
      expect(actorHasPermission(a, 'booking:create')).toBe(true);
      expect(actorHasPermission(a, 'booking:cancel')).toBe(true);
      expect(actorHasPermission(a, 'review:create')).toBe(true);
    });

    it('BR5 — a customer can confirm completion but NOT mark work complete', () => {
      const a = actor('CUSTOMER', 'OWNER');
      expect(actorHasPermission(a, 'booking:confirm-completion')).toBe(true);
      expect(actorHasPermission(a, 'booking:complete')).toBe(false);
    });

    it('cannot touch provider or platform capabilities', () => {
      const a = actor('CUSTOMER', 'OWNER');
      expect(actorHasPermission(a, 'offering:manage')).toBe(false);
      expect(actorHasPermission(a, 'provider:review')).toBe(false);
      expect(actorHasPermission(a, 'catalogue:manage')).toBe(false);
      expect(actorHasPermission(a, 'organisation:read-any')).toBe(false);
    });

    it('a MEMBER can act on bookings but not rename the organisation', () => {
      const member = actor('CUSTOMER', 'MEMBER');
      expect(actorHasPermission(member, 'booking:create')).toBe(true);
      expect(actorHasPermission(member, 'organisation:manage-own')).toBe(false);
    });
  });

  describe('providers', () => {
    it('BR5 — a provider can mark work complete but NOT confirm it', () => {
      const a = actor('PROVIDER', 'OWNER');
      expect(actorHasPermission(a, 'booking:complete')).toBe(true);
      expect(actorHasPermission(a, 'booking:confirm-completion')).toBe(false);
    });

    it('cannot create bookings — BR17 has a level-1 backstop', () => {
      expect(actorHasPermission(actor('PROVIDER', 'OWNER'), 'booking:create')).toBe(false);
    });

    it('only an OWNER manages offerings and drones', () => {
      expect(actorHasPermission(actor('PROVIDER', 'OWNER'), 'offering:manage')).toBe(true);
      expect(actorHasPermission(actor('PROVIDER', 'MEMBER'), 'offering:manage')).toBe(false);
      expect(actorHasPermission(actor('PROVIDER', 'MEMBER'), 'drone:manage')).toBe(false);
    });

    it('cannot review or activate itself', () => {
      const a = actor('PROVIDER', 'OWNER');
      expect(actorHasPermission(a, 'provider:review')).toBe(false);
      expect(actorHasPermission(a, 'review:create')).toBe(false);
    });
  });

  describe('platform staff', () => {
    it('an ADMIN holds every permission', () => {
      expect(permissionsFor(actor('PLATFORM', 'ADMIN'))).toHaveLength(PERMISSIONS.length);
    });

    it('a SERVICE_ENGINEER can only work tickets', () => {
      const a = actor('PLATFORM', 'SERVICE_ENGINEER');
      expect(actorHasPermission(a, 'ticket:progress')).toBe(true);
      expect(actorHasPermission(a, 'ticket:close')).toBe(true);
      expect(actorHasPermission(a, 'ticket:assign')).toBe(false);
      expect(actorHasPermission(a, 'provider:review')).toBe(false);
      expect(actorHasPermission(a, 'organisation:read-any')).toBe(false);
    });
  });

  describe('platform-wide data visibility', () => {
    it('only a PLATFORM ADMIN holds booking:read-any — the coverage gate', () => {
      expect(actorHasPermission(actor('PLATFORM', 'ADMIN'), 'booking:read-any')).toBe(true);
      // The admin sees the whole market; a provider and a customer see only
      // their own numbers, and an engineer works tickets, not dashboards.
      expect(actorHasPermission(actor('PLATFORM', 'SERVICE_ENGINEER'), 'booking:read-any')).toBe(
        false,
      );
      expect(actorHasPermission(actor('PROVIDER', 'OWNER'), 'booking:read-any')).toBe(false);
      expect(actorHasPermission(actor('CUSTOMER', 'OWNER'), 'booking:read-any')).toBe(false);
    });
  });

  describe('unassigned combinations', () => {
    it('grant nothing — the map is deny by default', () => {
      expect(permissionsFor(actor('PLATFORM', 'OWNER'))).toEqual([]);
      expect(permissionsFor(actor('CUSTOMER', 'ADMIN'))).toEqual([]);
      expect(permissionsFor(actor('PROVIDER', 'SERVICE_ENGINEER'))).toEqual([]);
    });
  });
});
