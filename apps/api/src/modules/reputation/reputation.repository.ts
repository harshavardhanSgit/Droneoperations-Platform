import { Injectable } from '@nestjs/common';

import type { OrganisationModel, ReviewModel } from '../../generated/prisma/models';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type { Tx } from '../../infrastructure/prisma/transaction';

export type ReviewWithCustomer = ReviewModel & { customerOrganisation?: OrganisationModel };

@Injectable()
export class ReputationRepository {
  constructor(private readonly prisma: PrismaService) {}

  private db(tx?: Tx) {
    return tx ?? this.prisma;
  }

  create(
    data: {
      bookingId: string;
      providerId: string;
      customerOrganisationId: string;
      rating: number;
      comment?: string | undefined;
      createdByUserId: string;
    },
    tx?: Tx,
  ): Promise<ReviewModel> {
    return this.db(tx).review.create({ data });
  }

  findByBooking(bookingId: string, tx?: Tx): Promise<ReviewModel | null> {
    return this.db(tx).review.findUnique({ where: { bookingId } });
  }

  listForProvider(providerId: string, take = 20, tx?: Tx): Promise<ReviewModel[]> {
    return this.db(tx).review.findMany({
      where: { providerId },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  /** Aggregated in the database, not by loading every review into memory. */
  async ratingFor(providerId: string, tx?: Tx): Promise<{ average: number | null; count: number }> {
    const result = await this.db(tx).review.aggregate({
      where: { providerId },
      _avg: { rating: true },
      _count: { _all: true },
    });

    return {
      average: result._avg.rating === null ? null : Math.round(result._avg.rating * 10) / 10,
      count: result._count._all,
    };
  }

  organisationNames(ids: string[], tx?: Tx): Promise<OrganisationModel[]> {
    return this.db(tx).organisation.findMany({ where: { id: { in: ids } } });
  }
}
