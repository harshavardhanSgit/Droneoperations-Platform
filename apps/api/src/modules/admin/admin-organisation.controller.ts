import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';

import { PaginationQueryDto, pageOf } from '../../common/dto/pagination.dto';
import { ApiEnvelope, ApiErrorEnvelope } from '../../common/swagger/api-envelope.decorator';
import { RequirePermissions } from '../identity/decorators/require-permissions.decorator';
import { OrganisationListDto } from '../organisations/dto/organisation.dto';
import { OrganisationService } from '../organisations/organisation.service';

enum OrganisationKindFilter {
  CUSTOMER = 'CUSTOMER',
  PROVIDER = 'PROVIDER',
  PLATFORM = 'PLATFORM',
}

class ListOrganisationsQuery extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: OrganisationKindFilter })
  @IsOptional()
  @IsEnum(OrganisationKindFilter)
  kind?: OrganisationKindFilter;
}

/** ADMIN IS NOT A MODULE — it is a surface. */
@ApiTags('Administration')
@ApiBearerAuth('access-token')
@Controller('admin/organisations')
export class AdminOrganisationController {
  constructor(private readonly organisations: OrganisationService) {}

  @Get()
  @RequirePermissions('organisation:read-any')
  @ApiOperation({ summary: 'List all organisations (platform staff only)' })
  @ApiEnvelope(OrganisationListDto)
  @ApiErrorEnvelope(403, 'Role does not permit this action')
  list(@Query() query: ListOrganisationsQuery): Promise<OrganisationListDto> {
    return this.organisations.list(
      query.kind ? { kind: query.kind } : {},
      pageOf(query),
    );
  }
}
