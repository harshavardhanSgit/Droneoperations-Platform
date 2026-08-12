import { Injectable } from '@nestjs/common';

// Prisma 7 splits these: enums come from ./client, model types come from
// ./models and carry a `Model` suffix so they cannot collide with domain types.
import type { MembershipRole, UserStatus } from '../../../generated/prisma/client';
import type { UserModel } from '../../../generated/prisma/models';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import type { Tx } from '../../../infrastructure/prisma/transaction';



@Injectable()
export class UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  private db(tx?: Tx) {
    return tx ?? this.prisma;
  }

  findByEmail(email: string, tx?: Tx): Promise<UserModel | null> {
    return this.db(tx).user.findUnique({ where: { email } });
  }

  findById(id: string, tx?: Tx): Promise<UserModel | null> {
    return this.db(tx).user.findUnique({ where: { id } });
  }

  /**
   * Active platform staff holding one role. Scoped to PLATFORM organisations so
   * a provider who happens to hold the same role name inside their own business
   * can never appear in an admin picker.
   */
  listPlatformStaff(role: MembershipRole): Promise<UserModel[]> {
    return this.prisma.user.findMany({
      where: {
        status: 'ACTIVE',
        memberships: {
          some: { role, status: 'ACTIVE', organisation: { kind: 'PLATFORM' } },
        },
      },
      orderBy: { fullName: 'asc' },
    });
  }

  /**
   * Every platform account, with the role each one holds.
   *
   * listPlatformStaff answers "who can take a ticket". This answers "who has
   * access to this platform at all", which is a different question and the one
   * the admin users screen asks — so it must include ADMINs, and it must carry
   * the role rather than assuming it.
   */
  listAllPlatformStaff(): Promise<(UserModel & { memberships: { role: MembershipRole }[] })[]> {
    return this.prisma.user.findMany({
      where: {
        memberships: { some: { status: 'ACTIVE', organisation: { kind: 'PLATFORM' } } },
      },
      include: {
        memberships: {
          where: { status: 'ACTIVE', organisation: { kind: 'PLATFORM' } },
          select: { role: true },
        },
      },
      orderBy: { fullName: 'asc' },
    });
  }

  create(
    data: {
      email: string;
      passwordHash: string;
      fullName: string;
      phone?: string | undefined;
      status?: UserStatus;
    },
    tx?: Tx,
  ): Promise<UserModel> {
    return this.db(tx).user.create({ data });
  }

  /**
   * The user's own editable details.
   *
   * Email is absent on purpose: it is the login identity, so changing it is a
   * re-verification flow (prove the new address, keep the old one working
   * until then), not a profile edit. Letting it be PATCHed here would let
   * anyone with a stolen access token lock the owner out of their account.
   */
  updateProfile(
    id: string,
    data: { fullName?: string; phone?: string | null },
    tx?: Tx,
  ): Promise<UserModel> {
    return this.db(tx).user.update({ where: { id }, data });
  }

  updatePassword(id: string, passwordHash: string, tx?: Tx): Promise<UserModel> {
    return this.db(tx).user.update({ where: { id }, data: { passwordHash } });
  }
}
