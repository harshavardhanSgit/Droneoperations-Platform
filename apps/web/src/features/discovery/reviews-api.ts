import { apiFetch } from "@/core/api/client";
import type { ProviderRating } from "@/core/api/types";

/**
 * Fetched only when a customer asks to see reviews, not with every search.
 *
 * The aggregate already arrives on the search result; the review text is the
 * expensive part and most customers never open it. Loading it eagerly for
 * twenty results to serve the one a customer expands is work nobody asked for.
 */
export const getProviderRating = (providerId: string) =>
  apiFetch<ProviderRating>(`/api/v1/providers/${providerId}/rating`);
