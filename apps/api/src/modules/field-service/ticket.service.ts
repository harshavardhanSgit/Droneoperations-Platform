import { Injectable } from '@nestjs/common';

import {
  AccessDeniedException,
  BusinessRuleException,
  ResourceConflictException,
  ResourceNotFoundException,
} from '../../common/errors/app.exception';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { DroneRepository } from '../assets/drone.repository';
import { DroneService } from '../assets/drone.service';
import { DocumentService } from '../documents/document.service';
import type { ActorContext } from '../identity/actor-context';
import { ProviderRepository } from '../organisations/provider.repository';
import type {
  CloseTicketDto,
  RaiseTicketDto,
  TicketDetailDto,
  TicketDto,
  TicketListDto,
} from './dto/ticket.dto';
import { assertTransition, OPEN_STATUSES } from './ticket.state-machine';
import { TicketRepository, type TicketWithDetail } from './ticket.repository';

@Injectable()
export class TicketService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tickets: TicketRepository,
    private readonly drones: DroneService,
    private readonly droneRepository: DroneRepository,
    private readonly providers: ProviderRepository,
    private readonly documents: DocumentService,
  ) {}

  // ------------------------------------------------------------- provider

  /** Raising a ticket GROUNDS the drone — the two happen in one transaction. */
  async raise(actor: ActorContext, dto: RaiseTicketDto): Promise<TicketDetailDto> {
    const drone = await this.drones.requireOwnDrone(actor, dto.droneId);

    if (await this.droneRepository.countOpenTickets(drone.id)) {
      throw new ResourceConflictException(
        'TICKET_ALREADY_OPEN',
        'This drone already has an open maintenance ticket',
        { droneId: drone.id },
      );
    }

    const ticket = await this.prisma.$transaction(async (tx) => {
      const created = await this.tickets.create(
        {
          droneId: drone.id,
          providerId: drone.providerId,
          raisedByUserId: actor.userId,
          description: dto.description.trim(),
        },
        tx,
      );

      await this.tickets.recordCreation({ id: created.id, actorUserId: actor.userId }, tx);
      await this.droneRepository.setServiceability(drone.id, 'UNDER_MAINTENANCE', tx);

      return created;
    });

    return this.detail(await this.require(ticket.id));
  }

  async listOwn(
    actor: ActorContext,
    page: { skip: number; take: number },
    status?: TicketDetailDto['status'],
  ): Promise<TicketListDto> {
    const provider = await this.providers.findByOrganisation(actor.organisationId);

    if (!provider) {
      throw new ResourceNotFoundException('Provider profile', actor.organisationId);
    }

    return this.toList(
      await this.tickets.list({ providerId: provider.id, status: status as never }, page),
    );
  }

  // ---------------------------------------------------------------- admin

  async listAll(
    page: { skip: number; take: number },
    status?: TicketDetailDto['status'],
  ): Promise<TicketListDto> {
    return this.toList(await this.tickets.list({ status: status as never }, page));
  }

  async assign(actor: ActorContext, ticketId: string, engineerUserId: string): Promise<TicketDetailDto> {
    const ticket = await this.require(ticketId);

    assertTransition(ticket.status, 'ASSIGNED');

    const won = await this.tickets.transition({
      id: ticket.id,
      from: ticket.status,
      to: 'ASSIGNED',
      actorUserId: actor.userId,
      data: {
        assignedEngineerUserId: engineerUserId,
        assignedByUserId: actor.userId,
        assignedAt: new Date(),
      },
    });

    this.assertWon(won.count);

    return this.detail(await this.require(ticketId));
  }

  // ------------------------------------------------------------- engineer

  async listMine(
    actor: ActorContext,
    page: { skip: number; take: number },
  ): Promise<TicketListDto> {
    return this.toList(await this.tickets.list({ engineerUserId: actor.userId }, page));
  }

  async start(actor: ActorContext, ticketId: string): Promise<TicketDetailDto> {
    const ticket = await this.requireAssignedToMe(actor, ticketId);

    assertTransition(ticket.status, 'IN_PROGRESS');
    this.assertWon(
      (
        await this.tickets.transition({
          id: ticket.id,
          from: ticket.status,
          to: 'IN_PROGRESS',
          actorUserId: actor.userId,
        })
      ).count,
    );

    return this.detail(await this.require(ticketId));
  }

  /**
   * BR11 — cannot close without a report, and only the assigned engineer.
   *
   * The report requirement is conditional on the TARGET status, which a column
   * constraint cannot express, so the service owns it. The ownership rule is
   * level-2: the guard established that engineers may close tickets, only this
   * can establish that it is THEIR ticket.
   */
  /**
   * The report belongs to the TICKET, not the provider.
   *
   * Reusing the provider-document endpoint would be wrong twice over: it is
   * gated on onboarding editability (an ACTIVATED provider cannot use it), and
   * the engineer — not the provider — is the author.
   */
  async requestReportUpload(
    actor: ActorContext,
    ticketId: string,
    input: { filename: string; contentType: string },
  ) {
    const ticket = await this.requireAssignedToMe(actor, ticketId);

    return this.documents.requestUpload({
      ownerType: 'TICKET',
      ownerId: ticket.id,
      filename: input.filename,
      contentType: input.contentType,
      uploadedByUserId: actor.userId,
    });
  }

  async confirmReportUpload(
    actor: ActorContext,
    ticketId: string,
    documentId: string,
    sizeBytes: number,
  ) {
    const ticket = await this.requireAssignedToMe(actor, ticketId);
    const document = await this.documents.requireById(documentId);

    if (document.ownerType !== 'TICKET' || document.ownerId !== ticket.id) {
      throw new ResourceNotFoundException('Document', documentId);
    }

    return this.documents.confirmUpload(documentId, sizeBytes);
  }

  async close(actor: ActorContext, ticketId: string, dto: CloseTicketDto): Promise<TicketDetailDto> {
    const ticket = await this.requireAssignedToMe(actor, ticketId);

    const report = await this.documents.requireById(dto.reportDocumentId);

    if (report.status !== 'READY') {
      throw new BusinessRuleException(
        'REPORT_NOT_UPLOADED',
        'The report upload has not been confirmed yet',
      );
    }

    assertTransition(ticket.status, 'CLOSED');

    await this.prisma.$transaction(async (tx) => {
      this.assertWon(
        (
          await this.tickets.transition(
            {
              id: ticket.id,
              from: ticket.status,
              to: 'CLOSED',
              actorUserId: actor.userId,
              note: dto.resolutionNote.trim(),
              data: {
                resolutionNote: dto.resolutionNote.trim(),
                reportDocumentId: report.id,
                closedAt: new Date(),
              },
            },
            tx,
          )
        ).count,
      );

      // Only the closing of the last open ticket returns the drone to service.
      const stillOpen = await this.droneRepository.countOpenTickets(ticket.droneId, tx);

      if (stillOpen === 0) {
        await this.droneRepository.setServiceability(ticket.droneId, 'SERVICEABLE', tx);
      }
    });

    return this.detail(await this.require(ticketId));
  }

  // -------------------------------------------------------------- private

  private assertWon(count: number): void {
    if (count === 0) {
      throw new ResourceConflictException(
        'TICKET_CONCURRENTLY_MODIFIED',
        'This ticket changed while you were working on it. Reload and try again.',
      );
    }
  }

  private async require(id: string): Promise<TicketWithDetail> {
    const ticket = await this.tickets.findById(id);

    if (!ticket) {
      throw new ResourceNotFoundException('Ticket', id);
    }

    return ticket;
  }

  private async requireAssignedToMe(actor: ActorContext, id: string): Promise<TicketWithDetail> {
    const ticket = await this.require(id);

    if (ticket.assignedEngineerUserId !== actor.userId) {
      throw new AccessDeniedException('This ticket is assigned to another engineer');
    }

    return ticket;
  }

  private toList(input: [TicketWithDetail[], number]): TicketListDto {
    return { items: input[0].map((t) => this.toDto(t)), total: input[1] };
  }

  private toDto(ticket: TicketWithDetail): TicketDto {
    return {
      id: ticket.id,
      status: ticket.status,
      droneId: ticket.droneId,
      droneModel: ticket.drone.model,
      droneRegistration: ticket.drone.registrationNumber,
      providerName: ticket.drone.provider.organisation.name,
      description: ticket.description,
      ...(ticket.assignedEngineerUserId
        ? { assignedEngineerUserId: ticket.assignedEngineerUserId }
        : {}),
      ...(ticket.resolutionNote ? { resolutionNote: ticket.resolutionNote } : {}),
      ...(ticket.reportDocumentId ? { reportDocumentId: ticket.reportDocumentId } : {}),
      createdAt: ticket.createdAt.toISOString(),
    };
  }

  private async detail(ticket: TicketWithDetail): Promise<TicketDetailDto> {
    return {
      ...this.toDto(ticket),
      history: (await this.tickets.listEvents(ticket.id)).map((event) => ({
        ...(event.fromStatus ? { fromStatus: event.fromStatus } : {}),
        toStatus: event.toStatus,
        ...(event.note ? { note: event.note } : {}),
        at: event.createdAt.toISOString(),
      })),
    };
  }
}

export { OPEN_STATUSES };
