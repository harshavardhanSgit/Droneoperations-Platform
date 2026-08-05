import { apiFetch } from "@/core/api/client";
import type { Offering, OfferingHistory } from "@/core/api/types";

export type Inclusion = "CHEMICAL" | "WATER" | "TRANSPORT" | "LABOUR" | "FUEL";

export interface OfferingTerms {
  unitPriceMinor: number;
  minQuantity?: number;
  inclusions?: Inclusion[];
  notes?: string;
}

export const listOfferings = () => apiFetch<Offering[]>("/api/v1/providers/me/offerings");

export const createOffering = (
  input: OfferingTerms & { serviceTypeId: string; areaIds?: string[] },
) =>
  apiFetch<Offering>("/api/v1/providers/me/offerings", {
    method: "POST",
    body: JSON.stringify(input),
  });

/**
 * A COMPLETE replacement of the terms, not a patch.
 *
 * Anything omitted here is absent from the new version — leave `notes` out and
 * the new version has no notes. The form therefore pre-fills from the current
 * version rather than starting blank, or a provider changing only the price
 * would silently drop their minimum quantity and inclusions.
 *
 * The previous version is never edited, which is what lets an already-quoted
 * booking keep its agreed price (BR8).
 */
export const publishVersion = (offeringId: string, terms: OfferingTerms) =>
  apiFetch<Offering>(`/api/v1/providers/me/offerings/${offeringId}/versions`, {
    method: "POST",
    body: JSON.stringify(terms),
  });

/** Coverage is not versioned — where you deliver is not a change of terms. */
export const setAreas = (offeringId: string, areaIds: string[]) =>
  apiFetch<Offering>(`/api/v1/providers/me/offerings/${offeringId}/areas`, {
    method: "PUT",
    body: JSON.stringify({ areaIds }),
  });

export const offeringHistory = (offeringId: string) =>
  apiFetch<OfferingHistory>(`/api/v1/providers/me/offerings/${offeringId}/history`);

export const withdrawOffering = (offeringId: string) =>
  apiFetch<Offering>(`/api/v1/providers/me/offerings/${offeringId}`, { method: "DELETE" });
