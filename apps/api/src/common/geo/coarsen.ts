import type { GeoPoint } from './distance';

/**
 * Reduces a point to the centre of the grid cell it falls in.
 *
 * WHY THIS EXISTS
 *
 * The search map shows where providers are. A provider's exact registered base
 * is competitive intelligence — a rival can read a fleet's whole footprint off
 * a public search — so the map gets an approximate point and the exact one
 * never leaves the API.
 *
 * WHY A GRID RATHER THAN RANDOM JITTER
 *
 * Two reasons, and the second is the one that actually bites.
 *
 * 1. Random offsets are NOT anonymising when they are re-rolled. Sample the
 *    same provider often enough and the offsets average out to their true
 *    position. Grid snapping throws the information away once and for all: the
 *    output carries no trace of where in the cell the input was.
 *
 * 2. A re-rolled offset MOVES. The marker would sit somewhere new on every
 *    search, which reads as a bug — and a provider whose pin drifts while their
 *    stated distance stays put looks like broken data, not privacy.
 *
 * Snapping is a pure function of the input, so the same provider lands on the
 * same point every time, for every customer, forever.
 *
 * WHAT THIS DOES NOT PROTECT AGAINST
 *
 * Stated plainly, because a privacy control nobody understands is worse than
 * none: the response also carries an exact `distanceKm`. That is a circle
 * around the customer's pin, and intersecting it with this cell narrows the
 * base to an arc inside the cell. Someone who searches from several pins can
 * trilaterate a base regardless — which was already true when distance alone
 * was published.
 *
 * So the honest claim is narrow: THE MARKER is accurate to a cell, and casual
 * viewers learn a neighbourhood rather than an address. It is not a defence
 * against a determined attacker, and calling it one would be a lie.
 */
export const GRID_KM = 5;

/** A degree of latitude is ~111 km everywhere. */
const KM_PER_DEGREE_LATITUDE = 111;

const snap = (value: number, step: number): number => Math.round(value / step) * step;

export function coarsen(point: GeoPoint): GeoPoint {
  const latStep = GRID_KM / KM_PER_DEGREE_LATITUDE;

  // Snap latitude FIRST, then size the longitude step from the snapped value.
  //
  // Using the raw latitude here would make the longitude grid itself depend on
  // the exact input, so two providers in one cell could land on different
  // longitudes — leaking back the precision the snap just removed.
  const latitude = snap(point.latitude, latStep);

  // Degrees of longitude shrink towards the poles; the guard stops the step
  // collapsing to zero there, which would divide by ~0 and produce Infinity.
  const cos = Math.max(0.01, Math.cos((latitude * Math.PI) / 180));
  const lonStep = GRID_KM / (KM_PER_DEGREE_LATITUDE * cos);

  return {
    // Rounded to 4 decimals — ~11 m, far finer than the cell, and enough to
    // stop binary floating point printing 17.972972972972975 in the payload.
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
