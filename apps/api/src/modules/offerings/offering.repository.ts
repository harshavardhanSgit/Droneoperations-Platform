import { Injectable } from '@nestjs/common';

import type {
  OfferingInclusion,
  OfferingStatus,
  PricingUnit,
} from '../../generated/prisma/client';
import type {
  AreaModel,
  OfferingModel,
  OfferingVersionModel,
  ServiceTypeModel,
} from '../../generated/prisma/models';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type { Tx } from '../../infrastructure/prisma/transaction';

export type OfferingWithDetail = OfferingModel & {
  serviceType: ServiceTypeModel;
  versions: OfferingVersionModel[];
  areas: { area: AreaModel }[];
};

@Injectable()
export class OfferingRepository {
  constructor(private readonly prisma: PrismaService) {}

  private db(tx?: Tx) {
    return tx ?? this.prisma;
  }

  /** Loads the offering with ONLY its current version — the common read. */
  listForProvider(
    providerId: string,
    status?: OfferingStatus,
    tx?: Tx,
  ): Promise<OfferingWithDetail[]> {
    return this.db(tx).offering.findMany({
      where: { providerId, ...(status ? { status } : {}) },
      include: {
        serviceType: true,
        versions: { where: { effectiveTo: null } },
        areas: { include: { area: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  findById(id: string, tx?: Tx): Promise<OfferingWithDetail | null> {
    return this.db(tx).offering.findUnique({
      where: { id },
      include: {
        serviceType: true,
        versions: { where: { effectiveTo: null } },
        areas: { include: { area: true } },
      },
    });
  }

  /** Full price history, oldest first. */
  listVersions(offeringId: string, tx?: Tx): Promise<OfferingVersionModel[]> {
    return this.db(tx).offeringVersion.findMany({
      where: { offeringId },
      orderBy: { versionNumber: 'asc' },
    });
  }

  createOffering(
    data: { providerId: string; serviceTypeId: string },
    tx?: Tx,
  ): Promise<OfferingModel> {
    return this.db(tx).offering.create({ data });
  }

  createVersion(
    data: {
      offeringId: string;
      versionNumber: number;
      unitPriceMinor: number;
      pricingUnit: PricingUnit;
      minQuantity?: number | undefined;
      inclusions: OfferingInclusion[];
      notes?: string | undefined;
      createdByUserId: string;
    },
    tx?: Tx,
  ): Promise<OfferingVersionModel> {
    return this.db(tx).offeringVersion.create({ data });
  }

  /**
   * Closes the current version. Conditional on effectiveTo still being NULL,
   * so a concurrent reprice that already closed it yields count 0 and the
   * caller knows it lost the race rather than silently creating a second
   * "current" version.
   */
  closeCurrentVersion(offeringId: string, at: Date, tx?: Tx): Promise<{ count: number }> {
    return this.db(tx).offeringVersion.updateMany({
      where: { offeringId, effectiveTo: null },
      data: { effectiveTo: at },
    });
  }

  highestVersionNumber(offeringId: string, tx?: Tx): Promise<number> {
    return this.db(tx)
      .offeringVersion.aggregate({
        where: { offeringId },
        _max: { versionNumber: true },
      })
      .then((result) => result._max.versionNumber ?? 0);
  }

  withdraw(id: string, tx?: Tx): Promise<OfferingModel> {
    return this.db(tx).offering.update({ where: { id }, data: { status: 'WITHDRAWN' } });
  }

  replaceAreas(offeringId: string, areaIds: string[], tx?: Tx): Promise<unknown> {
    const db = this.db(tx);

    return db.offeringArea
      .deleteMany({ where: { offeringId } })
      .then(() =>
        areaIds.length
          ? db.offeringArea.createMany({
              data: areaIds.map((areaId) => ({ offeringId, areaId })),
            })
          : null,
      );
  }
}
