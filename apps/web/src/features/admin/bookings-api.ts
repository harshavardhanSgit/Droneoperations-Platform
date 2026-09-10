import { apiFetch } from "@/core/api/client";
import type { BookingDetail, BookingList } from "@/core/api/types";

/** Unscoped — every booking on the platform. Requires booking:read-any. */
export const listAllBookings = (status?: string, page = 1) => {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  params.set("page", String(page));
  return apiFetch<BookingList>(`/api/v1/admin/bookings?${params}`);
};

export const getBookingAsAdmin = (id: string) =>
  apiFetch<BookingDetail>(`/api/v1/admin/bookings/${id}`);

/** Places a stuck job with a provider directly. */
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
