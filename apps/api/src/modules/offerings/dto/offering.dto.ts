import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';

import { OfferingInclusion } from '../../../generated/prisma/client';

/** ₹10,00,000 per unit. A sanity ceiling, not a business rule. */
const MAX_PRICE_MINOR = 100_000_000;

export class OfferingAreaDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: 'Warangal' }) name: string;
  @ApiProperty({ example: 'DISTRICT' }) level: string;
}

export class OfferingVersionDto {
  @ApiProperty({ example: 1 }) versionNumber: number;

  @ApiProperty({ example: 45000, description: 'Minor units (paise). 45000 = ₹450.00' })
  unitPriceMinor: number;

  @ApiProperty({ example: 'INR' }) currency: string;
  @ApiProperty({ example: 'PER_ACRE' }) pricingUnit: string;

  @ApiPropertyOptional({ example: 5, description: 'Smallest job accepted, in pricing units' })
  minQuantity?: number;

  @ApiProperty({ enum: Object.values(OfferingInclusion), isArray: true })
  inclusions: string[];

  @ApiPropertyOptional() notes?: string;

  @ApiProperty({ format: 'date-time' }) effectiveFrom: string;

  @ApiPropertyOptional({ format: 'date-time', description: 'Null on the current version' })
  effectiveTo?: string;
}

export class OfferingDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) serviceTypeId: string;
  @ApiProperty({ example: 'CROP_SPRAYING' }) serviceTypeCode: string;
  @ApiProperty({ example: 'Crop spraying' }) serviceTypeName: string;
  @ApiProperty({ enum: ['ACTIVE', 'WITHDRAWN'] }) status: string;

  @ApiProperty({ type: OfferingVersionDto, description: 'The version currently in force' })
  currentVersion: OfferingVersionDto;

  @ApiProperty({ type: [OfferingAreaDto] })
  areas: OfferingAreaDto[];
}

export class OfferingHistoryDto extends OfferingDto {
  @ApiProperty({ type: [OfferingVersionDto], description: 'Every version, oldest first' })
  versions: OfferingVersionDto[];
}

class PricedFields {
  @ApiProperty({ example: 45000, description: 'Minor units (paise). Integer only — never a float.' })
  @IsInt()
  @Min(1)
  @Max(MAX_PRICE_MINOR)
  unitPriceMinor: number;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  minQuantity?: number;

  @ApiPropertyOptional({
    enum: Object.values(OfferingInclusion),
    isArray: true,
    example: ['WATER', 'TRANSPORT'],
    description: 'What the price covers. Anything absent is the customer’s responsibility.',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(10)
  @IsEnum(OfferingInclusion, { each: true })
  inclusions?: OfferingInclusion[];

  @ApiPropertyOptional({ example: 'Dawn slots only. Minimum 5 acres per visit.' })
  @IsOptional()
  @IsString()
  @Length(2, 500)
  notes?: string;
}

export class CreateOfferingDto extends PricedFields {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  serviceTypeId: string;

  @ApiPropertyOptional({ type: [String], format: 'uuid' })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(200)
  @IsUUID('4', { each: true })
  areaIds?: string[];
}

/**
 * A COMPLETE statement of commercial terms — not a patch.
 *
 * Anything omitted is absent from the new version, including minQuantity and
 * notes. That is deliberate: a version must be readable on its own without
 * consulting its predecessors. Clients MUST pre-fill this from the current
 * version so a price change does not silently drop a minimum job size.
 */
export class CreateOfferingVersionDto extends PricedFields {}

export class SetOfferingAreasDto {
  @ApiProperty({ type: [String], format: 'uuid' })
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(200)
  @IsUUID('4', { each: true })
  areaIds: string[];
}
