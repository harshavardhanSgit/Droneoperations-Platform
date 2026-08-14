import { apiFetch } from "@/core/api/client";
import type { OwnOrganisation } from "@/core/api/types";

export const getOwnOrganisation = () => apiFetch<OwnOrganisation>("/api/v1/organisations/me");

/** Rename your own organisation. */
export const renameOwnOrganisation = (name: string) =>
  apiFetch<OwnOrganisation>("/api/v1/organisations/me", {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
