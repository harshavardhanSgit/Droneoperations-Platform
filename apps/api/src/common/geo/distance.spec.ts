import { distanceBetween, distanceKm } from './distance';

/** Real places this platform serves, so a wrong answer looks wrong. */
const WARANGAL = { latitude: 17.9689, longitude: 79.5941 };
const HYDERABAD = { latitude: 17.385, longitude: 78.4867 };
const KHAMMAM = { latitude: 17.2473, longitude: 80.1514 };

describe('distanceKm', () => {
  it('matches a known separation', () => {
    // Warangal to Hyderabad is ~134 km straight line. Asserted as a range
    // rather than toBeCloseTo, whose precision argument is base-10 exponents
    // and reads as a tolerance it is not.
    const d = distanceKm(WARANGAL, HYDERABAD);

    expect(d).toBeGreaterThan(132);
    expect(d).toBeLessThan(137);
  });

  it('is zero for the same point, not NaN', () => {
    expect(distanceKm(WARANGAL, WARANGAL)).toBe(0);
  });

  it('is symmetric', () => {
    expect(distanceKm(WARANGAL, KHAMMAM)).toBeCloseTo(distanceKm(KHAMMAM, WARANGAL), 9);
  });

  it('stays finite for antipodal points', () => {
    // sqrt(h) can round above 1 here; without the clamp Math.asin returns NaN
    // and a NaN in a sort comparator scrambles the entire result list.
    const north = { latitude: 45, longitude: 0 };
    const antipode = { latitude: -45, longitude: 180 };

    const d = distanceKm(north, antipode);

    expect(Number.isNaN(d)).toBe(false);
    expect(d).toBeCloseTo(Math.PI * 6371, 0);
  });

  it('resolves sub-kilometre separations', () => {
    // The common case: a field a few hundred metres from the provider's yard.
    const nearby = { latitude: WARANGAL.latitude + 0.0045, longitude: WARANGAL.longitude };

    const d = distanceKm(WARANGAL, nearby);

    expect(d).toBeGreaterThan(0.4);
    expect(d).toBeLessThan(0.6);
  });
});

describe('distanceBetween', () => {
  it('returns a distance when both sides have coordinates', () => {
    expect(distanceBetween(WARANGAL, KHAMMAM)).toBeGreaterThan(0);
  });

  it.each([
    ['origin missing entirely', null, KHAMMAM],
    ['target missing entirely', WARANGAL, null],
    ['origin has only latitude', { latitude: 17.9, longitude: null }, KHAMMAM],
    ['target has only longitude', WARANGAL, { latitude: null, longitude: 80.1 }],
    ['origin undefined fields', {}, KHAMMAM],
  ])('returns null when %s', (_label, from, to) => {
    expect(distanceBetween(from, to)).toBeNull();
  });

  it('treats 0,0 as a real coordinate rather than absent', () => {
    // Guarding with `!from.latitude` instead of `== null` would drop the
    // equator and the prime meridian.
    expect(distanceBetween({ latitude: 0, longitude: 0 }, WARANGAL)).toBeGreaterThan(0);
  });
});
