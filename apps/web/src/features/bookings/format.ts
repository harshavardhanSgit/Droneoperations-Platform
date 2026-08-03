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

export const STATUS_TONE: Record<string, string> = {
  UNASSIGNED: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  ASSIGNED: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  SCHEDULED: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  AWAITING_CONFIRMATION: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  COMPLETED: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  CANCELLED: "bg-black/10 text-black/50 dark:bg-white/10 dark:text-white/50",
};

export const WINDOWS = ["DAWN", "MORNING", "AFTERNOON", "EVENING"];
