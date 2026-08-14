import type { CurrentAccount, Notification } from "@/core/api/types";

/** Where a notification takes you. */
export function destinationFor(
  notification: Notification,
  account: CurrentAccount | null,
): string {
  const kind = account?.organisation.kind;

  if (kind === "PROVIDER") {
    switch (notification.type) {
      case "PROVIDER_ACTIVATED":
      case "PROVIDER_REJECTED":
        return "/provider/onboarding";
      case "PAYMENT_RECORDED":
        return "/provider/earnings";
      // A new request is unanswered by definition, so it belongs in the inbox.
      case "BOOKING_ASSIGNED":
        return "/provider/requests";
      default:
        return "/provider/jobs";
    }
  }

  if (kind === "PLATFORM") {
    return account?.role === "SERVICE_ENGINEER" ? "/engineer/tickets" : "/admin/bookings";
  }

  // Customer: the booking itself, which is the only screen where they can act.
  return notification.bookingId ? `/bookings/${notification.bookingId}` : "/bookings";
}

/** Grouping by day rather than showing a timestamp on every row. */
export function dayLabel(iso: string): string {
  const then = new Date(iso);
  const now = new Date();
  const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((midnight(now) - midnight(then)) / 86_400_000);

  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;

  return then.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
}

/** Relative time within a day, so a row still says when without a full date. */
export function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}
