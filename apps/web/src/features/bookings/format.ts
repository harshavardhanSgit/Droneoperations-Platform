import type { Tone } from "@/components/ui/tone";

/** Money arrives as integer minor units. Format at the edge, never compute with floats. */
export const rupees = (minor?: number | null) =>
  minor === undefined || minor === null
    ? "—"
    : `₹${(minor / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export const STATUS_LABEL: Record<string, string> = {
  UNASSIGNED: "Needs a provider",
  ASSIGNED: "Awaiting provider",
  SCHEDULED: "Scheduled",
  AWAITING_CONFIRMATION: "Confirm the work",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

/**
 * Meaning, not appearance. Warning means "you are waiting on somebody"; info
 * means "in motion"; success means "done". If the palette changes, this file
 * does not.
 */
export const STATUS_TONE: Record<string, Tone> = {
  UNASSIGNED: "warning",
  ASSIGNED: "info",
  SCHEDULED: "info",
  AWAITING_CONFIRMATION: "warning",
  COMPLETED: "success",
  CANCELLED: "neutral",
};

export const WINDOWS = ["DAWN", "MORNING", "AFTERNOON", "EVENING"];

/**
 * Dates are local calendar days, never instants — a spraying slot is "the 4th,
 * at dawn", not a UTC timestamp. Splitting on "-" avoids Date's timezone
 * parsing, which would render 2026-10-04 as the 3rd for anyone west of UTC.
 */
export const shortDate = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
};

export const windowLabel = (w: string) => w.charAt(0) + w.slice(1).toLowerCase();

