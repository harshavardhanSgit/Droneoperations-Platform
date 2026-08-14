import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsNumber, IsOptional, IsUUID, Max, Min } from 'class-validator';

import { OfferingInclusion } from '../../../generated/prisma/client';

export enum MatchSort {
  PRICE_ASC = 'PRICE_ASC',
  PRICE_DESC = 'PRICE_DESC',
  RATING_DESC = 'RATING_DESC',
  /** Requires latitude and longitude on the query — rejected without them. */
  DISTANCE_ASC = 'DISTANCE_ASC',
}

/** The customer's requirement. */
export class MatchQueryDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  serviceTypeId: string;

  /** The district, kept only because a BOOKING needs one — Booking.areaId is a required FK. */
  @ApiPropertyOptional({ format: 'uuid', description: 'District, for the booking that follows' })
  @IsOptional()
  @IsUUID()
  areaId?: string;

  @ApiProperty({ example: 20, description: 'How many pricing units — e.g. acres' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  quantity: number;

  /**
   * Where the work is. Required — this is what discovery matches on.
   *
   * Do NOT add @IsOptional: both are mandatory, and @IsOptional would let a half-pair
   * through. discovery.dto.spec.ts pins this.
   */
  @ApiProperty({ example: 17.9689 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 7 })
  @Min(-90)
  @Max(90)
  latitude: number;

  @ApiProperty({ example: 79.5941 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 7 })
  @Min(-180)
  @Max(180)
  longitude: number;

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

  /** Straight-line kilometres from the point the customer supplied. */
  @ApiPropertyOptional({
    example: 12.4,
    description: 'Straight-line km from the requested point. Absent if either side has no location.',
  })
  distanceKm?: number;

  /** Where to draw this provider on the map — APPROXIMATE, on purpose. */
  @ApiPropertyOptional({
    example: 17.9707,
    description: 'Approximate base, snapped to a ~5 km grid. NOT the exact location.',
  })
  approxLatitude?: number;

  @ApiPropertyOptional({
    example: 79.6081,
    description: 'Approximate base, snapped to a ~5 km grid. NOT the exact location.',
  })
  approxLongitude?: number;
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

  /*
   * There is deliberately no area field here.
   *
   * `matchedArea` used to name the district that satisfied the join. Nothing
   * matches an area any more — the radius decides — so the field could only
   * have been a lie about how the result was produced.
   *
   * A list of the provider's declared districts was tried in its place and
   * removed: providers stop maintaining that list once it gates nothing, and
   * showing "serves Karimnagar, Warangal" beside a pin in neither reads as a
   * contradiction. What the customer needs is here already — who they are,
   * where they are based, and how far away that is.
   */
}

export class MatchResultsDto {
  @ApiProperty({ example: 20 }) quantity: number;
  @ApiProperty({ example: 'Crop spraying' }) serviceTypeName: string;
  @ApiProperty({ example: 'PER_ACRE' }) pricingUnit: string;
  @ApiProperty({ type: [MatchDto] }) matches: MatchDto[];
  @ApiProperty({ example: 1 }) total: number;
}
