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
}
