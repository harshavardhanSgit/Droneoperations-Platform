import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiEnvelope, ApiErrorEnvelope } from '../../common/swagger/api-envelope.decorator';
import { StaffListDto } from '../identity/dto/staff.dto';
import { RequirePermissions } from '../identity/decorators/require-permissions.decorator';
import { StaffService } from '../identity/staff.service';

/**
 * Controllers only — the fifth admin surface, added the same way as the others.
 * The query itself belongs to Identity; this file routes to it and nothing more.
 */
@ApiTags('Administration')
@ApiBearerAuth('access-token')
@Controller('admin/engineers')
export class AdminStaffController {
  constructor(private readonly staff: StaffService) {}

  @Get()
  @RequirePermissions('ticket:assign')
  @ApiOperation({
    summary: 'Service engineers available for assignment',
    description: 'Who an open maintenance ticket can be handed to (D12).',
  })
  @ApiEnvelope(StaffListDto)
  @ApiErrorEnvelope(403, 'Role does not permit this action')
  list(): Promise<StaffListDto> {
    return this.staff.listEngineers();
  }
}
