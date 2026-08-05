import type { CurrentAccount, Notification } from "@/core/api/types";

/**
 * Where a notification takes you.
 *
 * The same event reaches two different people through two different screens: a
 * declined booking is `/bookings/:id` for the customer who must pick someone
 * else, and nothing a provider can act on at all. Linking everyone to the
 * customer route — which is what this used to do — sent providers to an
 * endpoint their role cannot call, and the product answered with a raw 403.
 *
 * Keyed on the VIEWER, not on the event. The notification does not know who is
 * reading it; the account does.
 */
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

/**
 * Grouping by day rather than showing a timestamp on every row. "Today" and
 * "Yesterday" are how people actually locate a notification; 14:32 is not.
 */
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
