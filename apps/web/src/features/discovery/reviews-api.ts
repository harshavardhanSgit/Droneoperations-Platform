import { apiFetch } from "@/core/api/client";
import type { ProviderRating } from "@/core/api/types";

/** Fetched only when a customer asks to see reviews, not with every search. */
export const getProviderRating = (providerId: string) =>
  apiFetch<ProviderRating>(`/api/v1/providers/${providerId}/rating`);
