import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import {
  AccessDeniedException,
  InvalidInputException,
  ResourceConflictException,
  ResourceNotFoundException,
} from '../../common/errors/app.exception';
import { Prisma } from '../../generated/prisma/client';
import type { BookingStatus, SchedulePartyRole, TimeWindow } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type { ActorContext } from '../identity/actor-context';
import { OfferingRepository } from '../offerings/offering.repository';
import { ProviderRepository } from '../organisations/provider.repository';
import { BOOKING_EVENTS } from './booking.events';
import { assertNotTerminal, assertTransition } from './booking.state-machine';
import { BookingRepository, type BookingWithDetail } from './booking.repository';
import type {
  BookingAssignmentDto,
  CompleteBookingDto,
  ProposeScheduleDto,
  BookingDetailDto,
  BookingDto,
  BookingListDto,
  CreateBookingDto,
} from './dto/booking.dto';

const UNIQUE_VIOLATION = 'P2002';

@Injectable()
export class BookingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bookings: BookingRepository,
    private readonly offerings: OfferingRepository,
    private readonly providers: ProviderRepository,
    private readonly events: EventEmitter2,
  ) {}

  // ------------------------------------------------------------- customer

  async create(actor: ActorContext, dto: CreateBookingDto): Promise<BookingDetailDto> {
    if (actor.organisationKind !== 'CUSTOMER') {
      throw new AccessDeniedException('Only a customer organisation can create a booking');
    }

    const offering = dto.offeringId ? await this.requireBookableOffering(dto.offeringId) : null;

    if (offering) {
      this.assertOfferingMatches(offering, dto.serviceTypeId, dto.areaId, dto.quantity);
      this.assertNotSelfBooking(actor, offering.providerId);
    }

    const booking = await this.prisma.$transaction(async (tx) => {
      const created = await this.bookings.create(
        {
          // D7: the work is FOR the principal, created BY the actor. Identical
          // today; different the moment staff book on a farmer's behalf.
          customerOrganisationId: actor.principalOrganisationId,
          createdByUserId: actor.userId,
          serviceTypeId: dto.serviceTypeId,
          areaId: dto.areaId,
          quantity: dto.quantity,
          locationNote: dto.locationNote?.trim(),
          latitude: dto.latitude,
          longitude: dto.longitude,
          pricingUnit: offering?.versions[0]?.pricingUnit ?? 'PER_ACRE',
          preferredDate: new Date(dto.preferredDate),
          preferredWindow: dto.preferredWindow,
        },
        tx,
      );

      await this.bookings.recordCreation(
        {
          id: created.id,
          actorUserId: actor.userId,
          actorOrganisationId: actor.organisationId,
        },
        tx,
      );

      return created;
    });

    // Assigning is a separate transition, not part of creation. A booking is a
    // valid object with no provider — which is precisely what lets V2 create it
    // first and auto-assign afterwards (S1).
    if (dto.offeringId) {
      return this.assign(actor, booking.id, dto.offeringId);
    }

    return this.detail(await this.requireBooking(booking.id));
  }

  /** UNASSIGNED -> ASSIGNED. Also the path a rejected booking takes again (D9). */
  async assign(
    actor: ActorContext,
    bookingId: string,
    offeringId: string,
  ): Promise<BookingDetailDto> {
    const booking = await this.requireAssignable(actor, bookingId);
    const offering = await this.requireBookableOffering(offeringId);
    const version = offering.versions[0];

    if (!version) {
      throw new ResourceConflictException('OFFERING_HAS_NO_PRICE', 'That offering has no active price');
    }

    this.assertOfferingMatches(offering, booking.serviceTypeId, booking.areaId, booking.quantity);
    this.assertNotSelfBooking(actor, offering.providerId);
    assertTransition(booking.status, 'ASSIGNED');

    try {
      await this.prisma.$transaction(async (tx) => {
        const moved = await this.bookings.transitionStatus(
          {
            id: booking.id,
            expectedVersion: booking.version,
            from: booking.status,
            to: 'ASSIGNED',
            actorUserId: actor.userId,
            actorOrganisationId: actor.organisationId,
          },
          tx,
        );

        this.assertWon(moved.count);

        await this.bookings.createAssignment(
          {
            bookingId: booking.id,
            providerId: offering.providerId,
            offeringVersionId: version.id,
            assignedByUserId: actor.userId,
            // S1 in practice. The strategy column and every value in it were
            // written on day one; an operator stepping in is a value that was
            // already legal, not a schema change. V2's auto-assignment adds
            // PLATFORM_AUTO here and touches nothing else.
            strategy:
              actor.organisationKind === 'PLATFORM' ? 'PLATFORM_MANAGED' : 'CUSTOMER_CHOICE',
          },
          tx,
        );

        // The customer's preferred date becomes the opening proposal. Seeding
        // it here rather than at creation means an UNASSIGNED booking carries a
        // preference, not a commitment — nobody has agreed to anything yet.
        await this.bookings.supersedeOpenSchedules(booking.id, tx);
        await this.bookings.createSchedule(
          {
            bookingId: booking.id,
            proposedDate: booking.preferredDate,
            proposedWindow: booking.preferredWindow,
            proposedByRole: 'CUSTOMER',
            proposedByUserId: booking.createdByUserId,
          },
          tx,
        );

        // F3: the quote is frozen against an immutable version. If the provider
        // reprices tomorrow, this booking keeps today's terms.
        await this.bookings.applyQuote(
          booking.id,
          {
            offeringVersionId: version.id,
            unitPriceMinor: version.unitPriceMinor,
            estimatedTotalMinor: version.unitPriceMinor * booking.quantity,
          },
          tx,
        );
      });
    } catch (error) {
      // The partial unique index refused a second active assignment.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === UNIQUE_VIOLATION) {
        throw new ResourceConflictException(
          'BOOKING_ALREADY_ASSIGNED',
          'This booking already has an active assignment',
        );
      }
      throw error;
    }

    const reloaded = await this.requireBooking(booking.id);
    this.emit(BOOKING_EVENTS.ASSIGNED, this.baseEvent(reloaded));

    return this.detail(reloaded);
  }

  async cancel(actor: ActorContext, bookingId: string, reason: string): Promise<BookingDetailDto> {
    const booking = await this.requireCancellable(actor, bookingId);

    assertNotTerminal(booking.status);
    assertTransition(booking.status, 'CANCELLED');

    await this.prisma.$transaction(async (tx) => {
      const active = await this.bookings.findActiveAssignment(booking.id, tx);

      if (active) {
        await this.bookings.closeAssignment({ id: active.id, from: active.status, to: 'CANCELLED' }, tx);
      }

      const moved = await this.bookings.transitionStatus(
        {
          id: booking.id,
          expectedVersion: booking.version,
          from: booking.status,
          to: 'CANCELLED',
          actorUserId: actor.userId,
          actorOrganisationId: actor.organisationId,
          reason,
          data: { cancelledReason: reason, cancelledAt: new Date() },
        },
        tx,
      );

      this.assertWon(moved.count);
    });

    const reloaded = await this.requireBooking(booking.id);
    this.emit(BOOKING_EVENTS.CANCELLED, {
      ...this.baseEvent(booking),
      reason,
      cancelledByRole: actor.organisationKind === 'PROVIDER' ? 'PROVIDER' : 'CUSTOMER',
    });

    return this.detail(reloaded);
  }

  // ------------------------------------------------------------- provider

  /** BR3 — only the actively assigned provider may answer. */
  async accept(actor: ActorContext, bookingId: string): Promise<BookingDetailDto> {
    const { booking, assignment } = await this.requireAssignedToMe(actor, bookingId);

    assertTransition(booking.status, 'SCHEDULED');

    await this.prisma.$transaction(async (tx) => {
      const closed = await this.bookings.closeAssignment(
        { id: assignment.id, from: 'PENDING', to: 'ACCEPTED' },
        tx,
      );

      this.assertWon(closed.count);

      // Accepting the job also accepts the date the customer proposed. If the
      // provider wants a different date they propose one instead of accepting.
      const pending = await this.bookings.findPendingSchedule(booking.id, tx);

      if (pending) {
        if (pending.proposedByRole === 'PROVIDER') {
          throw new ResourceConflictException(
            'SCHEDULE_AWAITING_CUSTOMER',
            'You proposed a different date. The customer must confirm it.',
          );
        }

        this.assertWon(
          (
            await this.bookings.closeSchedule(
              { id: pending.id, from: 'PENDING', to: 'CONFIRMED', confirmedByUserId: actor.userId },
              tx,
            )
          ).count,
        );
      }

      const moved = await this.bookings.transitionStatus(
        {
          id: booking.id,
          expectedVersion: booking.version,
          from: booking.status,
          to: 'SCHEDULED',
          actorUserId: actor.userId,
          actorOrganisationId: actor.organisationId,
        },
        tx,
      );

      this.assertWon(moved.count);
    });

    const reloaded = await this.requireBooking(booking.id);
    this.emit(BOOKING_EVENTS.ACCEPTED, this.baseEvent(reloaded));

    return this.detail(reloaded);
  }

  // ------------------------------------------------------------ scheduling

  /**
   * Either party proposes; the OTHER confirms (BR15). The same pair of methods
   * serves the initial agreement and every later reschedule — a reschedule is
   * not a different operation, it is the same negotiation run again.
   */
  async proposeSchedule(
    actor: ActorContext,
    bookingId: string,
    dto: ProposeScheduleDto,
  ): Promise<BookingDetailDto> {
    const { booking, role } = await this.requireParty(actor, bookingId);

    assertNotTerminal(booking.status);

    if (booking.status === 'UNASSIGNED') {
      throw new ResourceConflictException(
        'BOOKING_NOT_ASSIGNED',
        'Choose a provider before agreeing a date',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      // Supersede whatever was open. Only one proposal may be outstanding, or
      // "confirm" is ambiguous — and a partial unique index enforces it.
      await this.bookings.supersedeOpenSchedules(booking.id, tx);

      await this.bookings.createSchedule(
        {
          bookingId: booking.id,
          proposedDate: new Date(dto.date),
          proposedWindow: dto.window,
          proposedByRole: role,
          proposedByUserId: actor.userId,
        },
        tx,
      );
    });

    const reloaded = await this.requireBooking(booking.id);
    this.emit(BOOKING_EVENTS.SCHEDULE_PROPOSED, {
      ...this.baseEvent(reloaded),
      date: dto.date,
      window: dto.window,
      actedByRole: role,
    });

    return this.detail(reloaded);
  }

  async confirmSchedule(actor: ActorContext, bookingId: string): Promise<BookingDetailDto> {
    const { booking, role } = await this.requireParty(actor, bookingId);

    assertNotTerminal(booking.status);

    const pending = await this.bookings.findPendingSchedule(booking.id);

    if (!pending) {
      throw new ResourceConflictException('NO_PENDING_SCHEDULE', 'There is no date awaiting confirmation');
    }

    // BR15 — the proposer cannot confirm their own proposal.
    if (pending.proposedByRole === role) {
      throw new AccessDeniedException('The other party must confirm the date you proposed');
    }

    await this.prisma.$transaction(async (tx) => {
      this.assertWon(
        (
          await this.bookings.closeSchedule(
            { id: pending.id, from: 'PENDING', to: 'CONFIRMED', confirmedByUserId: actor.userId },
            tx,
          )
        ).count,
      );

      // If the job itself is still awaiting an answer, confirming the date is
      // also the acceptance — the provider proposed terms, the customer agreed.
      if (booking.status === 'ASSIGNED') {
        const assignment = await this.bookings.findActiveAssignment(booking.id, tx);

        if (assignment && assignment.status === 'PENDING') {
          this.assertWon(
            (await this.bookings.closeAssignment({ id: assignment.id, from: 'PENDING', to: 'ACCEPTED' }, tx))
              .count,
          );
        }

        this.assertWon(
          (
            await this.bookings.transitionStatus(
              {
                id: booking.id,
                expectedVersion: booking.version,
                from: 'ASSIGNED',
                to: 'SCHEDULED',
                actorUserId: actor.userId,
                actorOrganisationId: actor.organisationId,
              },
              tx,
            )
          ).count,
        );
      }
    });

    const reloaded = await this.requireBooking(booking.id);
    this.emit(BOOKING_EVENTS.SCHEDULE_CONFIRMED, {
      ...this.baseEvent(reloaded),
      date: pending.proposedDate.toISOString().slice(0, 10),
      window: pending.proposedWindow,
      actedByRole: role,
    });

    return this.detail(reloaded);
  }

  // ------------------------------------------------------------ completion

  /** D10, step 1. Only the assigned provider, and only what was actually done. */
  async markComplete(
    actor: ActorContext,
    bookingId: string,
    dto: CompleteBookingDto,
  ): Promise<BookingDetailDto> {
    const provider = await this.requireProvider(actor);
    const booking = await this.requireBooking(bookingId);
    const assignment = booking.assignments.find(
      (a) => a.status === 'ACCEPTED' && a.providerId === provider.id,
    );

    if (!assignment) {
      throw new ResourceNotFoundException('Booking', bookingId);
    }

    assertTransition(booking.status, 'AWAITING_CONFIRMATION');

    // BR14: the final amount is computed from what was DELIVERED, not what was
    // booked. Spraying 18 of 20 acres bills 18.
    const unitPrice = booking.unitPriceMinor;

    await this.prisma.$transaction(async (tx) => {
      this.assertWon(
        (
          await this.bookings.transitionStatus(
            {
              id: booking.id,
              expectedVersion: booking.version,
              from: booking.status,
              to: 'AWAITING_CONFIRMATION',
              actorUserId: actor.userId,
              actorOrganisationId: actor.organisationId,
              data: {
                finalQuantity: dto.finalQuantity,
                finalAmountMinor: unitPrice !== null ? unitPrice * dto.finalQuantity : null,
                completionNote: dto.note?.trim() ?? null,
              },
            },
            tx,
          )
        ).count,
      );
    });

    const reloaded = await this.requireBooking(booking.id);
    this.emit(BOOKING_EVENTS.WORK_COMPLETED, {
      ...this.baseEvent(reloaded),
      finalQuantity: reloaded.finalQuantity ?? undefined,
      finalAmountMinor: reloaded.finalAmountMinor ?? undefined,
    });

    return this.detail(reloaded);
  }

  /** D10, step 2. Only the customer closes the job. */
  async confirmCompletion(actor: ActorContext, bookingId: string): Promise<BookingDetailDto> {
    const booking = await this.requireOwnBooking(actor, bookingId);

    assertTransition(booking.status, 'COMPLETED');

    await this.prisma.$transaction(async (tx) => {
      this.assertWon(
        (
          await this.bookings.transitionStatus(
            {
              id: booking.id,
              expectedVersion: booking.version,
              from: booking.status,
              to: 'COMPLETED',
              actorUserId: actor.userId,
              actorOrganisationId: actor.organisationId,
              data: { completedAt: new Date() },
            },
            tx,
          )
        ).count,
      );
    });

    const reloaded = await this.requireBooking(booking.id);
    this.emit(BOOKING_EVENTS.COMPLETION_CONFIRMED, this.baseEvent(reloaded));

    return this.detail(reloaded);
  }

  /**
   * D9 — rejection returns the booking to UNASSIGNED with everything intact.
   * The rejected assignment stays as history, which is why S1 models this as a
   * table rather than a provider_id column.
   */
  async reject(actor: ActorContext, bookingId: string, reason: string): Promise<BookingDetailDto> {
    const { booking, assignment } = await this.requireAssignedToMe(actor, bookingId);

    assertTransition(booking.status, 'UNASSIGNED');

    await this.prisma.$transaction(async (tx) => {
      const closed = await this.bookings.closeAssignment(
        { id: assignment.id, from: 'PENDING', to: 'REJECTED', rejectionReason: reason },
        tx,
      );

      this.assertWon(closed.count);

      const moved = await this.bookings.transitionStatus(
        {
          id: booking.id,
          expectedVersion: booking.version,
          from: booking.status,
          to: 'UNASSIGNED',
          actorUserId: actor.userId,
          actorOrganisationId: actor.organisationId,
          reason,
          // The quote is cleared: it belonged to the provider who declined.
          data: { offeringVersionId: null, unitPriceMinor: null, estimatedTotalMinor: null },
        },
        tx,
      );

      this.assertWon(moved.count);
    });

    // Built from the PRE-transition snapshot: after rejection the assignment is
    // no longer active, so the reloaded booking no longer knows who declined.
    this.emit(BOOKING_EVENTS.REJECTED, { ...this.baseEvent(booking), reason });

    return this.detail(await this.requireBooking(booking.id));
  }

  // ---------------------------------------------------------------- reads

  async listOwn(
    actor: ActorContext,
    page: { skip: number; take: number },
    status?: BookingStatus,
  ): Promise<BookingListDto> {
    const [items, total] = await this.bookings.listForCustomer(
      actor.principalOrganisationId,
      page,
      status,
    );

    return { items: items.map((item) => this.toDto(item)), total };
  }

  /** Counts by status, for the operator's dashboard. Owned here because Booking owns booking state. */
  countByStatus(): Promise<Record<string, number>> {
    return this.bookings.countByStatus();
  }

  /**
   * The operator's view: every booking, unscoped.
   *
   * Deliberately takes no ActorContext. There is no ownership rule to apply —
   * the guard's booking:read-any permission IS the authorisation, and accepting
   * an actor here would imply a second check that does not exist.
   */
  async listAll(
    page: { skip: number; take: number },
    status?: BookingStatus,
  ): Promise<BookingListDto> {
    const [items, total] = await this.bookings.listAll(page, status ? { status } : {});

    return { items: items.map((item) => this.toDto(item)), total };
  }

  async listAssignedToMe(
    actor: ActorContext,
    page: { skip: number; take: number },
    assignmentStatus?: string,
  ): Promise<BookingListDto> {
    const provider = await this.requireProvider(actor);

    const [items, total] = await this.bookings.listForProvider(
      provider.id,
      page,
      assignmentStatus as never,
    );

    return { items: items.map((item) => this.toDto(item)), total };
  }

  async findOne(actor: ActorContext, bookingId: string): Promise<BookingDetailDto> {
    const booking = await this.requireBooking(bookingId);

    await this.assertMayView(actor, booking);

    return this.detail(booking);
  }

  // -------------------------------------------------------------- private

  private assertWon(count: number): void {
    if (count === 0) {
      throw new ResourceConflictException(
        'BOOKING_CONCURRENTLY_MODIFIED',
        'This booking changed while you were working on it. Reload and try again.',
      );
    }
  }

  private async requireBooking(id: string): Promise<BookingWithDetail> {
    const booking = await this.bookings.findById(id);

    if (!booking) {
      throw new ResourceNotFoundException('Booking', id);
    }

    return booking;
  }

  /**
   * Who may choose a provider: the customer, or platform staff stepping in on a
   * job that is going nowhere (J6). Never a provider — a provider assigning
   * themselves work is the marketplace failing.
   */
  private async requireAssignable(
    actor: ActorContext,
    id: string,
  ): Promise<BookingWithDetail> {
    const booking = await this.requireBooking(id);

    if (booking.customerOrganisationId === actor.principalOrganisationId) {
      return booking;
    }

    if (actor.organisationKind === 'PLATFORM') {
      return booking;
    }

    throw new ResourceNotFoundException('Booking', id);
  }

  /**
   * Who may cancel: the customer, the actively assigned provider (BR9 — either
   * party), or platform staff intervening on a stuck job (FR-ADMIN-3).
   *
   * Deliberately NOT a widened requireOwnBooking. That helper also guards
   * assign() and confirmCompletion(), and confirming completion is the
   * customer's alone (D10) — loosening it there would let an operator sign off
   * work on a customer's behalf. Cancellation has its own rule, so it gets its
   * own check.
   */
  private async requireCancellable(
    actor: ActorContext,
    id: string,
  ): Promise<BookingWithDetail> {
    const booking = await this.requireBooking(id);

    if (booking.customerOrganisationId === actor.principalOrganisationId) {
      return booking;
    }

    if (actor.organisationKind === 'PLATFORM') {
      return booking;
    }

    if (actor.organisationKind === 'PROVIDER') {
      const provider = await this.providers.findByOrganisation(actor.organisationId);
      const active = booking.assignments.find(
        (a) => a.providerId === provider?.id && (a.status === 'PENDING' || a.status === 'ACCEPTED'),
      );

      if (active) {
        return booking;
      }
    }

    throw new ResourceNotFoundException('Booking', id);
  }

  private async requireOwnBooking(
    actor: ActorContext,
    id: string,
  ): Promise<BookingWithDetail> {
    const booking = await this.requireBooking(id);

    if (booking.customerOrganisationId !== actor.principalOrganisationId) {
      throw new ResourceNotFoundException('Booking', id);
    }

    return booking;
  }

  private async requireAssignedToMe(actor: ActorContext, bookingId: string) {
    const provider = await this.requireProvider(actor);
    const booking = await this.requireBooking(bookingId);
    const assignment = booking.assignments.find(
      (candidate) => candidate.status === 'PENDING' && candidate.providerId === provider.id,
    );

    if (!assignment) {
      throw new ResourceNotFoundException('Booking', bookingId);
    }

    return { booking, assignment };
  }

  private async assertMayView(actor: ActorContext, booking: BookingWithDetail): Promise<void> {
    if (booking.customerOrganisationId === actor.principalOrganisationId) {
      return;
    }

    if (actor.organisationKind === 'PLATFORM') {
      return;
    }

    if (actor.organisationKind === 'PROVIDER') {
      const provider = await this.requireProvider(actor);

      // A provider may see a booking they were ever asked about — including
      // one they rejected, so their own history stays readable.
      if (booking.assignments.some((a) => a.providerId === provider.id)) {
        return;
      }
    }

    throw new ResourceNotFoundException('Booking', booking.id);
  }

  /** Which side of this booking the actor is on. Neither -> not their booking. */
  private async requireParty(
    actor: ActorContext,
    bookingId: string,
  ): Promise<{ booking: BookingWithDetail; role: SchedulePartyRole }> {
    const booking = await this.requireBooking(bookingId);

    if (booking.customerOrganisationId === actor.principalOrganisationId) {
      return { booking, role: 'CUSTOMER' };
    }

    if (actor.organisationKind === 'PROVIDER') {
      const provider = await this.requireProvider(actor);
      const active = booking.assignments.find(
        (a) => a.providerId === provider.id && (a.status === 'PENDING' || a.status === 'ACCEPTED'),
      );

      if (active) {
        return { booking, role: 'PROVIDER' };
      }
    }

    throw new ResourceNotFoundException('Booking', bookingId);
  }

  private async requireProvider(actor: ActorContext) {
    if (actor.organisationKind !== 'PROVIDER') {
      throw new AccessDeniedException('This account is not a provider organisation');
    }

    const provider = await this.providers.findByOrganisation(actor.organisationId);

    if (!provider) {
      throw new ResourceNotFoundException('Provider profile', actor.organisationId);
    }

    return provider;
  }

  private async requireBookableOffering(offeringId: string) {
    const offering = await this.offerings.findById(offeringId);

    if (!offering || offering.status !== 'ACTIVE') {
      throw new ResourceNotFoundException('Offering', offeringId);
    }

    const provider = await this.providers.findById(offering.providerId);

    // BR1 restated at the point of use. Discovery filters activated providers,
    // but a client can post any offering id — the rule must hold here too.
    if (!provider || provider.stage !== 'ACTIVATED') {
      throw new InvalidInputException('That provider is not currently accepting bookings', {
        offeringId,
      });
    }

    return offering;
  }

  private assertOfferingMatches(
    offering: Awaited<ReturnType<OfferingRepository['findById']>>,
    serviceTypeId: string,
    areaId: string,
    quantity: number,
  ): void {
    if (!offering) return;

    if (offering.serviceTypeId !== serviceTypeId) {
      throw new InvalidInputException('That offering is for a different service');
    }

    if (!offering.areas.some((link) => link.area.id === areaId)) {
      throw new InvalidInputException('That provider does not serve this area');
    }

    const version = offering.versions[0];
    const minimum = version?.minQuantity ?? null;

    if (minimum !== null && quantity < minimum) {
      throw new InvalidInputException(
        `That provider's minimum job is ${minimum} units`,
        { minQuantity: minimum, requested: quantity },
      );
    }
  }

  /** BR17 — a provider may not book their own services. */
  private assertNotSelfBooking(actor: ActorContext, providerId: string): void {
    if (actor.organisationKind === 'PROVIDER') {
      throw new AccessDeniedException('A provider cannot book their own services');
    }
    void providerId;
  }

  private toDto(booking: BookingWithDetail): BookingDto {
    const active = booking.assignments.find(
      (a) => a.status === 'PENDING' || a.status === 'ACCEPTED',
    );
    const confirmed = booking.schedules.find((sch) => sch.status === 'CONFIRMED');
    const pending = booking.schedules.find((sch) => sch.status === 'PENDING');

    return {
      id: booking.id,
      status: booking.status,
      serviceTypeId: booking.serviceTypeId,
      serviceTypeName: booking.serviceType.name,
      areaId: booking.areaId,
      areaName: booking.area.name,
      quantity: booking.quantity,
      pricingUnit: booking.pricingUnit,
      ...(booking.locationNote ? { locationNote: booking.locationNote } : {}),
      ...(booking.latitude !== null && booking.longitude !== null
        ? { latitude: booking.latitude, longitude: booking.longitude }
        : {}),
      preferredDate: booking.preferredDate.toISOString().slice(0, 10),
      preferredWindow: booking.preferredWindow,
      ...(booking.unitPriceMinor !== null ? { unitPriceMinor: booking.unitPriceMinor } : {}),
      ...(booking.estimatedTotalMinor !== null
        ? { estimatedTotalMinor: booking.estimatedTotalMinor }
        : {}),
      currency: booking.currency,
      customerName: booking.customerOrganisation.name,
      ...(active ? { activeAssignment: this.toAssignmentDto(active) } : {}),
      ...(confirmed
        ? {
            confirmedDate: confirmed.proposedDate.toISOString().slice(0, 10),
            confirmedWindow: confirmed.proposedWindow,
          }
        : {}),
      ...(pending
        ? {
            pendingSchedule: {
              date: pending.proposedDate.toISOString().slice(0, 10),
              window: pending.proposedWindow,
              proposedBy: pending.proposedByRole,
            },
          }
        : {}),
      ...(booking.finalQuantity !== null ? { finalQuantity: booking.finalQuantity } : {}),
      ...(booking.finalAmountMinor !== null ? { finalAmountMinor: booking.finalAmountMinor } : {}),
      ...(booking.completionNote ? { completionNote: booking.completionNote } : {}),
      ...(booking.cancelledReason ? { cancelledReason: booking.cancelledReason } : {}),
      createdAt: booking.createdAt.toISOString(),
    };
  }

  private async detail(booking: BookingWithDetail): Promise<BookingDetailDto> {
    const history = await this.bookings.listHistory(booking.id);

    return {
      ...this.toDto(booking),
      assignments: booking.assignments.map((a) => this.toAssignmentDto(a)),
      history: history.map((entry) => ({
        ...(entry.fromStatus ? { fromStatus: entry.fromStatus } : {}),
        toStatus: entry.toStatus,
        ...(entry.reason ? { reason: entry.reason } : {}),
        at: entry.createdAt.toISOString(),
      })),
    };
  }

  private toAssignmentDto(
    assignment: BookingWithDetail['assignments'][number],
  ): BookingAssignmentDto {
    return {
      id: assignment.id,
      providerId: assignment.providerId,
      providerName: assignment.provider.organisation.name,
      status: assignment.status,
      strategy: assignment.strategy,
      ...(assignment.rejectionReason ? { rejectionReason: assignment.rejectionReason } : {}),
      assignedAt: assignment.assignedAt.toISOString(),
      ...(assignment.respondedAt ? { respondedAt: assignment.respondedAt.toISOString() } : {}),
    };
  }

  // ----------------------------------------------------------------- events

  /**
   * Emitted AFTER the transaction commits, never inside it.
   *
   * Inside, a listener that threw would roll back the business change — a
   * notification failure must never undo a booking. The cost is that a crash
   * between commit and emit loses the event; that is the documented
   * limitation the transactional outbox (deferred to V1) exists to close.
   */
  private emit(event: string, payload: Record<string, unknown>): void {
    this.events.emit(event, payload);
  }

  private baseEvent(booking: BookingWithDetail) {
    const active = booking.assignments.find(
      (a) => a.status === 'PENDING' || a.status === 'ACCEPTED',
    );

    return {
      bookingId: booking.id,
      customerOrganisationId: booking.customerOrganisationId,
      ...(active ? { providerOrganisationId: active.provider.organisationId } : {}),
      serviceTypeName: booking.serviceType.name,
      quantity: booking.quantity,
      pricingUnit: booking.pricingUnit,
      customerName: booking.customerOrganisation.name,
      ...(active ? { providerName: active.provider.organisation.name } : {}),
    };
  }
}
