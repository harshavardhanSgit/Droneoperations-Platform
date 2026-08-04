"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { useAuth } from "@/core/auth/auth-context";
import { NotificationBell } from "./notification-bell";

/**
 * Navigation is derived from the organisation KIND, mirroring how the backend
 * derives permissions. A single nav with hidden items is where permission bugs
 * live — a link a role cannot use should not exist for them at all.
 *
 * This is presentation only. Hiding a link protects nobody: the API's guard is
 * the boundary.
 */
const NAV: Record<string, { href: string; label: string }[]> = {
  CUSTOMER: [
    { href: "/bookings", label: "My bookings" },
    { href: "/search", label: "Book a service" },
  ],
  PROVIDER: [
    { href: "/provider/requests", label: "Requests" },
    { href: "/provider/jobs", label: "My jobs" },
    { href: "/provider/drones", label: "Drones" },
    { href: "/provider/earnings", label: "Earnings" },
    { href: "/provider/onboarding", label: "My business" },
    { href: "/dashboard", label: "Account" },
  ],
  PLATFORM: [
    { href: "/admin/providers", label: "Providers" },
    { href: "/admin/tickets", label: "Maintenance" },
    { href: "/dashboard", label: "Account" },
  ],
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const { status, account, signOut } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  // Public pages render bare — a sign-in screen with a nav bar advertising
  // links you cannot follow is worse than no nav bar.
  if (status !== "authenticated" || !account) {
    return <>{children}</>;
  }

  const links = NAV[account.organisation.kind] ?? [];

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
