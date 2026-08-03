import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiEnvelope, ApiErrorEnvelope } from '../../common/swagger/api-envelope.decorator';
import type { ActorContext } from '../identity/actor-context';
import { CurrentUser } from '../identity/decorators/current-user.decorator';
import { RequirePermissions } from '../identity/decorators/require-permissions.decorator';
import { CreateReviewDto, ProviderRatingDto, ReviewDto } from './dto/review.dto';
import { ReputationService } from './reputation.service';

@ApiTags('Reputation')
@ApiBearerAuth('access-token')
@Controller()
export class ReputationController {
  constructor(private readonly reputation: ReputationService) {}

  @Post('bookings/:id/review')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('review:create')
  @ApiOperation({
    summary: 'Review a completed booking',
    description: 'BR7 — the customer only, once, and only after completion is confirmed.',
  })
  @ApiEnvelope(ReviewDto, { status: HttpStatus.CREATED })
  @ApiErrorEnvelope(HttpStatus.UNPROCESSABLE_ENTITY, 'Work not confirmed complete')
  @ApiErrorEnvelope(HttpStatus.CONFLICT, 'Already reviewed')
  create(
    @CurrentUser() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateReviewDto,
  ): Promise<ReviewDto> {
    return this.reputation.create(actor, id, dto);
  }

  @Get('bookings/:id/review')
  @ApiOperation({ summary: 'The review for a booking', description: 'Null if not reviewed yet.' })
  @ApiEnvelope(ReviewDto)
  findForBooking(
    @CurrentUser() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ReviewDto | null> {
    return this.reputation.findForBooking(actor, id);
  }

  @Get('providers/:id/rating')
  @ApiOperation({
    summary: 'A provider’s rating and recent reviews',
    description: 'The average is derived on read, never stored.',
  })
  @ApiEnvelope(ProviderRatingDto)
  rating(@Param('id', ParseUUIDPipe) id: string): Promise<ProviderRatingDto> {
    return this.reputation.ratingFor(id);
  }
}
