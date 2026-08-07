import { apiFetch } from "@/core/api/client";
import type { MatchResults } from "@/core/api/types";

export type MatchSort = "PRICE_ASC" | "PRICE_DESC" | "RATING_DESC" | "DISTANCE_ASC";

export const findMatches = (input: {
  serviceTypeId: string;
  quantity: number;
  sort?: MatchSort;
  /**
   * Where the work is. REQUIRED — coverage is a provider's base plus how far
   * they travel, so without a point there is nothing to measure against.
   *
   * The response carries a distance, never the providers' own coordinates.
   */
  latitude: number;
  longitude: number;
  /**
   * The district, carried through for the booking that follows. It does NOT
   * narrow the search: a pin outside the catalogue's districts still returns
   * everyone who can reach it.
   */
  areaId?: string;
}) => {
  const params = new URLSearchParams({
    serviceTypeId: input.serviceTypeId,
    quantity: String(input.quantity),
    latitude: String(input.latitude),
    longitude: String(input.longitude),
    ...(input.sort ? { sort: input.sort } : {}),
    ...(input.areaId ? { areaId: input.areaId } : {}),
  });

  return apiFetch<MatchResults>(`/api/v1/discovery/matches?${params.toString()}`);
};
