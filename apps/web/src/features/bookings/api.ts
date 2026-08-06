import { apiFetch } from "@/core/api/client";
import type { BookingDetail, BookingList, Payment, Review } from "@/core/api/types";

export interface CreateBookingInput {
  serviceTypeId: string;
  areaId: string;
  quantity: number;
  preferredDate: string;
  preferredWindow: string;
  locationNote?: string;
  latitude?: number;
  longitude?: number;
  offeringId?: string;
}

export const createBooking = (input: CreateBookingInput) =>
  apiFetch<BookingDetail>("/api/v1/bookings", { method: "POST", body: JSON.stringify(input) });

export const listBookings = (status?: string) =>
  apiFetch<BookingList>(`/api/v1/bookings${status ? `?status=${status}` : ""}`);

export const getBooking = (id: string) => apiFetch<BookingDetail>(`/api/v1/bookings/${id}`);

export const assignProvider = (id: string, offeringId: string) =>
  apiFetch<BookingDetail>(`/api/v1/bookings/${id}/assignments`, {
    method: "POST",
    body: JSON.stringify({ offeringId }),
  });

export const proposeSchedule = (id: string, date: string, window: string) =>
  apiFetch<BookingDetail>(`/api/v1/bookings/${id}/schedule/propose`, {
    method: "POST",
    body: JSON.stringify({ date, window }),
  });

export const confirmSchedule = (id: string) =>
  apiFetch<BookingDetail>(`/api/v1/bookings/${id}/schedule/confirm`, { method: "POST" });

export const confirmCompletion = (id: string) =>
  apiFetch<BookingDetail>(`/api/v1/bookings/${id}/confirm-completion`, { method: "POST" });

export const cancelBooking = (id: string, reason: string) =>
  apiFetch<BookingDetail>(`/api/v1/bookings/${id}/cancel`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });

export const getPayment = (id: string) => apiFetch<Payment | null>(`/api/v1/bookings/${id}/payment`);

export const recordPayment = (
  id: string,
  input: { method: string; paidOn: string; reference?: string },
) =>
  apiFetch<Payment>(`/api/v1/bookings/${id}/payment`, {
    method: "POST",
    body: JSON.stringify(input),
  });

export const getReview = (id: string) =>
  apiFetch<Review | null>(`/api/v1/bookings/${id}/review`);

export const createReview = (id: string, rating: number, comment?: string) =>
  apiFetch<Review>(`/api/v1/bookings/${id}/review`, {
    method: "POST",
    body: JSON.stringify({ rating, ...(comment ? { comment } : {}) }),
  });
