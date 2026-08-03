import { apiFetch } from "@/core/api/client";
import type {
  Provider,
  ProviderDetail,
  ProviderDocument,
  ProviderList,
} from "@/core/api/types";

export const listProviders = (stage?: string, page = 1, limit = 20) => {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (stage) params.set("stage", stage);

  return apiFetch<ProviderList>(`/api/v1/admin/providers?${params.toString()}`);
};

export const getProvider = (id: string) =>
  apiFetch<ProviderDetail>(`/api/v1/admin/providers/${id}`);

export const listProviderDocuments = (id: string) =>
  apiFetch<ProviderDocument[]>(`/api/v1/admin/providers/${id}/documents`);

/**
 * Returns a short-lived URL, not the bytes. The reviewer's browser then fetches
 * the file straight from storage — it never streams through the API.
 */
export const getDocumentLink = (providerId: string, documentId: string) =>
  apiFetch<{ url: string }>(
    `/api/v1/admin/providers/${providerId}/documents/${documentId}/link`,
  );

export const activateProvider = (id: string) =>
  apiFetch<Provider>(`/api/v1/admin/providers/${id}/activate`, { method: "POST" });

export const rejectProvider = (id: string, reason: string) =>
  apiFetch<Provider>(`/api/v1/admin/providers/${id}/reject`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
