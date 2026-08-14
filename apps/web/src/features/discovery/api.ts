import { apiFetch } from "@/core/api/client";
import type { MatchResults } from "@/core/api/types";

export type MatchSort = "PRICE_ASC" | "PRICE_DESC" | "RATING_DESC" | "DISTANCE_ASC";

export const findMatches = (input: {
  serviceTypeId: string;
  quantity: number;
  sort?: MatchSort;
  /** Where the work is. */
  latitude: number;
  longitude: number;
  /** The district, carried through for the booking that follows. */
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
