import { Injectable } from '@nestjs/common';

import type {
  AreaLevel,
  CatalogueStatus,
  PricingUnit,
} from '../../generated/prisma/client';
import type { AreaModel, ServiceTypeModel } from '../../generated/prisma/models';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type { Tx } from '../../infrastructure/prisma/transaction';

@Injectable()
export class CatalogueRepository {
  constructor(private readonly prisma: PrismaService) {}

  private db(tx?: Tx) {
    return tx ?? this.prisma;
  }

  // -------------------------------------------------------- service types

  listServiceTypes(status?: CatalogueStatus, tx?: Tx): Promise<ServiceTypeModel[]> {
    return this.db(tx).serviceType.findMany({
      where: status ? { status } : {},
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  findServiceTypeById(id: string, tx?: Tx): Promise<ServiceTypeModel | null> {
    return this.db(tx).serviceType.findUnique({ where: { id } });
  }

  findServiceTypeByCode(code: string, tx?: Tx): Promise<ServiceTypeModel | null> {
    return this.db(tx).serviceType.findUnique({ where: { code } });
  }

  createServiceType(
    data: {
      code: string;
      name: string;
      description?: string | undefined;
      pricingUnit: PricingUnit;
      sortOrder?: number;
    },
    tx?: Tx,
  ): Promise<ServiceTypeModel> {
    return this.db(tx).serviceType.create({ data });
  }

  updateServiceType(
    id: string,
    data: {
      name?: string;
      description?: string | null;
      sortOrder?: number;
      status?: CatalogueStatus;
    },
    tx?: Tx,
  ): Promise<ServiceTypeModel> {
    return this.db(tx).serviceType.update({ where: { id }, data });
  }

  // ----------------------------------------------------------------- areas

  /**
   * Children of one node, or top-level states when parentId is undefined.
   * Deliberately NOT a whole-tree fetch: a cascading picker only ever needs
   * one level, and loading every taluka in India to render a state dropdown
   * is how a reference endpoint becomes the slowest call in the system.
   */
  listAreas(
    filter: { parentId?: string | null; level?: AreaLevel; status?: CatalogueStatus },
    tx?: Tx,
  ): Promise<AreaModel[]> {
    return this.db(tx).area.findMany({
      where: {
        ...(filter.parentId !== undefined ? { parentId: filter.parentId } : {}),
        ...(filter.level ? { level: filter.level } : {}),
        ...(filter.status ? { status: filter.status } : {}),
      },
      orderBy: { name: 'asc' },
    });
  }

  findAreaById(id: string, tx?: Tx): Promise<AreaModel | null> {
    return this.db(tx).area.findUnique({ where: { id } });
  }

  createArea(
    data: {
      parentId?: string | undefined;
      level: AreaLevel;
      name: string;
      code?: string | undefined;
    },
    tx?: Tx,
  ): Promise<AreaModel> {
    return this.db(tx).area.create({ data });
  }

  /** Walks up to the root so a UI can show "Warangal, Telangana". */
  async ancestorsOf(id: string, tx?: Tx): Promise<AreaModel[]> {
    const chain: AreaModel[] = [];
    let current = await this.findAreaById(id, tx);

    while (current) {
      chain.unshift(current);
      current = current.parentId ? await this.findAreaById(current.parentId, tx) : null;
    }

    return chain;
  }
}
