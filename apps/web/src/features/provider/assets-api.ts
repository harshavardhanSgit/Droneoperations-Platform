import { apiFetch } from "@/core/api/client";
import type { Drone, Ticket, TicketList } from "@/core/api/types";

export const listDrones = () => apiFetch<Drone[]>("/api/v1/providers/me/drones");

export const registerDrone = (input: {
  model: string;
  registrationNumber: string;
  capacityLitres?: number;
}) =>
  apiFetch<Drone>("/api/v1/providers/me/drones", {
    method: "POST",
    body: JSON.stringify(input),
  });

/**
 * Raising a ticket grounds the drone. The provider does not set serviceability
 * themselves — the API refuses that — because a machine with an open fault is
 * unflyable by definition, not by opinion.
 */
export const raiseTicket = (droneId: string, description: string) =>
  apiFetch<Ticket>("/api/v1/providers/me/tickets", {
    method: "POST",
    body: JSON.stringify({ droneId, description }),
  });

export const listOwnTickets = () => apiFetch<TicketList>("/api/v1/providers/me/tickets");
