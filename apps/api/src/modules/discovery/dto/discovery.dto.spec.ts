import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { MatchQueryDto, MatchSort } from './discovery.dto';

/** Coordinates are now MANDATORY on a search. */
const BASE = {
  serviceTypeId: 'f0f0f0f0-0000-4000-8000-000000000001',
  quantity: 20,
  latitude: 17.9689,
  longitude: 79.5941,
};

async function errorsFor(patch: Record<string, unknown> = {}) {
  return validate(plainToInstance(MatchQueryDto, { ...BASE, ...patch }));
}

const fieldsWithErrors = async (patch: Record<string, unknown>) =>
  (await errorsFor(patch)).map((e) => e.property).sort();

describe('MatchQueryDto', () => {
  it('accepts a search with a pin and no district', async () => {
    // The point of the change: a pin outside the 17 catalogue districts must still return the
    // providers who can reach it.
    expect(await errorsFor()).toHaveLength(0);
  });

  it('accepts a district alongside the pin', async () => {
    // Carried through for the booking that follows, never as a filter.
    expect(await errorsFor({ areaId: 'f0f0f0f0-0000-4000-8000-000000000002' })).toHaveLength(0);
  });

  it.each([
    ['no coordinates at all', { latitude: undefined, longitude: undefined }, ['latitude', 'longitude']],
    ['latitude without longitude', { longitude: undefined }, ['longitude']],
    ['longitude without latitude', { latitude: undefined }, ['latitude']],
  ])('rejects %s', async (_label, patch, expected) => {
    expect(await fieldsWithErrors(patch)).toEqual(expected);
  });

  it('rejects a malformed district', async () => {
    expect(await fieldsWithErrors({ areaId: 'not-a-uuid' })).toEqual(['areaId']);
  });

  it.each([
    ['latitude above 90', { latitude: 91 }],
    ['latitude below -90', { latitude: -91 }],
    ['longitude above 180', { longitude: 181 }],
    ['longitude below -180', { longitude: -181 }],
  ])('rejects %s', async (_label, patch) => {
    expect((await errorsFor(patch)).length).toBeGreaterThan(0);
  });

  it('rejects more than seven decimal places', async () => {
    // The column is a double; the cap keeps a raw Leaflet click (~15 places) from being stored
    // at a precision the product does not mean.
    expect((await errorsFor({ latitude: 17.123456789 })).length).toBeGreaterThan(0);
  });

  it('accepts 0,0 as a real coordinate', async () => {
    // Off the coast of Africa, but a valid pair — a truthiness guard anywhere in this chain
    // would reject the equator and the prime meridian.
    expect(await errorsFor({ latitude: 0, longitude: 0 })).toHaveLength(0);
  });

  it('accepts every sort value, including DISTANCE_ASC', async () => {
    for (const sort of Object.values(MatchSort)) {
      expect(await errorsFor({ sort })).toHaveLength(0);
    }
  });
});
