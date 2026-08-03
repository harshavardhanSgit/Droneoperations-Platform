import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiEnvelope, ApiErrorEnvelope } from '../../common/swagger/api-envelope.decorator';
import type { ActorContext } from '../identity/actor-context';
import { CurrentUser } from '../identity/decorators/current-user.decorator';
import { RequirePermissions } from '../identity/decorators/require-permissions.decorator';
import { BookingService } from './booking.service';
import {
  BookingDetailDto,
  BookingListDto,
  CompleteBookingDto,
  ProviderBookingQueryDto,
  RejectBookingDto,
} from './dto/booking.dto';

/** The provider's side of the same aggregate. */
@ApiTags('Bookings')
@ApiBearerAuth('access-token')
@Controller('providers/me/bookings')
export class ProviderBookingController {
  constructor(private readonly bookings: BookingService) {}

  @Get()
  @RequirePermissions('booking:accept')
  @ApiOperation({
    summary: 'Bookings assigned to you',
    description: 'assignmentStatus=PENDING is the request inbox. Ordered by preferred date.',
  })
  @ApiEnvelope(BookingListDto)
  list(
    @CurrentUser() actor: ActorContext,
    @Query() query: ProviderBookingQueryDto,
  ): Promise<BookingListDto> {
    return this.bookings.listAssignedToMe(
      actor,
      { skip: query.skip, take: query.take },
      query.assignmentStatus,
    );
  }

  @Post(':id/accept')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('booking:accept')
  @ApiOperation({ summary: 'Accept', description: 'ASSIGNED to SCHEDULED. Only the actively assigned provider (BR3).' })
  @ApiEnvelope(BookingDetailDto)
  @ApiErrorEnvelope(HttpStatus.CONFLICT, 'Illegal transition or already answered')
  accept(@CurrentUser() actor: ActorContext, @Param('id', ParseUUIDPipe) id: string): Promise<BookingDetailDto> {
    return this.bookings.accept(actor, id);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('booking:reject')
  @ApiOperation({
    summary: 'Decline',
    description:
      'Returns the booking to UNASSIGNED with its requirement and history intact (D9). The declined assignment remains as a record.',
  })
  @ApiEnvelope(BookingDetailDto)
  reject(
    @CurrentUser() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectBookingDto,
  ): Promise<BookingDetailDto> {
    return this.bookings.reject(actor, id, dto.reason);
  }

  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('booking:complete')
  @ApiOperation({
    summary: 'Mark the work done',
    description:
      'D10 step 1. SCHEDULED to AWAITING_CONFIRMATION. finalQuantity is what was ACTUALLY delivered and drives the final amount (BR14) — it is not assumed equal to what was booked.',
  })
  @ApiEnvelope(BookingDetailDto)
  @ApiErrorEnvelope(HttpStatus.CONFLICT, 'Not scheduled')
  complete(
    @CurrentUser() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CompleteBookingDto,
  ): Promise<BookingDetailDto> {
    return this.bookings.markComplete(actor, id, dto);
  }
}
