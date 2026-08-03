import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiEnvelope, ApiErrorEnvelope } from '../../common/swagger/api-envelope.decorator';
import type { ActorContext } from '../identity/actor-context';
import { CurrentUser } from '../identity/decorators/current-user.decorator';
import { RequirePermissions } from '../identity/decorators/require-permissions.decorator';
import {
  CloseTicketDto,
  ConfirmReportUploadDto,
  RaiseTicketDto,
  RequestReportUploadDto,
  TicketDetailDto,
  TicketListDto,
  TicketQueryDto,
} from './dto/ticket.dto';
import { TicketService } from './ticket.service';

/** Provider side: raise and track. */
@ApiTags('Field service')
@ApiBearerAuth('access-token')
@Controller('providers/me/tickets')
export class ProviderTicketController {
  constructor(private readonly tickets: TicketService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('ticket:create')
  @ApiOperation({
    summary: 'Report a fault',
    description: 'Grounds the drone immediately — an unserviceable drone must not take bookings.',
  })
  @ApiEnvelope(TicketDetailDto, { status: HttpStatus.CREATED })
  @ApiErrorEnvelope(HttpStatus.CONFLICT, 'This drone already has an open ticket')
  raise(@CurrentUser() actor: ActorContext, @Body() dto: RaiseTicketDto): Promise<TicketDetailDto> {
    return this.tickets.raise(actor, dto);
  }

  @Get()
  @RequirePermissions('ticket:create')
  @ApiOperation({ summary: 'Your maintenance tickets' })
  @ApiEnvelope(TicketListDto)
  list(@CurrentUser() actor: ActorContext, @Query() query: TicketQueryDto): Promise<TicketListDto> {
    return this.tickets.listOwn(actor, { skip: query.skip, take: query.take }, query.status);
  }
}

/** Engineer side: work the queue. */
@ApiTags('Field service')
@ApiBearerAuth('access-token')
@Controller('engineer/tickets')
export class EngineerTicketController {
  constructor(private readonly tickets: TicketService) {}

  @Get()
  @RequirePermissions('ticket:progress')
  @ApiOperation({ summary: 'Tickets assigned to you' })
  @ApiEnvelope(TicketListDto)
  mine(@CurrentUser() actor: ActorContext, @Query() query: TicketQueryDto): Promise<TicketListDto> {
    return this.tickets.listMine(actor, { skip: query.skip, take: query.take });
  }

  @Post(':id/start')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('ticket:progress')
  @ApiOperation({ summary: 'Start work', description: 'ASSIGNED to IN_PROGRESS.' })
  @ApiEnvelope(TicketDetailDto)
  start(
    @CurrentUser() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TicketDetailDto> {
    return this.tickets.start(actor, id);
  }

  @Post(':id/report-upload')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('ticket:progress')
  @ApiOperation({
    summary: 'Get an upload URL for your service report',
    description: 'The report is owned by the TICKET, not the provider — same three-step flow as every other upload.',
  })
  requestReportUpload(
    @CurrentUser() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RequestReportUploadDto,
  ) {
    return this.tickets.requestReportUpload(actor, id, dto);
  }

  @Post(':id/report-upload/:documentId/confirm')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('ticket:progress')
  @ApiOperation({ summary: 'Confirm the report upload' })
  confirmReportUpload(
    @CurrentUser() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Body() dto: ConfirmReportUploadDto,
  ) {
    return this.tickets.confirmReportUpload(actor, id, documentId, dto.sizeBytes);
  }

  @Post(':id/close')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('ticket:close')
  @ApiOperation({
    summary: 'Close the ticket',
    description:
      'BR11 — a report document is mandatory, and only the assigned engineer may close. Returns the drone to service if no other ticket is open.',
  })
  @ApiEnvelope(TicketDetailDto)
  @ApiErrorEnvelope(HttpStatus.FORBIDDEN, 'Assigned to another engineer')
  close(
    @CurrentUser() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CloseTicketDto,
  ): Promise<TicketDetailDto> {
    return this.tickets.close(actor, id, dto);
  }
}
