import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Min,
} from 'class-validator';

import { AreaLevel, CatalogueStatus, PricingUnit } from '../../../generated/prisma/client';

export class ServiceTypeDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: 'CROP_SPRAYING' }) code: string;
  @ApiProperty({ example: 'Crop spraying' }) name: string;
  @ApiPropertyOptional() description?: string;
  @ApiProperty({ enum: Object.values(PricingUnit) }) pricingUnit: string;
  @ApiProperty({ enum: Object.values(CatalogueStatus) }) status: string;
  @ApiProperty({ example: 10 }) sortOrder: number;
}

export class CreateServiceTypeDto {
  @ApiProperty({ example: 'CROP_SPRAYING', description: 'Uppercase, underscores. Immutable once created.' })
  @Matches(/^[A-Z][A-Z0-9_]{2,49}$/, {
    message: 'code must be UPPER_SNAKE_CASE, 3-50 characters',
  })
  code: string;

  @ApiProperty({ example: 'Crop spraying' })
  @IsString()
  @Length(2, 120)
  name: string;

  @ApiPropertyOptional({ example: 'Aerial application of pesticide or nutrient' })
  @IsOptional()
  @IsString()
  @Length(2, 500)
  description?: string;

  @ApiProperty({ enum: Object.values(PricingUnit) })
  @IsEnum(PricingUnit)
  pricingUnit: PricingUnit;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

/**
 * `code` and `pricingUnit` are absent on purpose — both are immutable.
 * Changing a pricing unit would silently reinterpret every existing offering's
 * price (₹500 per acre becoming ₹500 per hour). Retire and replace instead.
 */
export class UpdateServiceTypeDto {
  @ApiPropertyOptional({ example: 'Crop spraying' })
  @IsOptional()
  @IsString()
  @Length(2, 120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 500)
  description?: string;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({ enum: Object.values(CatalogueStatus) })
  @IsOptional()
  @IsEnum(CatalogueStatus)
  status?: CatalogueStatus;
}

export class AreaDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiPropertyOptional({ format: 'uuid' }) parentId?: string;
  @ApiProperty({ enum: Object.values(AreaLevel) }) level: string;
  @ApiProperty({ example: 'Warangal' }) name: string;
  @ApiPropertyOptional({ example: 'TG-WGL' }) code?: string;
  @ApiProperty({ enum: Object.values(CatalogueStatus) }) status: string;
}

export class AreaWithPathDto extends AreaDto {
  @ApiProperty({ example: 'Warangal, Telangana', description: 'Leaf to root, comma separated' })
  path: string;
}

export class CreateAreaDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Omit for a STATE' })
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @ApiProperty({ enum: Object.values(AreaLevel) })
  @IsEnum(AreaLevel)
  level: AreaLevel;

  @ApiProperty({ example: 'Warangal' })
  @IsString()
  @Length(2, 120)
  name: string;

  @ApiPropertyOptional({ example: 'TG-WGL' })
  @IsOptional()
  @IsString()
  @Length(2, 40)
  code?: string;
}
