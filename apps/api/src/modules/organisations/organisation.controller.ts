import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiEnvelope, ApiErrorEnvelope } from '../../common/swagger/api-envelope.decorator';
import type { ActorContext } from '../identity/actor-context';
import { CurrentUser } from '../identity/decorators/current-user.decorator';
import { RequirePermissions } from '../identity/decorators/require-permissions.decorator';
import { OrganisationDto, UpdateOrganisationDto } from './dto/organisation.dto';
import { OrganisationService } from './organisation.service';

@ApiTags('Organisations')
@ApiBearerAuth('access-token')
@Controller('organisations')
export class OrganisationController {
  constructor(private readonly organisations: OrganisationService) {}

  /** No id in the path — the actor's own organisation comes from their token. */
  @Get('me')
  @RequirePermissions('organisation:read-own')
  @ApiOperation({ summary: "The acting user's organisation" })
  @ApiEnvelope(OrganisationDto)
  @ApiErrorEnvelope(403, 'Role does not permit this action')
  findOwn(@CurrentUser() actor: ActorContext): Promise<OrganisationDto> {
    return this.organisations.findOwn(actor);
  }

  @Patch('me')
  @RequirePermissions('organisation:manage-own')
  @ApiOperation({
    summary: 'Rename your organisation',
    description: 'Requires OWNER. A MEMBER can read the organisation but not change it.',
  })
  @ApiEnvelope(OrganisationDto)
  @ApiErrorEnvelope(403, 'Role does not permit this action')
  renameOwn(
    @CurrentUser() actor: ActorContext,
    @Body() dto: UpdateOrganisationDto,
  ): Promise<OrganisationDto> {
    return this.organisations.renameOwn(actor, dto.name);
  }
}
