import { ApiProperty } from '@nestjs/swagger';

export class StaffMemberDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: 'Ravi Teja' }) fullName: string;
  @ApiProperty({ example: 'engineer@droneops.local' }) email: string;
}

export class StaffListDto {
  @ApiProperty({ type: [StaffMemberDto] }) items: StaffMemberDto[];
  @ApiProperty({ example: 3 }) total: number;
}
