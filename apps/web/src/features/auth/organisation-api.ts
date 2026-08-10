import { apiFetch } from "@/core/api/client";
import type { OwnOrganisation } from "@/core/api/types";

export const getOwnOrganisation = () => apiFetch<OwnOrganisation>("/api/v1/organisations/me");

/**
 * Rename your own organisation. OWNER only — a MEMBER can read it but the API
 * rejects the write, which is why the account page hides this section for
 * anyone who is not an OWNER rather than letting them submit into a 403.
 */
export const renameOwnOrganisation = (name: string) =>
  apiFetch<OwnOrganisation>("/api/v1/organisations/me", {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
