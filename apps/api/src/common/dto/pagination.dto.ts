import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * Query params arrive as strings, so @Type is required to convert before
 * validation. Without it @IsInt fails on "2" — the global ValidationPipe has
 * enableImplicitConversion off on purpose, because implicit coercion silently
 * turns "abc" into NaN elsewhere.
 */
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
 * A FUNCTION, not getters on the DTO — and that is a correctness fix, not a
 * style preference.
 *
 * `skip` and `take` used to be getters here. class-transformer builds the DTO
 * by assigning every key of the incoming query onto the instance, so a request
 * carrying `?take=5` tried to write to a getter-only property and threw a
 * TypeError: the API answered a malformed query with 500 INTERNAL_ERROR.
 *
 * Worse, the getter also HID the problem from validation. `forbidNonWhitelisted`
 * rejects properties with no validation decorators, but it inspects the
 * instance's own keys — and an assignment intercepted by a prototype getter
 * never creates one. So the only two outcomes available were a crash, or
 * silently ignoring a parameter the caller clearly meant.
 *
 * With the getters gone, `?take=5` lands as a plain own property, the whitelist
 * sees it, and the caller gets a 400 saying which parameter is wrong.
 */
export interface PageRequest {
  skip: number;
  take: number;
}

export function pageOf(query: PaginationQueryDto): PageRequest {
  return { skip: (query.page - 1) * query.limit, take: query.limit };
}
