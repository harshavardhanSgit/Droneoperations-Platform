import { apiFetch } from "@/core/api/client";
import type { BookingDetail, BookingList } from "@/core/api/types";

/** The provider's side of the booking aggregate. */

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

/** finalQuantity is what was actually delivered, not what was booked. */
export const completeBooking = (id: string, finalQuantity: number, note?: string) =>
  apiFetch<BookingDetail>(`/api/v1/providers/me/bookings/${id}/complete`, {
    method: "POST",
    body: JSON.stringify({ finalQuantity, ...(note ? { note } : {}) }),
  });
