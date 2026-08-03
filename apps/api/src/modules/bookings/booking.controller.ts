import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiEnvelope, ApiErrorEnvelope } from '../../common/swagger/api-envelope.decorator';
import type { ActorContext } from '../identity/actor-context';
import { CurrentUser } from '../identity/decorators/current-user.decorator';
import { RequirePermissions } from '../identity/decorators/require-permissions.decorator';
import { BookingService } from './booking.service';
import {
  AssignProviderDto,
  BookingDetailDto,
  BookingDto,
  BookingListDto,
  BookingQueryDto,
  CancelBookingDto,
  CreateBookingDto,
  ProposeScheduleDto,
} from './dto/booking.dto';

@ApiTags('Bookings')
@ApiBearerAuth('access-token')
@Controller('bookings')
export class BookingController {
  constructor(private readonly bookings: BookingService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('booking:create')
  @ApiOperation({
    summary: 'Create a booking',
    description:
      'Created UNASSIGNED, then assigned if an offeringId is supplied. A booking with no provider is a valid object — that is what lets V2 auto-assign after creation.',
  })
  @ApiEnvelope(BookingDetailDto, { status: HttpStatus.CREATED })
  @ApiErrorEnvelope(HttpStatus.BAD_REQUEST, 'Offering does not match the requirement')
  create(@CurrentUser() actor: ActorContext, @Body() dto: CreateBookingDto): Promise<BookingDetailDto> {
    return this.bookings.create(actor, dto);
  }

  @Get()
  @RequirePermissions('booking:create')
  @ApiOperation({ summary: 'Your bookings' })
  @ApiEnvelope(BookingListDto)
  list(@CurrentUser() actor: ActorContext, @Query() query: BookingQueryDto): Promise<BookingListDto> {
    return this.bookings.listOwn(actor, { skip: query.skip, take: query.take }, query.status);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One booking, with every assignment and the full timeline' })
  @ApiEnvelope(BookingDetailDto)
  findOne(@CurrentUser() actor: ActorContext, @Param('id', ParseUUIDPipe) id: string): Promise<BookingDetailDto> {
    return this.bookings.findOne(actor, id);
  }

  @Post(':id/assignments')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('booking:create')
  @ApiOperation({
    summary: 'Choose a provider',
    description:
      'UNASSIGNED to ASSIGNED. Also how a REJECTED booking is offered to someone else — the requirement, quote history and timeline are all preserved (D9).',
  })
  @ApiEnvelope(BookingDetailDto, { status: HttpStatus.CREATED })
  @ApiErrorEnvelope(HttpStatus.CONFLICT, 'Already has an active assignment')
  assign(
    @CurrentUser() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignProviderDto,
  ): Promise<BookingDetailDto> {
    return this.bookings.assign(actor, id, dto.offeringId);
  }

  @Post(':id/schedule/propose')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Propose a date',
    description:
      'Open to EITHER party — the customer or the actively assigned provider. Supersedes any outstanding proposal. The other side must confirm (BR15). No permission is required because it is inherently two-sided; ownership is checked in the service.',
  })
  @ApiEnvelope(BookingDetailDto)
  @ApiErrorEnvelope(HttpStatus.CONFLICT, 'Booking not assigned, or already closed')
  proposeSchedule(
    @CurrentUser() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ProposeScheduleDto,
  ): Promise<BookingDetailDto> {
    return this.bookings.proposeSchedule(actor, id, dto);
  }

  @Post(':id/schedule/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Confirm the proposed date',
    description:
      'Only the party who did NOT propose it (BR15). If the job is still awaiting an answer, confirming the date also accepts the job.',
  })
  @ApiEnvelope(BookingDetailDto)
  @ApiErrorEnvelope(HttpStatus.FORBIDDEN, 'You proposed this date')
  confirmSchedule(
    @CurrentUser() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<BookingDetailDto> {
    return this.bookings.confirmSchedule(actor, id);
  }

  @Post(':id/confirm-completion')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('booking:confirm-completion')
  @ApiOperation({
    summary: 'Confirm the work was done',
    description: 'D10 step 2. Only the customer closes a job — AWAITING_CONFIRMATION to COMPLETED.',
  })
  @ApiEnvelope(BookingDetailDto)
  confirmCompletion(
    @CurrentUser() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<BookingDetailDto> {
    return this.bookings.confirmCompletion(actor, id);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('booking:cancel')
  @ApiOperation({ summary: 'Cancel', description: 'Terminal (BR9). A reason is required.' })
  @ApiEnvelope(BookingDetailDto)
  @ApiErrorEnvelope(HttpStatus.CONFLICT, 'Already closed')
  cancel(
    @CurrentUser() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelBookingDto,
  ): Promise<BookingDetailDto> {
    return this.bookings.cancel(actor, id, dto.reason);
  }
}
