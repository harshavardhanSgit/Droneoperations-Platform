import { ApiError, apiFetch } from "@/core/api/client";
import type { TicketDetail, TicketList, UploadTicket } from "@/core/api/types";

export const listMyTickets = () => apiFetch<TicketList>("/api/v1/engineer/tickets");

export const startTicket = (id: string) =>
  apiFetch<TicketDetail>(`/api/v1/engineer/tickets/${id}/start`, { method: "POST" });

/**
 * BR11 — a ticket cannot be closed without a report, so the upload has to
 * succeed before close is even offered. Same three-step flow as provider
 * documents; the difference is that this document is owned by the TICKET.
 *
 * Step 2 uses raw fetch: those bytes go to storage, not to our API. The signed
 * URL is the entire authorisation.
 */
export async function uploadReport(ticketId: string, file: File): Promise<string> {
  const ticket = await apiFetch<UploadTicket>(
    `/api/v1/engineer/tickets/${ticketId}/report-upload`,
    {
      method: "POST",
      body: JSON.stringify({ filename: file.name, contentType: file.type }),
    },
  );

  if (file.size > ticket.maxBytes) {
    throw new ApiError(
      "FILE_TOO_LARGE",
      `File is ${(file.size / 1024 / 1024).toFixed(1)} MB. Maximum is ${(
        ticket.maxBytes /
        1024 /
        1024
      ).toFixed(0)} MB.`,
      0,
    );
  }

  const upload = await fetch(ticket.uploadUrl, {
    method: "PUT",
    body: file,
    headers: { "content-type": file.type },
  });

  if (!upload.ok) {
    throw new ApiError("UPLOAD_FAILED", "The report could not be uploaded", upload.status);
  }

  await apiFetch(
    `/api/v1/engineer/tickets/${ticketId}/report-upload/${ticket.documentId}/confirm`,
    { method: "POST", body: JSON.stringify({ sizeBytes: file.size }) },
  );

  return ticket.documentId;
}

export const closeTicket = (id: string, resolutionNote: string, reportDocumentId: string) =>
  apiFetch<TicketDetail>(`/api/v1/engineer/tickets/${id}/close`, {
    method: "POST",
    body: JSON.stringify({ resolutionNote, reportDocumentId }),
  });
