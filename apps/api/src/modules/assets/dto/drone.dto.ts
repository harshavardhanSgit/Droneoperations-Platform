import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString, Length, Matches, Max, Min } from 'class-validator';

import { Serviceability } from '../../../generated/prisma/client';

export class CreateDroneDto {
  @ApiProperty({ example: 'Marut AG365' })
  @IsString()
  @Length(2, 120)
  model: string;

  @ApiProperty({ example: 'UIN-TG-0042', description: 'DGCA UIN. Globally unique.' })
  @Matches(/^[A-Za-z0-9-]{4,40}$/, { message: 'registrationNumber must be 4-40 letters, digits or hyphens' })
  registrationNumber: string;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  capacityLitres?: number;
}

export class UpdateDroneDto {
  @ApiPropertyOptional({ example: 'Marut AG365' })
  @IsOptional()
  @IsString()
  @Length(2, 120)
  model?: string;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  capacityLitres?: number;

  @ApiPropertyOptional({
    enum: [Serviceability.SERVICEABLE, Serviceability.RETIRED],
    description: 'UNDER_MAINTENANCE is set by Field Service, never by hand.',
  })
  @IsOptional()
  @IsEnum(Serviceability)
  serviceability?: Serviceability;
}

export class DroneDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: 'Marut AG365' }) model: string;
  @ApiProperty({ example: 'UIN-TG-0042' }) registrationNumber: string;
  @ApiPropertyOptional({ example: 10 }) capacityLitres?: number;
  @ApiProperty({ enum: Object.values(Serviceability) }) serviceability: string;
  @ApiProperty({ example: 0, description: 'Open maintenance tickets' }) openTickets: number;
}
