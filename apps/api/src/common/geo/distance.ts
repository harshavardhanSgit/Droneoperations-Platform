/**
 * Great-circle distance between two points, in kilometres.
 *
 * Straight line, not road distance. Callers must present it that way: a farmer
 * told "8 km" who then drives 14 km around a river has been misled by the
 * product, not by the maths.
 *
 * Haversine rather than the spherical law of cosines: at the distances this
 * platform deals in — a provider and a field in the same district, often under
 * a kilometre apart — the law of cosines loses precision to floating-point
 * cancellation, while haversine stays well-conditioned.
 *
 * The Earth is treated as a sphere. That is wrong by up to ~0.5% against the
 * WGS-84 ellipsoid, which at 40 km is 200 metres — far below the resolution of
 * a number we round to the nearest kilometre before showing anyone.
 */
const EARTH_RADIUS_KM = 6371;

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export function distanceKm(from: GeoPoint, to: GeoPoint): number {
  const dLat = toRadians(to.latitude - from.latitude);
  const dLon = toRadians(to.longitude - from.longitude);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(from.latitude)) *
      Math.cos(toRadians(to.latitude)) *
      Math.sin(dLon / 2) ** 2;

  // Clamped before asin: rounding can push h a hair above 1 for antipodal
  // points, and Math.asin of >1 is NaN — a silent NaN would propagate into a
  // sort comparator and scramble the whole result list.
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * A pair of coordinates, or null when either side is missing one.
 *
 * Both features need the same guard — a provider who never set a location, or
 * a booking with no pin — so it lives here rather than being re-derived at each
 * call site with subtly different null checks.
 */
export function distanceBetween(
  from: { latitude?: number | null; longitude?: number | null } | null | undefined,
  to: { latitude?: number | null; longitude?: number | null } | null | undefined,
): number | null {
  if (
    from?.latitude == null ||
    from?.longitude == null ||
    to?.latitude == null ||
    to?.longitude == null
  ) {
    return null;
  }

  return distanceKm(
    { latitude: from.latitude, longitude: from.longitude },
    { latitude: to.latitude, longitude: to.longitude },
  );
}
