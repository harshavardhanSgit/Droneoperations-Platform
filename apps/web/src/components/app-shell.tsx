"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { useAuth } from "@/core/auth/auth-context";
import { NotificationBell } from "./notification-bell";

type Link = { href: string; label: string };

/**
 * Keyed by organisation KIND and then ROLE — the same two coordinates the
 * backend's permission map uses. Kind alone is not enough: an Admin and a
 * Service Engineer are both PLATFORM, and showing an engineer the provider
 * approval queue would advertise a page the API will refuse.
 *
 * A single nav with hidden items is where permission bugs live; a link a role
 * cannot use should not exist for them at all. This is still presentation only
 * — hiding a link protects nobody, the API's guard is the boundary.
 */
const ACCOUNT: Link = { href: "/dashboard", label: "Account" };

const NAV: Record<string, Record<string, Link[]>> = {
  CUSTOMER: {
    "*": [
      { href: "/bookings", label: "My bookings" },
      { href: "/search", label: "Book a service" },
      ACCOUNT,
    ],
  },
  PROVIDER: {
    "*": [
      { href: "/provider/requests", label: "Requests" },
      { href: "/provider/jobs", label: "My jobs" },
      { href: "/provider/drones", label: "Drones" },
      { href: "/provider/earnings", label: "Earnings" },
      { href: "/provider/onboarding", label: "My business" },
      ACCOUNT,
    ],
  },
  PLATFORM: {
    ADMIN: [
      { href: "/admin/providers", label: "Providers" },
      { href: "/admin/tickets", label: "Maintenance" },
      ACCOUNT,
    ],
    SERVICE_ENGINEER: [{ href: "/engineer/tickets", label: "My tickets" }, ACCOUNT],
  },
};

function linksFor(kind: string, role: string): Link[] {
  const byRole = NAV[kind];
  if (!byRole) return [];
  return byRole[role] ?? byRole["*"] ?? [];
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { status, account, signOut } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  // Public pages render bare — a sign-in screen with a nav bar advertising
  // links you cannot follow is worse than no nav bar.
  if (status !== "authenticated" || !account) {
    return <>{children}</>;
  }

  const links = linksFor(account.organisation.kind, account.role);

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border bg-bg/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-4 px-5 py-3 sm:px-6">
          <Link href={links[0]?.href ?? "/dashboard"} className="shrink-0 text-sm font-semibold tracking-tight">
            Drone Ops
          </Link>

          <nav className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
            {links.map((link) => {
              const active = pathname === link.href || pathname.startsWith(`${link.href}/`);

              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`shrink-0 rounded-control px-2.5 py-1.5 text-sm ${
                    active
                      ? "bg-neutral-bg font-medium"
                      : "text-fg-muted hover:bg-neutral-bg hover:text-fg"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex shrink-0 items-center gap-1">
            <NotificationBell />
            <button
              onClick={async () => {
                await signOut();
                router.push("/login");
              }}
              className="rounded-control px-2.5 py-1.5 text-sm text-fg-muted hover:bg-neutral-bg hover:text-fg"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {children}
    </>
  );
}
