import { Injectable } from '@nestjs/common';

import type { RefreshTokenModel } from '../../../generated/prisma/models';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import type { Tx } from '../../../infrastructure/prisma/transaction';

@Injectable()
export class RefreshTokenRepository {
  constructor(private readonly prisma: PrismaService) {}

  private db(tx?: Tx) {
    return tx ?? this.prisma;
  }

  create(
    data: { userId: string; tokenHash: string; familyId: string; expiresAt: Date },
    tx?: Tx,
  ): Promise<RefreshTokenModel> {
    return this.db(tx).refreshToken.create({ data });
  }

  findByHash(tokenHash: string, tx?: Tx): Promise<RefreshTokenModel | null> {
    return this.db(tx).refreshToken.findUnique({ where: { tokenHash } });
  }

  /** Used on logout. */
  revokeByHash(tokenHash: string, tx?: Tx): Promise<{ count: number }> {
    return this.db(tx).refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Theft response: kill every token descended from the same login. */
  revokeFamily(familyId: string, tx?: Tx): Promise<{ count: number }> {
    return this.db(tx).refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
