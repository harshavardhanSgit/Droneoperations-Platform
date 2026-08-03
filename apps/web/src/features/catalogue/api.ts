import { apiFetch } from "@/core/api/client";
import type { Area, ServiceType } from "@/core/api/types";

export const listServiceTypes = () => apiFetch<ServiceType[]>("/api/v1/service-types");

/** One level at a time. No parentId returns states. */
export const listAreas = (parentId?: string) =>
  apiFetch<Area[]>(`/api/v1/areas${parentId ? `?parentId=${parentId}` : ""}`);
