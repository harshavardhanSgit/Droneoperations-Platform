import type { MembershipRole, OrganisationKind } from '../../generated/prisma/client';
import type { ActorContext } from './actor-context';

/** Every capability in the system. */
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
  'booking:read-any',
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
  // BR9 — cancellation is available to EITHER party before completion.
  'booking:cancel',
  'ticket:create',
];

/** THE single source of truth for level-1 authorisation. */
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
