import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';

import { PaginationQueryDto } from '../../common/dto/pagination.dto';
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

/**
 * ADMIN IS NOT A MODULE — it is a surface.
 *
 * This file contains a controller and nothing else. There is no
 * AdminService and no AdminRepository, and there never should be: every action
 * calls the exported service of the module that OWNS the data.
 *
 * If business logic ever appears here, the same rule now exists in two places
 * and they will diverge. That is the failure this constraint prevents.
 */
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
      { skip: query.skip, take: query.take },
    );
  }
}
