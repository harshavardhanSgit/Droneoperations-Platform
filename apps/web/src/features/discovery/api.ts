import { apiFetch } from "@/core/api/client";
import type { MatchResults } from "@/core/api/types";

export const findMatches = (input: {
  serviceTypeId: string;
  areaId: string;
  quantity: number;
}) => {
  const params = new URLSearchParams({
    serviceTypeId: input.serviceTypeId,
    areaId: input.areaId,
    quantity: String(input.quantity),
  });

  return apiFetch<MatchResults>(`/api/v1/discovery/matches?${params.toString()}`);
};
