import { apiFetch } from "@/core/api/client";
import type { CustomerProfile } from "@/core/api/types";

/**
 * The customer's saved default field.
 *
 * Returns an empty object when nothing is saved — "not set yet" is a normal
 * state, so callers check for the fields rather than catching a 404.
 */
export const getOwnCustomerProfile = () =>
  apiFetch<CustomerProfile>("/api/v1/customers/me");

/**
 * Omitting a key leaves it alone; sending null clears it. That distinction is
 * why the input type allows null rather than just undefined.
 */
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
