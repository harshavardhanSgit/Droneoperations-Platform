import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiEnvelope, ApiErrorEnvelope } from '../../common/swagger/api-envelope.decorator';
import type { ActorContext } from '../identity/actor-context';
import { CurrentUser } from '../identity/decorators/current-user.decorator';
import { EarningsDto, PaymentDto, RecordPaymentDto } from './dto/payment.dto';
import { SettlementService } from './settlement.service';

@ApiTags('Settlement')
@ApiBearerAuth('access-token')
@Controller()
export class SettlementController {
  constructor(private readonly settlement: SettlementService) {}

  @Post('bookings/:id/payment')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Record that payment happened',
    description:
      'The platform does NOT hold or move money (D6) — this is a record, not a transaction. Either party may log it; both can see who did. Only after the work is confirmed complete (BR6).',
  })
  @ApiEnvelope(PaymentDto, { status: HttpStatus.CREATED })
  @ApiErrorEnvelope(HttpStatus.UNPROCESSABLE_ENTITY, 'Work not confirmed complete')
  @ApiErrorEnvelope(HttpStatus.CONFLICT, 'Already recorded')
  record(
    @CurrentUser() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordPaymentDto,
  ): Promise<PaymentDto> {
    return this.settlement.record(actor, id, dto);
  }

  @Get('bookings/:id/payment')
  @ApiOperation({ summary: 'The payment record for a booking' })
  @ApiEnvelope(PaymentDto)
  find(
    @CurrentUser() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PaymentDto | null> {
    return this.settlement.findForBooking(actor, id);
  }

  @Get('providers/me/earnings')
  @ApiOperation({
    summary: 'Your earnings',
    description: 'Derived from completed bookings and their payment records — never a stored running total.',
  })
  @ApiEnvelope(EarningsDto)
  earnings(@CurrentUser() actor: ActorContext): Promise<EarningsDto> {
    return this.settlement.earnings(actor);
  }
}
