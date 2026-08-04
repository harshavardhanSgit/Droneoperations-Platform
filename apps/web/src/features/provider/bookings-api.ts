import { apiFetch } from "@/core/api/client";
import type { BookingDetail, BookingList } from "@/core/api/types";

/**
 * The provider's side of the booking aggregate.
 *
 * Deliberately separate from features/bookings/api.ts even though both talk
 * about bookings: these routes live under /providers/me and are gated by
 * different permissions. Keeping them apart means a customer screen can never
 * accidentally call an endpoint only a provider is allowed to reach.
 */

/** assignmentStatus=PENDING is the request inbox — work awaiting an answer. */
export const listAssignedBookings = (assignmentStatus?: "PENDING" | "ACCEPTED" | "REJECTED") =>
  apiFetch<BookingList>(
    `/api/v1/providers/me/bookings${assignmentStatus ? `?assignmentStatus=${assignmentStatus}` : ""}`,
  );

export const acceptBooking = (id: string) =>
  apiFetch<BookingDetail>(`/api/v1/providers/me/bookings/${id}/accept`, { method: "POST" });

export const rejectBooking = (id: string, reason: string) =>
  apiFetch<BookingDetail>(`/api/v1/providers/me/bookings/${id}/reject`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });

/**
 * finalQuantity is what was actually delivered, not what was booked. The
 * difference is the whole point of BR14 — 20 acres booked and 18 sprayed bills
 * 18 — so the form must ask, never assume.
 */
export const completeBooking = (id: string, finalQuantity: number, note?: string) =>
  apiFetch<BookingDetail>(`/api/v1/providers/me/bookings/${id}/complete`, {
    method: "POST",
    body: JSON.stringify({ finalQuantity, ...(note ? { note } : {}) }),
  });
