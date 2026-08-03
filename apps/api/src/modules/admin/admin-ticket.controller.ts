import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiEnvelope, ApiErrorEnvelope } from '../../common/swagger/api-envelope.decorator';
import {
  AssignEngineerDto,
  TicketDetailDto,
  TicketListDto,
  TicketQueryDto,
} from '../field-service/dto/ticket.dto';
import { TicketService } from '../field-service/ticket.service';
import type { ActorContext } from '../identity/actor-context';
import { CurrentUser } from '../identity/decorators/current-user.decorator';
import { RequirePermissions } from '../identity/decorators/require-permissions.decorator';

/** Controllers only — the fourth admin surface, added the same way as the others. */
@ApiTags('Administration')
@ApiBearerAuth('access-token')
@Controller('admin/tickets')
export class AdminTicketController {
  constructor(private readonly tickets: TicketService) {}

  @Get()
  @RequirePermissions('ticket:assign')
  @ApiOperation({ summary: 'All maintenance tickets', description: 'status=OPEN is the dispatch queue.' })
  @ApiEnvelope(TicketListDto)
  list(@Query() query: TicketQueryDto): Promise<TicketListDto> {
    return this.tickets.listAll({ skip: query.skip, take: query.take }, query.status);
  }

  @Post(':id/assign')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('ticket:assign')
  @ApiOperation({ summary: 'Assign an engineer', description: 'D12 — OPEN to ASSIGNED.' })
  @ApiEnvelope(TicketDetailDto)
  @ApiErrorEnvelope(HttpStatus.CONFLICT, 'Illegal transition')
  assign(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: ActorContext,
    @Body() dto: AssignEngineerDto,
  ): Promise<TicketDetailDto> {
    return this.tickets.assign(actor, id, dto.engineerUserId);
  }
}
