import { apiFetch } from "@/core/api/client";
import type { Area, ServiceType } from "@/core/api/types";

/** Includes RETIRED entries — reference data is retired, never deleted. */
export const listServiceTypes = () =>
  apiFetch<ServiceType[]>("/api/v1/admin/catalogue/service-types");

export const createServiceType = (input: {
  code: string;
  name: string;
  pricingUnit: string;
  description?: string;
}) =>
  apiFetch<ServiceType>("/api/v1/admin/catalogue/service-types", {
    method: "POST",
    body: JSON.stringify(input),
  });

/**
 * code and pricingUnit are absent by design — the API refuses to change them.
 * Reinterpreting PER_ACRE as PER_HOUR would silently rewrite the meaning of
 * every price already quoted against it.
 */
export const updateServiceType = (
  id: string,
  input: { name?: string; description?: string; sortOrder?: number; status?: string },
) =>
  apiFetch<ServiceType>(`/api/v1/admin/catalogue/service-types/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });

/**
 * Built with URLSearchParams, not string concatenation. Hand-assembled query
 * strings get the first separator wrong the moment a parameter becomes
 * optional — which is exactly what happened here.
 */
export const listAreas = (parentId?: string) => {
  const params = new URLSearchParams({ includeRetired: "true" });

  if (parentId) {
    params.set("parentId", parentId);
  }

  return apiFetch<Area[]>(`/api/v1/admin/catalogue/areas?${params.toString()}`);
};

export const createArea = (input: { parentId?: string; level: string; name: string; code?: string }) =>
  apiFetch<Area>("/api/v1/admin/catalogue/areas", {
    method: "POST",
    body: JSON.stringify(input),
  });
