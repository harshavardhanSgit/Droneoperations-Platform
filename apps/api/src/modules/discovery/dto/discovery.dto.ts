import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsNumber, IsOptional, IsUUID, Max, Min, ValidateIf } from 'class-validator';

import { OfferingInclusion } from '../../../generated/prisma/client';

export enum MatchSort {
  PRICE_ASC = 'PRICE_ASC',
  PRICE_DESC = 'PRICE_DESC',
  RATING_DESC = 'RATING_DESC',
  /** Requires latitude and longitude on the query — rejected without them. */
  DISTANCE_ASC = 'DISTANCE_ASC',
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

  /**
   * The district, kept only because a BOOKING needs one — Booking.areaId is a
   * required FK. It no longer decides who appears: a provider's coverage is
   * their base plus their travel radius, so matching is done on distance.
   *
   * Optional here so a customer can see who can reach a pin that falls outside
   * the 17 districts the catalogue currently knows. They will not be able to
   * book there until staff add the district, and the UI says so.
   */
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
   * Where the work is. REQUIRED — this is what discovery matches on.
   *
   * Coverage is now a provider's base plus how far they travel, so without a
   * point there is nothing to compare against. No @IsOptional and no
   * ValidateIf: both are mandatory, so the pair rule is simply "both present",
   * which the plain validators already enforce.
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

  /**
   * Straight-line kilometres from the point the customer supplied.
   *
   * A DISTANCE, never the provider's coordinates. Shipping every provider's
   * exact base to every searcher is a bigger disclosure than "12 km away", and
   * nothing on the customer's side needs the raw point.
   *
   * Absent when the customer gave no location, or when this provider has not
   * set one — which is not zero, and must not be rendered as "0 km".
   */
  @ApiPropertyOptional({
    example: 12.4,
    description: 'Straight-line km from the requested point. Absent if either side has no location.',
  })
  distanceKm?: number;
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
