import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsNumber,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

/** The customer's saved default field. */
export class UpdateCustomerProfileDto {
  /** Both or neither, the same contract Provider and Booking use. */
  @ApiPropertyOptional({ example: 17.9689, nullable: true })
  @ValidateIf((o: UpdateCustomerProfileDto) => o.longitude !== undefined && o.latitude !== null)
  @IsNumber({ maxDecimalPlaces: 7 })
  @Min(-90)
  @Max(90)
  latitude?: number | null;

  @ApiPropertyOptional({ example: 79.5941, nullable: true })
  @ValidateIf((o: UpdateCustomerProfileDto) => o.latitude !== undefined && o.longitude !== null)
  @IsNumber({ maxDecimalPlaces: 7 })
  @Min(-180)
  @Max(180)
  longitude?: number | null;

  @ApiPropertyOptional({ example: 'The north field, behind the water tank', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  locationLabel?: string | null;

  /**
   * The district that pin sits in, stored so a booking does not need a geocode round trip to
   * find it again.
   */
  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @ValidateIf((o: UpdateCustomerProfileDto) => o.defaultAreaId !== null)
  @IsUUID()
  defaultAreaId?: string | null;
}

export class CustomerProfileDto {
  @ApiPropertyOptional({ example: 17.9689 }) latitude?: number;
  @ApiPropertyOptional({ example: 79.5941 }) longitude?: number;
  @ApiPropertyOptional({ example: 'The north field' }) locationLabel?: string;
  @ApiPropertyOptional({ format: 'uuid' }) defaultAreaId?: string;
  /** Resolved for display, so the client need not look the district up again. */
  @ApiPropertyOptional({ example: 'Warangal' }) defaultAreaName?: string;

  /** The district's parent state. */
  @ApiPropertyOptional({ format: 'uuid' }) defaultAreaParentId?: string;
}
