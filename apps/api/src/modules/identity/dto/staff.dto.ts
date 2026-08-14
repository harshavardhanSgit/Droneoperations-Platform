import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsString, Length, MaxLength } from 'class-validator';

export class StaffMemberDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: 'Ravi Teja' }) fullName: string;
  @ApiProperty({ example: 'engineer@droneops.local' }) email: string;

  /** Absent on the engineer picker, which is already role-filtered. */
  @ApiPropertyOptional({ enum: ['ADMIN', 'SERVICE_ENGINEER'] }) role?: string;
  @ApiPropertyOptional({ format: 'date-time' }) createdAt?: string;
}

export class StaffListDto {
  @ApiProperty({ type: [StaffMemberDto] }) items: StaffMemberDto[];
  @ApiProperty({ example: 3 }) total: number;
}

/**
 * Platform accounts are CREATED by an existing admin, never self-registered — which is why this
 * is not part of RegisterDto.
 */
export enum StaffRole {
  ADMIN = 'ADMIN',
  SERVICE_ENGINEER = 'SERVICE_ENGINEER',
}

export class CreateStaffDto {
  @ApiProperty({ example: 'ravi@droneops.local' })
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiProperty({ example: 'Ravi Teja' })
  @IsString()
  @Length(2, 120)
  fullName: string;

  /** Same length-only rule as registration — see RegisterDto for the reasoning. */
  @ApiProperty({ example: 'a long passphrase works best', minLength: 10 })
  @IsString()
  @Length(10, 128)
  password: string;

  @ApiProperty({ enum: StaffRole, example: StaffRole.SERVICE_ENGINEER })
  @IsEnum(StaffRole)
  role: StaffRole;
}
