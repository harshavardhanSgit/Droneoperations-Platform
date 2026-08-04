import { Injectable } from '@nestjs/common';

import type {
  AssignmentStatus,
  BookingStatus,
  PricingUnit,
  ScheduleStatus,
  SchedulePartyRole,
  TimeWindow,
} from '../../generated/prisma/client';
import type {
  AreaModel,
  BookingAssignmentModel,
  BookingModel,
  BookingScheduleModel,
  BookingStatusHistoryModel,
  OfferingVersionModel,
  OrganisationModel,
  ProviderModel,
  ServiceTypeModel,
} from '../../generated/prisma/models';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type { Tx } from '../../infrastructure/prisma/transaction';

const ACTIVE_ASSIGNMENT: AssignmentStatus[] = ['PENDING', 'ACCEPTED'];

export type BookingWithDetail = BookingModel & {
  serviceType: ServiceTypeModel;
  area: AreaModel;
  customerOrganisation: OrganisationModel;
  assignments: (BookingAssignmentModel & {
    provider: ProviderModel & { organisation: OrganisationModel };
  })[];
  schedules: BookingScheduleModel[];
};

const DETAIL_INCLUDE = {
  serviceType: true,
  area: true,
  customerOrganisation: true,
  assignments: {
    include: { provider: { include: { organisation: true } } },
    orderBy: { assignedAt: 'asc' },
  },
  schedules: { orderBy: { createdAt: 'asc' } },
} as const;

@Injectable()
export class BookingRepository {
  constructor(private readonly prisma: PrismaService) {}

  private db(tx?: Tx) {
    return tx ?? this.prisma;
  }

  create(
    data: {
      customerOrganisationId: string;
      createdByUserId: string;
      serviceTypeId: string;
      areaId: string;
      quantity: number;
      locationNote?: string | undefined;
      pricingUnit: PricingUnit;
      preferredDate: Date;
      preferredWindow: TimeWindow;
    },
    tx?: Tx,
  ): Promise<BookingModel> {
    return this.db(tx).booking.create({ data });
  }

  findById(id: string, tx?: Tx): Promise<BookingWithDetail | null> {
    return this.db(tx).booking.findUnique({ where: { id }, include: DETAIL_INCLUDE });
  }

  listForCustomer(
    customerOrganisationId: string,
    page: { skip: number; take: number },
    status?: BookingStatus,
    tx?: Tx,
  ): Promise<[BookingWithDetail[], number]> {
    const where = { customerOrganisationId, ...(status ? { status } : {}) };

    return Promise.all([
      this.db(tx).booking.findMany({
        where,
        include: DETAIL_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: page.skip,
        take: page.take,
      }),
      this.db(tx).booking.count({ where }),
    ]);
  }

  /**
   * Every booking on the platform, scoped by nothing.
   *
   * The absence of an organisation filter is the whole point and the whole
   * danger: this is the only list method that does not constrain by who is
   * asking, so it must never be reachable without booking:read-any. Kept
   * visibly separate from listForCustomer rather than making that method's
   * organisation argument optional — an optional scope is one forgotten
   * argument away from leaking every booking to every customer.
   */
  listAll(
    page: { skip: number; take: number },
    filters: { status?: BookingStatus } = {},
    tx?: Tx,
  ): Promise<[BookingWithDetail[], number]> {
    const where = { ...(filters.status ? { status: filters.status } : {}) };

    return Promise.all([
      this.db(tx).booking.findMany({
        where,
        include: DETAIL_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: page.skip,
        take: page.take,
      }),
      this.db(tx).booking.count({ where }),
    ]);
  }

  /** A provider's inbox: bookings where THEY hold an assignment. */
  listForProvider(
    providerId: string,
    page: { skip: number; take: number },
    assignmentStatus?: AssignmentStatus,
    tx?: Tx,
  ): Promise<[BookingWithDetail[], number]> {
    const where = {
      assignments: {
        some: { providerId, status: assignmentStatus ?? { in: ACTIVE_ASSIGNMENT } },
      },
    };

    return Promise.all([
      this.db(tx).booking.findMany({
        where,
        include: DETAIL_INCLUDE,
        orderBy: { preferredDate: 'asc' },
        skip: page.skip,
        take: page.take,
      }),
      this.db(tx).booking.count({ where }),
    ]);
  }

  /**
   * F6 — optimistic locking. The WHERE clause pins the version we read, so a
   * concurrent transition that already bumped it yields count 0 and the caller
   * knows it lost rather than overwriting someone else's change.
   */
  transitionStatus(
    input: {
      id: string;
      expectedVersion: number;
      from: BookingStatus;
      to: BookingStatus;
      actorUserId: string;
      actorOrganisationId: string;
      reason?: string | undefined;
      data?: Record<string, unknown>;
    },
    tx?: Tx,
  ): Promise<{ count: number }> {
    return this.db(tx)
      .booking.updateMany({
        where: { id: input.id, version: input.expectedVersion, status: input.from },
        data: {
          status: input.to,
          version: { increment: 1 },
          ...(input.data ?? {}),
        },
      })
      .then(async (result) => {
        if (result.count > 0) {
          // BR16: the transition and its record are written together. A status
          // change without its history entry is unreconstructable.
          await this.db(tx).bookingStatusHistory.create({
            data: {
              bookingId: input.id,
              fromStatus: input.from,
              toStatus: input.to,
              actorUserId: input.actorUserId,
              actorOrganisationId: input.actorOrganisationId,
              reason: input.reason ?? null,
            },
          });
        }
        return result;
      });
  }

  recordCreation(
    input: { id: string; actorUserId: string; actorOrganisationId: string },
    tx?: Tx,
  ): Promise<BookingStatusHistoryModel> {
    return this.db(tx).bookingStatusHistory.create({
      data: {
        bookingId: input.id,
        fromStatus: null,
        toStatus: 'UNASSIGNED',
        actorUserId: input.actorUserId,
        actorOrganisationId: input.actorOrganisationId,
      },
    });
  }

  listHistory(bookingId: string, tx?: Tx): Promise<BookingStatusHistoryModel[]> {
    return this.db(tx).bookingStatusHistory.findMany({
      where: { bookingId },
      orderBy: { createdAt: 'asc' },
    });
  }

  applyQuote(
    id: string,
    quote: { offeringVersionId: string; unitPriceMinor: number; estimatedTotalMinor: number },
    tx?: Tx,
  ): Promise<BookingModel> {
    return this.db(tx).booking.update({ where: { id }, data: quote });
  }

  // ------------------------------------------------------------ assignments

  createAssignment(
    data: {
      bookingId: string;
      providerId: string;
      offeringVersionId: string;
      assignedByUserId: string;
    },
    tx?: Tx,
  ): Promise<BookingAssignmentModel> {
    return this.db(tx).bookingAssignment.create({ data });
  }

  findActiveAssignment(bookingId: string, tx?: Tx): Promise<BookingAssignmentModel | null> {
    return this.db(tx).bookingAssignment.findFirst({
      where: { bookingId, status: { in: ACTIVE_ASSIGNMENT } },
    });
  }

  /** Conditional: only closes an assignment that is still in the expected state. */
  closeAssignment(
    input: {
      id: string;
      from: AssignmentStatus;
      to: AssignmentStatus;
      rejectionReason?: string | undefined;
    },
    tx?: Tx,
  ): Promise<{ count: number }> {
    return this.db(tx).bookingAssignment.updateMany({
      where: { id: input.id, status: input.from },
      data: {
        status: input.to,
        respondedAt: new Date(),
        ...(input.rejectionReason ? { rejectionReason: input.rejectionReason } : {}),
      },
    });
  }

  // -------------------------------------------------------------- schedules

  createSchedule(
    data: {
      bookingId: string;
      proposedDate: Date;
      proposedWindow: TimeWindow;
      proposedByRole: SchedulePartyRole;
      proposedByUserId: string;
      status?: ScheduleStatus;
      confirmedByUserId?: string;
      confirmedAt?: Date;
    },
    tx?: Tx,
  ): Promise<BookingScheduleModel> {
    return this.db(tx).bookingSchedule.create({ data });
  }

  findPendingSchedule(bookingId: string, tx?: Tx): Promise<BookingScheduleModel | null> {
    return this.db(tx).bookingSchedule.findFirst({ where: { bookingId, status: 'PENDING' } });
  }

  findConfirmedSchedule(bookingId: string, tx?: Tx): Promise<BookingScheduleModel | null> {
    return this.db(tx).bookingSchedule.findFirst({ where: { bookingId, status: 'CONFIRMED' } });
  }

  /** Conditional, so a concurrent confirm/supersede cannot double-apply. */
  closeSchedule(
    input: {
      id: string;
      from: ScheduleStatus;
      to: ScheduleStatus;
      confirmedByUserId?: string | undefined;
    },
    tx?: Tx,
  ): Promise<{ count: number }> {
    return this.db(tx).bookingSchedule.updateMany({
      where: { id: input.id, status: input.from },
      data: {
        status: input.to,
        ...(input.to === 'CONFIRMED'
          ? { confirmedByUserId: input.confirmedByUserId ?? null, confirmedAt: new Date() }
          : {}),
      },
    });
  }

  supersedeOpenSchedules(bookingId: string, tx?: Tx): Promise<{ count: number }> {
    return this.db(tx).bookingSchedule.updateMany({
      where: { bookingId, status: { in: ['PENDING', 'CONFIRMED'] } },
      data: { status: 'SUPERSEDED' },
    });
  }
}
