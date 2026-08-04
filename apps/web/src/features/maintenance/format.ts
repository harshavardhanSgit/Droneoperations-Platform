import type { Tone } from "@/components/ui/tone";

/**
 * One vocabulary for the maintenance lifecycle, shared by the provider, admin
 * and engineer screens. Three surfaces describing the same ticket with three
 * different words is how a product starts feeling like three products.
 */
export const TICKET_LABEL: Record<string, string> = {
  OPEN: "Waiting for an engineer",
  ASSIGNED: "Engineer assigned",
  IN_PROGRESS: "Being worked on",
  CLOSED: "Fixed",
  CANCELLED: "Cancelled",
};

export const TICKET_TONE: Record<string, Tone> = {
  OPEN: "warning",
  ASSIGNED: "info",
  IN_PROGRESS: "info",
  CLOSED: "success",
  CANCELLED: "neutral",
};

export const DRONE_LABEL: Record<string, string> = {
  SERVICEABLE: "Ready to fly",
  UNDER_MAINTENANCE: "Grounded",
  RETIRED: "Retired",
};

export const DRONE_TONE: Record<string, Tone> = {
  SERVICEABLE: "success",
  UNDER_MAINTENANCE: "warning",
  RETIRED: "neutral",
};

/** Timestamps here are instants, not calendar days — safe to parse directly. */
export const whenShort = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
