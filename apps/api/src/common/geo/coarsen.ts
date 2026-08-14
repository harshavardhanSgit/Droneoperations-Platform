import type { GeoPoint } from './distance';

/** Reduces a point to the centre of the grid cell it falls in. */
export const GRID_KM = 5;

/** A degree of latitude is ~111 km everywhere. */
const KM_PER_DEGREE_LATITUDE = 111;

const snap = (value: number, step: number): number => Math.round(value / step) * step;

export function coarsen(point: GeoPoint): GeoPoint {
  const latStep = GRID_KM / KM_PER_DEGREE_LATITUDE;

  // Snap latitude FIRST, then size the longitude step from the snapped value.
  const latitude = snap(point.latitude, latStep);

  // Degrees of longitude shrink towards the poles; the guard stops the step collapsing to zero
  // there, which would divide by ~0 and produce Infinity.
  const cos = Math.max(0.01, Math.cos((latitude * Math.PI) / 180));
  const lonStep = GRID_KM / (KM_PER_DEGREE_LATITUDE * cos);

  return {
    // Rounded to 4 decimals — ~11 m, far finer than the cell, and enough to stop binary
    // floating point printing 17.972972972972975 in the payload.
    latitude: Number(latitude.toFixed(4)),
    longitude: Number(snap(point.longitude, lonStep).toFixed(4)),
  };
}

/** Null-tolerant, mirroring distanceBetween: no base means no marker. */
export function coarsenOrNull(
  point: { latitude?: number | null; longitude?: number | null } | null | undefined,
): GeoPoint | null {
  if (point?.latitude == null || point?.longitude == null) return null;

  return coarsen({ latitude: point.latitude, longitude: point.longitude });
}
