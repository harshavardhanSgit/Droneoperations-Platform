import { Injectable } from '@nestjs/common';

import type { TicketStatus } from '../../generated/prisma/client';
import type {
  DroneModel,
  MaintenanceTicketModel,
  OrganisationModel,
  ProviderModel,
  TicketEventModel,
} from '../../generated/prisma/models';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type { Tx } from '../../infrastructure/prisma/transaction';

export type TicketWithDetail = MaintenanceTicketModel & {
  drone: DroneModel & { provider: ProviderModel & { organisation: OrganisationModel } };
};

const DETAIL_INCLUDE = {
  drone: { include: { provider: { include: { organisation: true } } } },
} as const;

@Injectable()
export class TicketRepository {
  constructor(private readonly prisma: PrismaService) {}

  private db(tx?: Tx) {
    return tx ?? this.prisma;
  }

  create(
    data: { droneId: string; providerId: string; raisedByUserId: string; description: string },
    tx?: Tx,
  ): Promise<MaintenanceTicketModel> {
    return this.db(tx).maintenanceTicket.create({ data });
  }

  findById(id: string, tx?: Tx): Promise<TicketWithDetail | null> {
    return this.db(tx).maintenanceTicket.findUnique({ where: { id }, include: DETAIL_INCLUDE });
  }

  list(
    filter: { providerId?: string; engineerUserId?: string; status?: TicketStatus },
    page: { skip: number; take: number },
    tx?: Tx,
  ): Promise<[TicketWithDetail[], number]> {
    const where = {
      ...(filter.providerId ? { providerId: filter.providerId } : {}),
      ...(filter.engineerUserId ? { assignedEngineerUserId: filter.engineerUserId } : {}),
      ...(filter.status ? { status: filter.status } : {}),
    };

    return Promise.all([
      this.db(tx).maintenanceTicket.findMany({
        where,
        include: DETAIL_INCLUDE,
        // Oldest first: a work queue that is not FIFO strands the oldest job.
        orderBy: { createdAt: 'asc' },
        skip: page.skip,
        take: page.take,
      }),
      this.db(tx).maintenanceTicket.count({ where }),
    ]);
  }

  /** Status change and its event, written together. Same rule as everywhere else. */
  async transition(
    input: {
      id: string;
      from: TicketStatus;
      to: TicketStatus;
      actorUserId: string;
      note?: string | undefined;
      data?: Record<string, unknown>;
    },
    tx?: Tx,
  ): Promise<{ count: number }> {
    const db = this.db(tx);

    const result = await db.maintenanceTicket.updateMany({
      where: { id: input.id, status: input.from },
      data: { status: input.to, ...(input.data ?? {}) },
    });

    if (result.count > 0) {
      await db.ticketEvent.create({
        data: {
          ticketId: input.id,
          fromStatus: input.from,
          toStatus: input.to,
          actorUserId: input.actorUserId,
          note: input.note ?? null,
        },
      });
    }

    return result;
  }

  async countByStatus(tx?: Tx): Promise<Record<string, number>> {
    const rows = await this.db(tx).maintenanceTicket.groupBy({
      by: ['status'],
      _count: { _all: true },
    });

    return Object.fromEntries(rows.map((row) => [row.status, row._count._all]));
  }

  recordCreation(input: { id: string; actorUserId: string }, tx?: Tx): Promise<TicketEventModel> {
    return this.db(tx).ticketEvent.create({
      data: { ticketId: input.id, fromStatus: null, toStatus: 'OPEN', actorUserId: input.actorUserId },
    });
  }

  listEvents(ticketId: string, tx?: Tx): Promise<TicketEventModel[]> {
    return this.db(tx).ticketEvent.findMany({ where: { ticketId }, orderBy: { createdAt: 'asc' } });
  }
}
