import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiEnvelope, ApiErrorEnvelope } from '../../common/swagger/api-envelope.decorator';
import type { ActorContext } from '../identity/actor-context';
import { CurrentUser } from '../identity/decorators/current-user.decorator';
import { RequirePermissions } from '../identity/decorators/require-permissions.decorator';
import { CreateDroneDto, DroneDto, UpdateDroneDto } from './dto/drone.dto';
import { DroneService } from './drone.service';

@ApiTags('Drones')
@ApiBearerAuth('access-token')
@Controller('providers/me/drones')
export class DroneController {
  constructor(private readonly drones: DroneService) {}

  @Get()
  @RequirePermissions('drone:manage')
  @ApiOperation({ summary: 'Your drones' })
  @ApiEnvelope(DroneDto, { description: 'Array of drones' })
  list(@CurrentUser() actor: ActorContext): Promise<DroneDto[]> {
    return this.drones.listOwn(actor);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('drone:manage')
  @ApiOperation({ summary: 'Register a drone' })
  @ApiEnvelope(DroneDto, { status: HttpStatus.CREATED })
  @ApiErrorEnvelope(HttpStatus.CONFLICT, 'Registration number already on the platform')
  create(@CurrentUser() actor: ActorContext, @Body() dto: CreateDroneDto): Promise<DroneDto> {
    return this.drones.create(actor, dto);
  }

  @Patch(':id')
  @RequirePermissions('drone:manage')
  @ApiOperation({ summary: 'Update a drone' })
  @ApiEnvelope(DroneDto)
  @ApiErrorEnvelope(HttpStatus.CONFLICT, 'Grounded by an open maintenance ticket')
  update(
    @CurrentUser() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDroneDto,
  ): Promise<DroneDto> {
    return this.drones.update(actor, id, dto);
  }
}
