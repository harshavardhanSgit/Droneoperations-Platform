import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

import { OfferingInclusion } from '../../../generated/prisma/client';

export enum MatchSort {
  PRICE_ASC = 'PRICE_ASC',
  PRICE_DESC = 'PRICE_DESC',
  RATING_DESC = 'RATING_DESC',
}

/**
 * The customer's requirement. Note what is NOT here: a provider id. Discovery
 * takes a JOB and returns who can do it — the opposite of a directory, where
 * you pick a business first and work out the price afterwards.
 */
export class MatchQueryDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  serviceTypeId: string;

  @ApiProperty({ format: 'uuid', description: 'Where the work is' })
  @IsUUID()
  areaId: string;

  @ApiProperty({ example: 20, description: 'How many pricing units — e.g. acres' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  quantity: number;

  @ApiPropertyOptional({ enum: Object.values(MatchSort), default: MatchSort.PRICE_ASC })
  @IsOptional()
  @IsEnum(MatchSort)
  sort?: MatchSort;
}

export class MatchProviderDto {
  @ApiProperty({ format: 'uuid' }) providerId: string;
  @ApiProperty({ example: 'Yali' }) name: string;
  @ApiPropertyOptional({ example: 'Thanjavur' }) city?: string;

  @ApiPropertyOptional({
    example: 4.6,
    description: 'Absent when the provider has no reviews — not zero, which would read as a bad score',
  })
  rating?: number;

  @ApiProperty({ example: 12, description: 'How many reviews the average is based on' })
  ratingCount: number;
}

export class MatchPriceDto {
  @ApiProperty({ example: 52000, description: 'Per pricing unit, in minor units' })
  unitPriceMinor: number;

  @ApiProperty({ example: 1040000, description: 'unitPrice × quantity, in minor units' })
  estimatedTotalMinor: number;

  @ApiProperty({ example: 'INR' }) currency: string;
  @ApiProperty({ example: 'PER_ACRE' }) pricingUnit: string;
}

export class MatchDto {
  @ApiProperty({ format: 'uuid', description: 'The offering this match came from' })
  offeringId: string;

  @ApiProperty({
    example: 3,
    description: 'The exact version priced. A booking freezes this, so the price cannot move.',
  })
  offeringVersionNumber: number;

  @ApiProperty({ type: MatchProviderDto }) provider: MatchProviderDto;
  @ApiProperty({ type: MatchPriceDto }) price: MatchPriceDto;

  @ApiProperty({ enum: Object.values(OfferingInclusion), isArray: true })
  included: string[];

  @ApiProperty({
    enum: Object.values(OfferingInclusion),
    isArray: true,
    description: 'Everything NOT covered — the customer supplies these. Resolves R9.',
  })
  notIncluded: string[];

  @ApiPropertyOptional({ example: 5 }) minQuantity?: number;
  @ApiPropertyOptional() notes?: string;

  @ApiProperty({ example: 'Warangal', description: 'Which served area matched' })
  matchedArea: string;
}

export class MatchResultsDto {
  @ApiProperty({ example: 20 }) quantity: number;
  @ApiProperty({ example: 'Crop spraying' }) serviceTypeName: string;
  @ApiProperty({ example: 'PER_ACRE' }) pricingUnit: string;
  @ApiProperty({ type: [MatchDto] }) matches: MatchDto[];
  @ApiProperty({ example: 1 }) total: number;
}
