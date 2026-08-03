import { Injectable } from '@nestjs/common';

import type { Serviceability } from '../../generated/prisma/client';
import type { DroneModel } from '../../generated/prisma/models';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type { Tx } from '../../infrastructure/prisma/transaction';

const OPEN_TICKETS = ['OPEN', 'ASSIGNED', 'IN_PROGRESS'] as const;

export type DroneWithTicketCount = DroneModel & { _count: { tickets: number } };

@Injectable()
export class DroneRepository {
  constructor(private readonly prisma: PrismaService) {}

  private db(tx?: Tx) {
    return tx ?? this.prisma;
  }

  listForProvider(providerId: string, tx?: Tx): Promise<DroneWithTicketCount[]> {
    return this.db(tx).drone.findMany({
      where: { providerId, serviceability: { not: 'RETIRED' } },
      include: { _count: { select: { tickets: { where: { status: { in: [...OPEN_TICKETS] } } } } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  findById(id: string, tx?: Tx): Promise<DroneModel | null> {
    return this.db(tx).drone.findUnique({ where: { id } });
  }

  create(
    data: {
      providerId: string;
      model: string;
      registrationNumber: string;
      capacityLitres?: number | undefined;
    },
    tx?: Tx,
  ): Promise<DroneModel> {
    return this.db(tx).drone.create({ data });
  }

  update(
    id: string,
    data: { model?: string; capacityLitres?: number; serviceability?: Serviceability },
    tx?: Tx,
  ): Promise<DroneModel> {
    return this.db(tx).drone.update({ where: { id }, data });
  }

  /** Called by Field Service when a ticket opens or closes. */
  setServiceability(id: string, serviceability: Serviceability, tx?: Tx): Promise<DroneModel> {
    return this.db(tx).drone.update({ where: { id }, data: { serviceability } });
  }

  countOpenTickets(droneId: string, tx?: Tx): Promise<number> {
    return this.db(tx).maintenanceTicket.count({
      where: { droneId, status: { in: [...OPEN_TICKETS] } },
    });
  }
}
