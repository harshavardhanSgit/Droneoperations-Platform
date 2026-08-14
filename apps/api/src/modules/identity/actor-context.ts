import type { MembershipRole, OrganisationKind } from '../../generated/prisma/client';

/** Who is performing the current request, and on whose behalf. */
export interface ActorContext {
  userId: string;
  membershipId: string;
  organisationId: string;
  organisationKind: OrganisationKind;
  role: MembershipRole;
  principalOrganisationId: string;
}
