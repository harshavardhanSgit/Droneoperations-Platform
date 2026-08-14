import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { pageOf, PaginationQueryDto } from './pagination.dto';

/**
 * The regression this file exists for: `skip` and `take` were getters on the DTO.
 * class-transformer builds the instance by assigning every key of the query onto it.
 */
const build = (query: Record<string, unknown>) => plainToInstance(PaginationQueryDto, query);

// Mirrors main.ts's global ValidationPipe.
const check = (query: Record<string, unknown>) =>
  validate(build(query), { whitelist: true, forbidNonWhitelisted: true });

describe('PaginationQueryDto', () => {
  it('defaults to the first page', async () => {
    const dto = build({});

    expect(await check({})).toHaveLength(0);
    expect(pageOf(dto)).toEqual({ skip: 0, take: 20 });
  });

  it('converts string query params before validating', async () => {
    // Query params always arrive as strings; without @Type these fail @IsInt.
    expect(await check({ page: '3', limit: '10' })).toHaveLength(0);
    expect(pageOf(build({ page: '3', limit: '10' }))).toEqual({ skip: 20, take: 10 });
  });

  it.each([
    ['skip', { skip: 0 }],
    ['take', { take: 5 }],
    ['both', { skip: 0, take: 5 }],
  ])('REJECTS a raw %s parameter instead of crashing', async (_label, query) => {
    // The heart of it. Building the instance must not throw...
    expect(() => build(query)).not.toThrow();

    // ...and the unknown property must be visible to the whitelist, which is what turns this
    // into a 400 rather than a silently ignored parameter.
    const errors = await check(query);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors.map((error) => error.property).sort()).toEqual(Object.keys(query).sort());
  });

  it.each([
    ['page below 1', { page: 0 }],
    ['limit below 1', { limit: 0 }],
    ['limit above the cap', { limit: 101 }],
    ['a non-numeric page', { page: 'abc' }],
  ])('rejects %s', async (_label, query) => {
    expect((await check(query)).length).toBeGreaterThan(0);
  });

  it('allows the maximum page size exactly', async () => {
    expect(await check({ limit: 100 })).toHaveLength(0);
  });
});

describe('pageOf', () => {
  it('offsets by whole pages', () => {
    expect(pageOf(build({ page: 1, limit: 20 }))).toEqual({ skip: 0, take: 20 });
    expect(pageOf(build({ page: 2, limit: 20 }))).toEqual({ skip: 20, take: 20 });
    expect(pageOf(build({ page: 5, limit: 7 }))).toEqual({ skip: 28, take: 7 });
  });
});
