import { apiFetch } from "@/core/api/client";
import type { StaffList, TicketDetail, TicketList } from "@/core/api/types";

/** status=OPEN is the dispatch queue — tickets nobody is working on yet. */
export const listTickets = (status?: string) =>
  apiFetch<TicketList>(`/api/v1/admin/tickets${status ? `?status=${status}` : ""}`);

export const listEngineers = () => apiFetch<StaffList>("/api/v1/admin/engineers");

export const assignEngineer = (ticketId: string, engineerUserId: string) =>
  apiFetch<TicketDetail>(`/api/v1/admin/tickets/${ticketId}/assign`, {
    method: "POST",
    body: JSON.stringify({ engineerUserId }),
  });
