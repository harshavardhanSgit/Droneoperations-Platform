import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class CreateReviewDto {
  @ApiProperty({ example: 4, minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiPropertyOptional({ example: 'Arrived on time, coverage was even.' })
  @IsOptional()
  @IsString()
  @Length(2, 1000)
  comment?: string;
}

export class ReviewDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) bookingId: string;
  @ApiProperty({ example: 4 }) rating: number;
  @ApiPropertyOptional() comment?: string;
  @ApiProperty({ example: 'Ramesh Kumar Farms' }) customerName: string;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
}

export class ProviderRatingDto {
  @ApiProperty({ format: 'uuid' }) providerId: string;

  @ApiPropertyOptional({
    example: 4.3,
    description: 'Derived from reviews on every request. Null until the first review.',
  })
  average?: number;

  @ApiProperty({ example: 7 }) count: number;

  @ApiProperty({ type: [ReviewDto] }) reviews: ReviewDto[];
}
