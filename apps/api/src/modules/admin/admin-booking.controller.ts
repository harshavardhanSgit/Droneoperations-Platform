import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiEnvelope, ApiErrorEnvelope } from '../../common/swagger/api-envelope.decorator';
import { BookingService } from '../bookings/booking.service';
import {
  AssignProviderDto,
  BookingDetailDto,
  BookingListDto,
  BookingQueryDto,
  CancelBookingDto,
} from '../bookings/dto/booking.dto';
import type { ActorContext } from '../identity/actor-context';
import { CurrentUser } from '../identity/decorators/current-user.decorator';
import { RequirePermissions } from '../identity/decorators/require-permissions.decorator';

/**
 * Controllers only — the sixth admin surface.
 *
 * Force-cancel routes to the SAME BookingService.cancel() a customer uses. The
 * state machine, the history entry and the optimistic lock are identical; only
 * the actor differs. An admin-specific cancel path would be a second
 * implementation of BR9 and BR16, and the two would drift.
 */
@ApiTags('Administration')
@ApiBearerAuth('access-token')
@Controller('admin/bookings')
export class AdminBookingController {
  constructor(private readonly bookings: BookingService) {}

  @Get()
  @RequirePermissions('booking:read-any')
  @ApiOperation({
    summary: 'Every booking on the platform',
    description: 'Unscoped. status=UNASSIGNED surfaces jobs nobody has taken.',
  })
  @ApiEnvelope(BookingListDto)
  @ApiErrorEnvelope(HttpStatus.FORBIDDEN, 'Role does not permit this action')
  list(@Query() query: BookingQueryDto): Promise<BookingListDto> {
    return this.bookings.listAll({ skip: query.skip, take: query.take }, query.status);
  }

  @Get(':id')
  @RequirePermissions('booking:read-any')
  @ApiOperation({ summary: 'One booking, with its full history' })
  @ApiEnvelope(BookingDetailDto)
  findOne(
    @CurrentUser() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<BookingDetailDto> {
    return this.bookings.findOne(actor, id);
  }

  @Post(':id/reassign')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('booking:reassign')
  @ApiOperation({
    summary: 'Put a stuck booking with a provider directly',
    description:
      'For jobs nobody has taken. Creates a PLATFORM_MANAGED assignment — the same table, lifecycle and price snapshot as a customer choosing, differing only in strategy and actor (S1). This is the embryo of V3 managed assignment.',
  })
  @ApiEnvelope(BookingDetailDto)
  @ApiErrorEnvelope(HttpStatus.CONFLICT, 'Already has an active assignment')
  reassign(
    @CurrentUser() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignProviderDto,
  ): Promise<BookingDetailDto> {
    return this.bookings.assign(actor, id, dto.offeringId);
  }

  @Post(':id/force-cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('booking:force-cancel')
  @ApiOperation({
    summary: 'Cancel a booking on behalf of the platform',
    description:
      'For jobs that are stuck. Same transition, same history entry and same reason requirement as a party cancelling (BR9, BR16) — the actor recorded is the admin.',
  })
  @ApiEnvelope(BookingDetailDto)
  @ApiErrorEnvelope(HttpStatus.CONFLICT, 'Already in a terminal state')
  forceCancel(
    @CurrentUser() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelBookingDto,
  ): Promise<BookingDetailDto> {
    return this.bookings.cancel(actor, id, dto.reason);
  }
}
