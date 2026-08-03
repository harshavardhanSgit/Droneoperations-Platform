import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

import { ApiEnvelope } from '../../common/swagger/api-envelope.decorator';
import { AreaDto, AreaWithPathDto, ServiceTypeDto } from './dto/catalogue.dto';
import { CatalogueService } from './catalogue.service';

class ListAreasQuery {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Omit for states. Pass a state id for its districts, and so on.',
  })
  @IsOptional()
  @IsUUID()
  parentId?: string;
}

/**
 * Read-only, available to any signed-in user. Customers need service types to
 * search; providers need them to price offerings. No permission beyond being
 * authenticated — this is public reference data, not anyone's private record.
 */
@ApiTags('Catalogue')
@ApiBearerAuth('access-token')
@Controller()
export class CatalogueController {
  constructor(private readonly catalogue: CatalogueService) {}

  @Get('service-types')
  @ApiOperation({ summary: 'Active service types' })
  @ApiEnvelope(ServiceTypeDto, { description: 'Array of service types' })
  listServiceTypes(): Promise<ServiceTypeDto[]> {
    return this.catalogue.listServiceTypes();
  }

  @Get('areas')
  @ApiOperation({
    summary: 'Areas, one level at a time',
    description:
      'No parentId returns states. Pass a state id for its districts. Deliberately not a whole-tree fetch.',
  })
  @ApiEnvelope(AreaDto, { description: 'Array of areas' })
  listAreas(@Query() query: ListAreasQuery): Promise<AreaDto[]> {
    return this.catalogue.listAreas(query.parentId);
  }

  @Get('areas/:id')
  @ApiOperation({ summary: 'One area with its full path', description: 'e.g. "Warangal, Telangana"' })
  @ApiEnvelope(AreaWithPathDto)
  getArea(@Param('id', ParseUUIDPipe) id: string): Promise<AreaWithPathDto> {
    return this.catalogue.getAreaWithPath(id);
  }
}
