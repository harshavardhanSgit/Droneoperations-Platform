import { coarsen, coarsenOrNull, GRID_KM } from './coarsen';
import { distanceKm } from './distance';

const WARANGAL = { latitude: 17.9689, longitude: 79.5941 };

describe('coarsen', () => {
  it('is deterministic — the same input always gives the same point', () => {
    // The property the whole design rests on. A re-rolled random offset would
    // move the marker on every search, which reads as broken data.
    expect(coarsen(WARANGAL)).toEqual(coarsen(WARANGAL));
  });

  it('moves the point off the real base', () => {
    // If it ever returned the input unchanged, the exact position would be
    // published under a name that promised otherwise.
    expect(coarsen(WARANGAL)).not.toEqual(WARANGAL);
  });

  it('stays within the cell it snapped to', () => {
    // Half a cell diagonal is the worst case: sqrt(2)/2 * GRID_KM ~ 3.54 km.
    // Assert against that bound rather than a magic number, so changing
    // GRID_KM cannot silently invalidate the test.
    const bound = (Math.SQRT2 / 2) * GRID_KM;

    for (let dLat = -0.05; dLat <= 0.05; dLat += 0.011) {
      for (let dLon = -0.05; dLon <= 0.05; dLon += 0.011) {
        const point = {
          latitude: WARANGAL.latitude + dLat,
          longitude: WARANGAL.longitude + dLon,
        };

        expect(distanceKm(point, coarsen(point))).toBeLessThanOrEqual(bound);
      }
    }
  });

  it('collapses nearby points onto one marker', () => {
    // Two bases a few hundred metres apart must not be distinguishable on the
    // map — otherwise the grid narrows nothing for providers in a cluster.
    const a = coarsen(WARANGAL);
    const b = coarsen({ latitude: WARANGAL.latitude + 0.002, longitude: WARANGAL.longitude + 0.002 });

    expect(a).toEqual(b);
  });

  it('sizes the longitude grid from the SNAPPED latitude, not the raw one', () => {
    // Two points in the same latitude band, differing only below the snap
    // threshold. If the longitude step were derived from the raw latitude they
    // would land on different longitudes, leaking back the precision the snap
    // just removed.
    const a = coarsen({ latitude: 17.9689, longitude: 79.5941 });
    const b = coarsen({ latitude: 17.9695, longitude: 79.5941 });

    expect(a.longitude).toBe(b.longitude);
  });

  it('survives the poles without dividing by zero', () => {
    const result = coarsen({ latitude: 89.9, longitude: 100 });

    expect(Number.isFinite(result.latitude)).toBe(true);
    expect(Number.isFinite(result.longitude)).toBe(true);
  });

  it('handles 0,0 as a real point', () => {
    // A truthiness guard anywhere in the chain would reject the equator and
    // the prime meridian.
    expect(coarsen({ latitude: 0, longitude: 0 })).toEqual({ latitude: 0, longitude: 0 });
  });

  it('returns short numbers, not floating-point noise', () => {
    const { latitude, longitude } = coarsen(WARANGAL);

    expect(String(latitude).replace('-', '').split('.')[1]?.length ?? 0).toBeLessThanOrEqual(4);
    expect(String(longitude).replace('-', '').split('.')[1]?.length ?? 0).toBeLessThanOrEqual(4);
  });
});

describe('coarsenOrNull', () => {
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['no latitude', { longitude: 79.5941 }],
    ['no longitude', { latitude: 17.9689 }],
    ['null latitude', { latitude: null, longitude: 79.5941 }],
  ])('returns null for %s', (_label, input) => {
    expect(coarsenOrNull(input)).toBeNull();
  });

  it('coarsens a complete pair', () => {
    expect(coarsenOrNull(WARANGAL)).toEqual(coarsen(WARANGAL));
  });
});
