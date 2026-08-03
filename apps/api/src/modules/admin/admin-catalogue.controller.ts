import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsBooleanString, IsOptional, IsUUID } from 'class-validator';

import { ApiEnvelope, ApiErrorEnvelope } from '../../common/swagger/api-envelope.decorator';
import {
  AreaDto,
  CreateAreaDto,
  CreateServiceTypeDto,
  ServiceTypeDto,
  UpdateServiceTypeDto,
} from '../catalogue/dto/catalogue.dto';
import { CatalogueService } from '../catalogue/catalogue.service';
import { RequirePermissions } from '../identity/decorators/require-permissions.decorator';

class AdminListAreasQuery {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @ApiPropertyOptional({ example: 'true' })
  @IsOptional()
  @IsBooleanString()
  includeRetired?: string;
}

/** Controllers only. All behaviour belongs to CatalogueService. */
@ApiTags('Administration')
@ApiBearerAuth('access-token')
@Controller('admin/catalogue')
export class AdminCatalogueController {
  constructor(private readonly catalogue: CatalogueService) {}

  @Get('service-types')
  @RequirePermissions('catalogue:manage')
  @ApiOperation({ summary: 'All service types, including retired' })
  @ApiEnvelope(ServiceTypeDto, { description: 'Array of service types' })
  listServiceTypes(): Promise<ServiceTypeDto[]> {
    return this.catalogue.listServiceTypes(true);
  }

  @Post('service-types')
  @RequirePermissions('catalogue:manage')
  @ApiOperation({
    summary: 'Add a service type',
    description:
      'This is how a new service (survey, mapping, inspection) enters the platform — a row, not a deployment.',
  })
  @ApiEnvelope(ServiceTypeDto, { status: 201 })
  @ApiErrorEnvelope(409, 'Code already in use')
  create(@Body() dto: CreateServiceTypeDto): Promise<ServiceTypeDto> {
    return this.catalogue.createServiceType(dto);
  }

  @Patch('service-types/:id')
  @RequirePermissions('catalogue:manage')
  @ApiOperation({
    summary: 'Edit or retire a service type',
    description:
      'code and pricingUnit are immutable — changing a unit would silently reinterpret every existing price.',
  })
  @ApiEnvelope(ServiceTypeDto)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateServiceTypeDto,
  ): Promise<ServiceTypeDto> {
    return this.catalogue.updateServiceType(id, dto);
  }

  @Get('areas')
  @RequirePermissions('catalogue:manage')
  @ApiOperation({ summary: 'Areas at one level, optionally including retired' })
  @ApiEnvelope(AreaDto, { description: 'Array of areas' })
  listAreas(@Query() query: AdminListAreasQuery): Promise<AreaDto[]> {
    return this.catalogue.listAreas(query.parentId, query.includeRetired === 'true');
  }

  @Post('areas')
  @RequirePermissions('catalogue:manage')
  @ApiOperation({
    summary: 'Add an area',
    description: 'Parent level is validated: a DISTRICT must sit under a STATE.',
  })
  @ApiEnvelope(AreaDto, { status: 201 })
  @ApiErrorEnvelope(400, 'Invalid parent level')
  createArea(@Body() dto: CreateAreaDto): Promise<AreaDto> {
    return this.catalogue.createArea(dto);
  }
}
