import { Injectable } from '@nestjs/common';

import type {
  MembershipRole,
  OrganisationKind,
  OrganisationType,
} from '../../generated/prisma/client';
import type { MembershipModel, OrganisationModel } from '../../generated/prisma/models';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type { Tx } from '../../infrastructure/prisma/transaction';

export type MembershipWithOrganisation = MembershipModel & {
  organisation: OrganisationModel;
};

/**
 * Memberships live here rather than in their own repository because they are
 * INSIDE the Organisation aggregate — see docs/architecture/aggregates-and-invariants.md.
 * A membership is never loaded or written independently of its organisation.
 */
@Injectable()
export class OrganisationRepository {
  constructor(private readonly prisma: PrismaService) {}

  private db(tx?: Tx) {
    return tx ?? this.prisma;
  }

  create(
    data: { name: string; kind: OrganisationKind; type: OrganisationType },
    tx?: Tx,
  ): Promise<OrganisationModel> {
    return this.db(tx).organisation.create({ data });
  }

  addMembership(
    data: { userId: string; organisationId: string; role: MembershipRole },
    tx?: Tx,
  ): Promise<MembershipModel> {
    return this.db(tx).membership.create({ data });
  }

  /**
   * Both the membership AND its organisation must be ACTIVE — suspending an
   * organisation must lock out every one of its members, not just new ones.
   */
  findActiveMemberships(userId: string, tx?: Tx): Promise<MembershipWithOrganisation[]> {
    return this.db(tx).membership.findMany({
      where: {
        userId,
        status: 'ACTIVE',
        organisation: { status: 'ACTIVE' },
      },
      include: { organisation: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  findById(id: string, tx?: Tx): Promise<OrganisationModel | null> {
    return this.db(tx).organisation.findUnique({ where: { id } });
  }

  async list(
    filter: { kind?: OrganisationKind },
    page: { skip: number; take: number },
    tx?: Tx,
  ): Promise<{ items: OrganisationModel[]; total: number }> {
    const where = filter.kind ? { kind: filter.kind } : {};

    const [items, total] = await Promise.all([
      this.db(tx).organisation.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: page.skip,
        take: page.take,
      }),
      this.db(tx).organisation.count({ where }),
    ]);

    return { items, total };
  }

  updateName(id: string, name: string, tx?: Tx): Promise<OrganisationModel> {
    return this.db(tx).organisation.update({ where: { id }, data: { name } });
  }
}
