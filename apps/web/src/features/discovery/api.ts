import { apiFetch } from "@/core/api/client";
import type { MatchResults } from "@/core/api/types";

export type MatchSort = "PRICE_ASC" | "PRICE_DESC" | "RATING_DESC";

export const findMatches = (input: {
  serviceTypeId: string;
  areaId: string;
  quantity: number;
  sort?: MatchSort;
}) => {
  const params = new URLSearchParams({
    serviceTypeId: input.serviceTypeId,
    areaId: input.areaId,
    quantity: String(input.quantity),
    ...(input.sort ? { sort: input.sort } : {}),
  });

  return apiFetch<MatchResults>(`/api/v1/discovery/matches?${params.toString()}`);
};
