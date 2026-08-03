import type { MembershipRole, OrganisationKind } from '../../generated/prisma/client';
import type { ActorContext } from './actor-context';

/**
 * Every capability in the system. Adding one here and nowhere else means an
 * unassigned permission is dead by default rather than open by default.
 */
export const PERMISSIONS = [
  // Organisations
  'organisation:read-own',
  'organisation:manage-own',
  'organisation:read-any',

  // Provider onboarding
  'provider:read-own',
  'provider:manage-own',
  'provider:review',

  // Offerings & assets (Provider)
  'offering:manage',
  'drone:manage',

  // Bookings (Customer)
  'booking:create',
  'booking:cancel',
  'booking:confirm-completion',
  'review:create',

  // Bookings (Provider)
  'booking:accept',
  'booking:reject',
  'booking:complete',

  // Bookings (Platform)
  'booking:force-cancel',
  'booking:reassign',

  // Field service
  'ticket:create',
  'ticket:assign',
  'ticket:progress',
  'ticket:close',

  // Platform administration
  'catalogue:manage',
  'user:manage',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const CUSTOMER_MEMBER: Permission[] = [
  'organisation:read-own',
  'booking:create',
  'booking:cancel',
  'booking:confirm-completion',
  'review:create',
];

const PROVIDER_MEMBER: Permission[] = [
  'organisation:read-own',
  'provider:manage-own',
  'provider:read-own',
  'booking:accept',
  'booking:reject',
  'booking:complete',
  'ticket:create',
];

/**
 * THE single source of truth for level-1 authorisation.
 *
 * Keyed on (organisation kind, membership role) rather than a role column,
 * because the same role means different things on different sides of the
 * marketplace: an OWNER of a CUSTOMER organisation books work, an OWNER of a
 * PROVIDER organisation sells it.
 *
 * Adding a role in V2 (Pilot, Account Manager) is a new entry here — not a new
 * code path anywhere else.
 */
const PERMISSION_MAP: Partial<Record<OrganisationKind, Partial<Record<MembershipRole, Permission[]>>>> =
  {
    CUSTOMER: {
      OWNER: [...CUSTOMER_MEMBER, 'organisation:manage-own'],
      MEMBER: CUSTOMER_MEMBER,
    },
    PROVIDER: {
      OWNER: [
        ...PROVIDER_MEMBER,
        'organisation:manage-own',
        'provider:manage-own',
        'offering:manage',
        'drone:manage',
      ],
      MEMBER: PROVIDER_MEMBER,
    },
    PLATFORM: {
      ADMIN: [...PERMISSIONS],
      SERVICE_ENGINEER: ['ticket:progress', 'ticket:close'],
    },
  };

export function permissionsFor(actor: ActorContext): readonly Permission[] {
  return PERMISSION_MAP[actor.organisationKind]?.[actor.role] ?? [];
}

export function actorHasPermission(actor: ActorContext, permission: Permission): boolean {
  return permissionsFor(actor).includes(permission);
}
