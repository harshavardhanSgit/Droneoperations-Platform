import { apiFetch } from "@/core/api/client";
import type { CustomerProfile } from "@/core/api/types";

/** The customer's saved default field. */
export const getOwnCustomerProfile = () =>
  apiFetch<CustomerProfile>("/api/v1/customers/me");

/** Omitting a key leaves it alone; sending null clears it. */
export const saveOwnCustomerProfile = (input: {
  latitude?: number | null;
  longitude?: number | null;
  locationLabel?: string | null;
  defaultAreaId?: string | null;
}) =>
  apiFetch<CustomerProfile>("/api/v1/customers/me", {
    method: "PUT",
    body: JSON.stringify(input),
  });
