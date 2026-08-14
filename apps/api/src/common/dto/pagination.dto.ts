import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/** Query params arrive as strings, so @Type is required to convert before validation. */
export class PaginationQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

}

/**
 * Offset and limit for a repository, derived from the query.
 *
 * A function, NOT getters on the DTO. class-transformer assigns every query key onto the
 * instance, so a getter made `?take=5` throw a 500 and hid the bad parameter from the
 * whitelist. See pagination.dto.spec.ts.
 */
export interface PageRequest {
  skip: number;
  take: number;
}

export function pageOf(query: PaginationQueryDto): PageRequest {
  return { skip: (query.page - 1) * query.limit, take: query.limit };
}
