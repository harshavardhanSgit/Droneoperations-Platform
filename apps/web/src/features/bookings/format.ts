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

/** Meaning, not appearance. */
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
 * Dates are local calendar days, never instants — a spraying slot is "the 4th, at dawn", not a
 * UTC timestamp.
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

/**
 * OpenStreetMap's share link for a picked point — no API key, works everywhere, and opens the
 * field's exact spot for the provider to navigate to.
 */
export const mapLink = (latitude: number, longitude: number) =>
  `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=17/${latitude}/${longitude}`;

/** A distance as a person would say it. */
export const distanceLabel = (km: number): string =>
  km < 1 ? "under 1 km" : `${Math.round(km)} km`;

