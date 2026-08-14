import { Body, Controller, Get, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiEnvelope, ApiErrorEnvelope } from '../../common/swagger/api-envelope.decorator';
import { RequirePermissions } from '../identity/decorators/require-permissions.decorator';
import { CreateStaffDto, StaffListDto, StaffMemberDto } from '../identity/dto/staff.dto';
import { StaffService } from '../identity/staff.service';

/** Platform accounts — the sixth admin surface, added the same way as the rest. */
@ApiTags('Administration')
@ApiBearerAuth('access-token')
@Controller('admin/users')
export class AdminUserController {
  constructor(private readonly staff: StaffService) {}

  @Get()
  @RequirePermissions('user:manage')
  @ApiOperation({
    summary: 'List platform staff accounts',
    description: 'Admins and Service Engineers — everyone who can sign in to the console.',
  })
  @ApiEnvelope(StaffListDto)
  @ApiErrorEnvelope(403, 'Role does not permit this action')
  list(): Promise<StaffListDto> {
    return this.staff.listStaff();
  }

  /**
   * Deliberately NOT part of /auth/register: registration is public and may only ever produce
   * the two marketplace sides.
   */
  @Post()
  @RequirePermissions('user:manage')
  @ApiOperation({
    summary: 'Create an Admin or Service Engineer',
    description: 'Platform accounts are created by an existing admin — never self-registered.',
  })
  @ApiEnvelope(StaffMemberDto, { status: HttpStatus.CREATED, description: 'Account created' })
  @ApiErrorEnvelope(HttpStatus.CONFLICT, 'Email already registered')
  @ApiErrorEnvelope(403, 'Role does not permit this action')
  create(@Body() dto: CreateStaffDto): Promise<StaffMemberDto> {
    return this.staff.createStaff(dto);
  }
}
