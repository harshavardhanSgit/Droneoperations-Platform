import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

import { BookingStatus, TimeWindow } from '../../../generated/prisma/client';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

export class CreateBookingDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  serviceTypeId: string;

  @ApiProperty({ format: 'uuid', description: 'Where the work is' })
  @IsUUID()
  areaId: string;

  @ApiProperty({ example: 20, description: 'In pricing units — e.g. acres' })
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  quantity: number;

  /**
   * F9. A calendar date, not an instant. "2026-08-14" plus MORNING is the real
   * commitment; a timestamp invents precision neither party agreed to.
   */
  @ApiProperty({ example: '2026-08-14', description: 'Local calendar date (YYYY-MM-DD)' })
  @IsDateString()
  preferredDate: string;

  @ApiProperty({ enum: Object.values(TimeWindow), example: TimeWindow.DAWN })
  @IsEnum(TimeWindow)
  preferredWindow: TimeWindow;

  @ApiPropertyOptional({ example: 'Field behind the water tank, Kothapally village' })
  @IsOptional()
  @IsString()
  @Length(2, 500)
  locationNote?: string;

  /**
   * The field's exact spot, picked on a map. Latitude and longitude are a
   * pair: sending one without the other is rejected by the ValidateIf rules
   * below, so a booking cannot be created with a missing axis. The district
   * (areaId) stays the market scope; these are the delivery coordinates.
   *
   * NOTE — do NOT add @IsOptional to either field. The pair rule depends on
   * ValidateIf short-circuiting the @IsNumber check when the OTHER field is
   * absent: with only longitude sent, latitude's IsNumber sees `undefined` and
   * fails the request. @IsOptional would short-circuit that failure and let a
   * half-pair through. booking.dto.spec.ts pins this behaviour.
   */
  @ApiPropertyOptional({ example: 17.9689, description: 'Latitude of the work site' })
  @ValidateIf((o) => o.longitude !== undefined)
  @IsNumber({ maxDecimalPlaces: 7 })
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiPropertyOptional({ example: 79.5941, description: 'Longitude of the work site' })
  @ValidateIf((o) => o.latitude !== undefined)
  @IsNumber({ maxDecimalPlaces: 7 })
  @Min(-180)
  @Max(180)
  longitude?: number;

  /**
   * Chosen from Discovery results. Optional so a booking can be created
   * unassigned — which is exactly what V2's auto-assignment will do.
   */
  @ApiPropertyOptional({ format: 'uuid', description: 'Offering to assign immediately' })
  @IsOptional()
  @IsUUID()
  offeringId?: string;
}

export class AssignProviderDto {
  @ApiProperty({ format: 'uuid', description: 'Offering to assign, from Discovery' })
  @IsUUID()
  offeringId: string;
}

export class RejectBookingDto {
  @ApiProperty({ example: 'Fully booked that week' })
  @IsString()
  @Length(3, 500)
  reason: string;
}

export class CancelBookingDto {
  @ApiProperty({ example: 'Crop was harvested early' })
  @IsString()
  @Length(3, 500)
  reason: string;
}

export class ProposeScheduleDto {
  @ApiProperty({ example: '2026-08-16', description: 'Local calendar date (YYYY-MM-DD)' })
  @IsDateString()
  date: string;

  @ApiProperty({ enum: Object.values(TimeWindow) })
  @IsEnum(TimeWindow)
  window: TimeWindow;
}

export class CompleteBookingDto {
  @ApiProperty({
    example: 18,
    description: 'What was ACTUALLY delivered. May differ from what was booked (BR14).',
  })
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  finalQuantity: number;

  @ApiPropertyOptional({ example: 'Wind picked up; 2 acres left for tomorrow' })
  @IsOptional()
  @IsString()
  @Length(2, 500)
  note?: string;
}

export class PendingScheduleDto {
  @ApiProperty({ example: '2026-08-16' }) date: string;
  @ApiProperty({ enum: Object.values(TimeWindow) }) window: string;
  @ApiProperty({ enum: ['CUSTOMER', 'PROVIDER'], description: 'Who proposed it — the OTHER party confirms (BR15)' })
  proposedBy: string;
}

export class BookingQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: Object.values(BookingStatus) })
  @IsOptional()
  @IsEnum(BookingStatus)
  status?: BookingStatus;
}

export class ProviderBookingQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: ['PENDING', 'ACCEPTED', 'REJECTED'],
    description: 'PENDING is the request inbox',
  })
  @IsOptional()
  @IsString()
  assignmentStatus?: string;
}

export class BookingAssignmentDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) providerId: string;
  @ApiProperty({ example: 'Kumar Agri Services' }) providerName: string;
  @ApiProperty({ enum: ['PENDING', 'ACCEPTED', 'REJECTED', 'SUPERSEDED', 'CANCELLED'] }) status: string;
  @ApiProperty({ enum: ['CUSTOMER_CHOICE', 'PLATFORM_AUTO', 'PLATFORM_MANAGED'] }) strategy: string;
  @ApiPropertyOptional() rejectionReason?: string;
  @ApiProperty({ format: 'date-time' }) assignedAt: string;
  @ApiPropertyOptional({ format: 'date-time' }) respondedAt?: string;
}

export class BookingHistoryEntryDto {
  @ApiPropertyOptional({ enum: Object.values(BookingStatus) }) fromStatus?: string;
  @ApiProperty({ enum: Object.values(BookingStatus) }) toStatus: string;
  @ApiPropertyOptional() reason?: string;
  @ApiProperty({ format: 'date-time' }) at: string;
}

export class BookingDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ enum: Object.values(BookingStatus) }) status: string;

  // The ids as well as the names: an operator looking at an unassigned job needs
  // to ask Discovery who could take it, and that question is asked with ids.
  @ApiProperty({ format: 'uuid' }) serviceTypeId: string;
  @ApiProperty({ example: 'Crop spraying' }) serviceTypeName: string;
  @ApiProperty({ format: 'uuid' }) areaId: string;
  @ApiProperty({ example: 'Warangal' }) areaName: string;
  @ApiProperty({ example: 20 }) quantity: number;
  @ApiProperty({ example: 'PER_ACRE' }) pricingUnit: string;
  @ApiPropertyOptional({ example: 'Field behind the water tank' }) locationNote?: string;

  @ApiPropertyOptional({ example: 17.9689, description: 'Latitude of the work site' }) latitude?: number;
  @ApiPropertyOptional({ example: 79.5941, description: 'Longitude of the work site' }) longitude?: number;

  @ApiProperty({ example: '2026-08-14' }) preferredDate: string;
  @ApiProperty({ enum: Object.values(TimeWindow) }) preferredWindow: string;

  @ApiPropertyOptional({ example: 52000 }) unitPriceMinor?: number;
  @ApiPropertyOptional({ example: 1040000 }) estimatedTotalMinor?: number;
  @ApiProperty({ example: 'INR' }) currency: string;

  @ApiProperty({ example: 'Ramesh Kumar Farms' }) customerName: string;

  @ApiPropertyOptional({ type: BookingAssignmentDto, description: 'The assignment currently in force' })
  activeAssignment?: BookingAssignmentDto;

  @ApiPropertyOptional({ example: '2026-08-16', description: 'The agreed date' })
  confirmedDate?: string;

  @ApiPropertyOptional({ enum: Object.values(TimeWindow) }) confirmedWindow?: string;

  @ApiPropertyOptional({ type: PendingScheduleDto, description: 'A date awaiting the other party' })
  pendingSchedule?: PendingScheduleDto;

  @ApiPropertyOptional({ example: 18 }) finalQuantity?: number;
  @ApiPropertyOptional({ example: 936000 }) finalAmountMinor?: number;
  @ApiPropertyOptional() completionNote?: string;

  @ApiPropertyOptional() cancelledReason?: string;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
}

export class BookingDetailDto extends BookingDto {
  @ApiProperty({ type: [BookingAssignmentDto], description: 'Every assignment, including rejections' })
  assignments: BookingAssignmentDto[];

  @ApiProperty({ type: [BookingHistoryEntryDto] })
  history: BookingHistoryEntryDto[];
}

export class BookingListDto {
  @ApiProperty({ type: [BookingDto] }) items: BookingDto[];
  @ApiProperty({ example: 4 }) total: number;
}
