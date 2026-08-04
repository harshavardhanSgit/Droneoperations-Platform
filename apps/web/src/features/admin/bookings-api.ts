import { apiFetch } from "@/core/api/client";
import type { BookingDetail, BookingList } from "@/core/api/types";

/** Unscoped — every booking on the platform. Requires booking:read-any. */
export const listAllBookings = (status?: string) =>
  apiFetch<BookingList>(`/api/v1/admin/bookings${status ? `?status=${status}` : ""}`);

export const getBookingAsAdmin = (id: string) =>
  apiFetch<BookingDetail>(`/api/v1/admin/bookings/${id}`);

/**
 * Places a stuck job with a provider directly. The API records this as a
 * PLATFORM_MANAGED assignment — same table and lifecycle as a customer
 * choosing, differing only in how the provider was picked.
 */
export const reassign = (id: string, offeringId: string) =>
  apiFetch<BookingDetail>(`/api/v1/admin/bookings/${id}/reassign`, {
    method: "POST",
    body: JSON.stringify({ offeringId }),
  });

export const forceCancel = (id: string, reason: string) =>
  apiFetch<BookingDetail>(`/api/v1/admin/bookings/${id}/force-cancel`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
