import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

import { PaymentMethod } from '../../../generated/prisma/client';

export class RecordPaymentDto {
  @ApiProperty({ example: 936000, description: 'Minor units (paise). Defaults to the final amount if omitted.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1_000_000_000)
  amountMinor?: number;

  @ApiProperty({ enum: Object.values(PaymentMethod), example: PaymentMethod.UPI })
  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  @ApiProperty({ example: '2026-08-18', description: 'The day money changed hands' })
  @IsDateString()
  paidOn: string;

  @ApiPropertyOptional({ example: 'UPI ref 402812345678' })
  @IsOptional()
  @IsString()
  @Length(2, 120)
  reference?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(2, 500)
  note?: string;
}

export class PaymentDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) bookingId: string;
  @ApiProperty({ example: 936000 }) amountMinor: number;
  @ApiProperty({ example: 'INR' }) currency: string;
  @ApiProperty({ enum: Object.values(PaymentMethod) }) method: string;
  @ApiProperty({ example: '2026-08-18' }) paidOn: string;
  @ApiPropertyOptional() reference?: string;
  @ApiPropertyOptional() note?: string;

  @ApiProperty({
    enum: ['CUSTOMER', 'PROVIDER'],
    description: 'Who logged it. The platform does not verify payment (R8) — both sides see this.',
  })
  recordedByRole: string;

  @ApiProperty({ format: 'date-time' }) recordedAt: string;
}

export class EarningsDto {
  @ApiProperty({ example: 12, description: 'Bookings completed' }) completedJobs: number;
  @ApiProperty({ example: 9, description: 'Of those, how many have a payment recorded' }) paidJobs: number;
  @ApiProperty({ example: 8424000, description: 'Sum of recorded payments, minor units' }) receivedMinor: number;
  @ApiProperty({ example: 1872000, description: 'Completed work with no payment recorded yet' }) outstandingMinor: number;
  @ApiProperty({ example: 'INR' }) currency: string;
}
