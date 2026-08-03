import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiEnvelope, ApiErrorEnvelope } from '../../common/swagger/api-envelope.decorator';
import type { ActorContext } from '../identity/actor-context';
import { CurrentUser } from '../identity/decorators/current-user.decorator';
import { RequirePermissions } from '../identity/decorators/require-permissions.decorator';
import {
  CreateOfferingDto,
  OfferingDto,
  OfferingHistoryDto,
  CreateOfferingVersionDto,
  SetOfferingAreasDto,
} from './dto/offering.dto';
import { OfferingService } from './offering.service';

@ApiTags('Offerings')
@ApiBearerAuth('access-token')
@Controller('providers/me/offerings')
export class OfferingController {
  constructor(private readonly offerings: OfferingService) {}

  @Get()
  @RequirePermissions('offering:manage')
  @ApiOperation({ summary: 'Your active offerings, each with its current price' })
  @ApiEnvelope(OfferingDto, { description: 'Array of offerings' })
  list(@CurrentUser() actor: ActorContext): Promise<OfferingDto[]> {
    return this.offerings.listOwn(actor);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('offering:manage')
  @ApiOperation({
    summary: 'Offer a service',
    description: 'Creates the offering and version 1 of its price, in one transaction.',
  })
  @ApiEnvelope(OfferingDto, { status: HttpStatus.CREATED })
  @ApiErrorEnvelope(HttpStatus.CONFLICT, 'You already offer this service')
  create(
    @CurrentUser() actor: ActorContext,
    @Body() dto: CreateOfferingDto,
  ): Promise<OfferingDto> {
    return this.offerings.create(actor, dto);
  }

  @Post(':id/versions')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('offering:manage')
  @ApiOperation({
    summary: 'Publish a new version of your terms',
    description:
      'Closes the current version and opens a new one. This is a COMPLETE replacement, not a patch — omitted fields (minQuantity, notes, inclusions) are absent from the new version. Pre-fill from the current version. The old version is never modified, so any booking quoted against it keeps its agreed terms.',
  })
  @ApiEnvelope(OfferingDto, { status: HttpStatus.CREATED })
  @ApiErrorEnvelope(HttpStatus.CONFLICT, 'Modified concurrently by someone else')
  publishVersion(
    @CurrentUser() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateOfferingVersionDto,
  ): Promise<OfferingDto> {
    return this.offerings.publishVersion(actor, id, dto);
  }

  @Put(':id/areas')
  @RequirePermissions('offering:manage')
  @ApiOperation({
    summary: 'Set where you deliver this service',
    description: 'Coverage is not versioned — changing it is not a price change.',
  })
  @ApiEnvelope(OfferingDto)
  setAreas(
    @CurrentUser() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetOfferingAreasDto,
  ): Promise<OfferingDto> {
    return this.offerings.setAreas(actor, id, dto);
  }

  @Get(':id/history')
  @RequirePermissions('offering:manage')
  @ApiOperation({
    summary: 'Full price history',
    description: 'Every version this offering has ever had. A snapshot column could not produce this.',
  })
  @ApiEnvelope(OfferingHistoryDto)
  history(
    @CurrentUser() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OfferingHistoryDto> {
    return this.offerings.history(actor, id);
  }

  @Delete(':id')
  @RequirePermissions('offering:manage')
  @ApiOperation({
    summary: 'Withdraw an offering',
    description: 'Marks it WITHDRAWN. Never deleted — bookings reference it permanently.',
  })
  @ApiEnvelope(OfferingDto)
  withdraw(
    @CurrentUser() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OfferingDto> {
    return this.offerings.withdraw(actor, id);
  }
}
