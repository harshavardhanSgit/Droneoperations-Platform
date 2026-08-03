import type { MembershipRole, OrganisationKind } from '../../generated/prisma/client';

/**
 * Who is performing the current request, and on whose behalf.
 *
 * Not just a user id: every write in this system belongs to an ORGANISATION,
 * and what the actor may do comes from their membership in it. Services take
 * this rather than a bare userId so ownership checks have everything they need.
 *
 * `principalOrganisationId` is currently always equal to `organisationId`. It
 * exists because D7 (assisted booking — staff acting for a customer) will make
 * them differ, and adding the field later would mean rewriting every service
 * signature.
 */
export interface ActorContext {
  userId: string;
  membershipId: string;
  organisationId: string;
  organisationKind: OrganisationKind;
  role: MembershipRole;
  principalOrganisationId: string;
}
