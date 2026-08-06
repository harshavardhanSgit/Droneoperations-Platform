"use client";

import NextLink from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { useAuth } from "@/core/auth/auth-context";
import * as notificationApi from "@/features/notifications/api";
import { CloseIcon, CollapseIcon, MenuIcon, NavIcon, SignOutIcon } from "./icons";
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
const NOTIFICATIONS: Link = { href: "/notifications", label: "Notifications" };
const ACCOUNT: Link = { href: "/dashboard", label: "Account" };
const COVERAGE: Link = { href: "/coverage", label: "Coverage" };

const NAV: Record<string, Record<string, Link[]>> = {
  CUSTOMER: {
    "*": [
      { href: "/bookings", label: "My bookings" },
      { href: "/search", label: "Book a service" },
      NOTIFICATIONS,
      ACCOUNT,
    ],
  },
  PROVIDER: {
    "*": [
      { href: "/provider/requests", label: "Requests" },
      { href: "/provider/jobs", label: "My jobs" },
      { href: "/provider/services", label: "My services" },
      { href: "/provider/drones", label: "Drones" },
      { href: "/provider/earnings", label: "Earnings" },
      { href: "/provider/onboarding", label: "My business" },
      NOTIFICATIONS,
      ACCOUNT,
    ],
  },
  PLATFORM: {
    ADMIN: [
      { href: "/admin/dashboard", label: "Operations" },
      { href: "/admin/bookings", label: "Bookings" },
      { href: "/admin/providers", label: "Providers" },
      { href: "/admin/tickets", label: "Maintenance" },
      { href: "/admin/catalogue", label: "Catalogue" },
      COVERAGE,
      NOTIFICATIONS,
      ACCOUNT,
    ],
    SERVICE_ENGINEER: [{ href: "/engineer/tickets", label: "My tickets" }, NOTIFICATIONS, ACCOUNT],
  },
};

/** Exported so the landing page can send a signed-in visitor to their first
 * screen without duplicating the map. One source of truth for role → links. */
export function linksFor(kind: string, role: string): Link[] {
  const byRole = NAV[kind];
  if (!byRole) return [];
  return byRole[role] ?? byRole["*"] ?? [];
}

/**
 * Which links belong under "Account" rather than "Workspace".
 *
 * Derived from the shared constants rather than re-listing them, so a change to
 * NAV cannot leave the grouping behind. linksFor() itself is untouched — this
 * only decides where its output is drawn.
 */
const ACCOUNT_HREFS = new Set([NOTIFICATIONS.href, ACCOUNT.href]);

const ROLE_LABEL: Record<string, string> = {
  OWNER: "Owner",
  MEMBER: "Member",
  ADMIN: "Platform admin",
  SERVICE_ENGINEER: "Service engineer",
};

function NavLink({
  link,
  active,
  collapsed,
  badge,
  onNavigate,
}: {
  link: Link;
  active: boolean;
  collapsed: boolean;
  badge?: number;
  onNavigate?: () => void;
}) {
  return (
    <NextLink
      href={link.href}
      onClick={onNavigate}
      title={collapsed ? link.label : undefined}
      aria-current={active ? "page" : undefined}
      className={`relative flex items-center gap-2.5 rounded-control py-2 text-sm transition-colors ${
        collapsed ? "justify-center px-0" : "px-2.5"
      } ${active ? "bg-neutral-bg font-medium text-fg" : "text-fg-muted hover:bg-neutral-bg hover:text-fg"}`}
    >
      {/* 2px rail rather than a border, so the row's height and padding do not
          shift between states — a border would move every label by 2px. */}
      {active ? (
        <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-accent" aria-hidden />
      ) : null}

      <NavIcon href={link.href} />

      {collapsed ? null : <span className="min-w-0 flex-1 truncate">{link.label}</span>}

      {badge && badge > 0 ? (
        <span
          className={`tabular flex h-4 min-w-4 items-center justify-center rounded-full bg-info-bg px-1 text-[10px] font-medium text-info ${
            collapsed ? "absolute right-1 top-1" : ""
          }`}
        >
          {badge > 9 ? "9+" : badge}
        </span>
      ) : null}
    </NextLink>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { status, account, signOut } = useAuth();
  const pathname = usePathname();

  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [unread, setUnread] = useState(0);

  /**
   * The count that used to live only inside the bell. On desktop there is no
   * top bar to hang a bell from, so the Notifications row carries it instead.
   * Refetched on focus rather than polled — the endpoint is cheap but not free,
   * and a user looking at another tab does not need a live number.
   */
  const refreshUnread = useCallback(() => {
    if (status !== "authenticated") return;
    void notificationApi.unreadCount().then(setUnread).catch(() => undefined);
  }, [status]);

  useEffect(() => {
    refreshUnread();
    window.addEventListener("focus", refreshUnread);
    return () => window.removeEventListener("focus", refreshUnread);
  }, [refreshUnread]);

  /*
   * The drawer closes where it is dismissed — on the link, the overlay, the
   * close button and Escape — rather than in an effect watching the pathname.
   * Watching the URL would close it as a side effect of navigation instead of
   * as part of the click that caused it, and React rightly objects to setting
   * state synchronously in an effect body.
   */
  useEffect(() => {
    if (!drawer) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrawer(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawer]);

  // Public pages render bare — a sign-in screen with a nav bar advertising
  // links you cannot follow is worse than no nav bar.
  if (status !== "authenticated" || !account) {
    return <>{children}</>;
  }

  const links = linksFor(account.organisation.kind, account.role);
  const workspace = links.filter((link) => !ACCOUNT_HREFS.has(link.href));
  const personal = links.filter((link) => ACCOUNT_HREFS.has(link.href));
  const home = links[0]?.href ?? "/dashboard";

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  const onSignOut = async () => {
    await signOut();

    // A hard navigation, deliberately not router.replace(). The moment status
    // flips to anonymous, RequireAuth (still mounted beneath us for one render)
    // redirects to /login, and the navigation itself re-triggers that effect
    // via a new router identity — so a client-side navigation home races it and
    // loses. location.replace() loads a fresh document, which nothing in this
    // page can supersede. Home, not the login form: a signed-out visitor lands
    // on the landing page and chooses their path. replace() semantics keep the
    // authenticated screen out of the back history.
    window.location.replace("/");
  };

  const sidebar = (inDrawer: boolean) => {
    const narrow = collapsed && !inDrawer;

    return (
      <div className="flex h-full flex-col">
        <div
          className={`flex h-14 shrink-0 items-center border-b border-border ${
            narrow ? "justify-center px-0" : "justify-between px-4"
          }`}
        >
          {narrow ? null : (
            <NextLink href={home} className="text-sm font-semibold tracking-tight">
              Drone Ops
            </NextLink>
          )}

          {inDrawer ? (
            <button
              onClick={() => setDrawer(false)}
              aria-label="Close menu"
              className="rounded-control p-1 text-fg-muted hover:bg-neutral-bg hover:text-fg"
            >
              <CloseIcon />
            </button>
          ) : (
            <button
              onClick={() => setCollapsed((c) => !c)}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              className="rounded-control p-1 text-fg-subtle hover:bg-neutral-bg hover:text-fg"
            >
              <CollapseIcon collapsed={collapsed} />
            </button>
          )}
        </div>

        <nav className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-2 py-4">
          <section className="space-y-0.5">
            {narrow ? null : (
              <h2 className="px-2.5 pb-1 text-[11px] font-medium uppercase tracking-wide text-fg-subtle">
                Workspace
              </h2>
            )}
            {workspace.map((link) => (
              <NavLink
                key={link.href}
                link={link}
                active={isActive(link.href)}
                collapsed={narrow}
                onNavigate={inDrawer ? () => setDrawer(false) : undefined}
              />
            ))}
          </section>

          <section className="space-y-0.5">
            {narrow ? null : (
              <h2 className="px-2.5 pb-1 text-[11px] font-medium uppercase tracking-wide text-fg-subtle">
                Account
              </h2>
            )}
            {personal.map((link) => (
              <NavLink
                key={link.href}
                link={link}
                active={isActive(link.href)}
                collapsed={narrow}
                {...(link.href === NOTIFICATIONS.href ? { badge: unread } : {})}
                onNavigate={inDrawer ? () => setDrawer(false) : undefined}
              />
            ))}
          </section>
        </nav>

        <div className={`shrink-0 border-t border-border py-3 ${narrow ? "px-2" : "px-4"}`}>
          {narrow ? null : (
            <div className="mb-2 min-w-0">
              <p className="truncate text-sm font-medium">{account.organisation.name}</p>
              <p className="truncate text-xs text-fg-subtle">
                {ROLE_LABEL[account.role] ?? account.role} · {account.email}
              </p>
            </div>
          )}

          <button
            onClick={() => void onSignOut()}
            title={narrow ? "Sign out" : undefined}
            className={`flex w-full items-center gap-2.5 rounded-control py-1.5 text-sm text-fg-muted hover:bg-neutral-bg hover:text-fg ${
              narrow ? "justify-center px-0" : "px-2.5"
            }`}
          >
            <SignOutIcon />
            {narrow ? null : "Sign out"}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="flex min-h-dvh">
      <aside
        className={`hidden shrink-0 border-r border-border md:sticky md:top-0 md:block md:h-dvh ${
          collapsed ? "md:w-16" : "md:w-60"
        }`}
      >
        {sidebar(false)}
      </aside>

      {drawer ? (
        <>
          <div
            onClick={() => setDrawer(false)}
            className="fixed inset-0 z-40 bg-black/40 md:hidden"
            aria-hidden
          />
          <aside className="fixed inset-y-0 left-0 z-50 w-64 border-r border-border bg-bg md:hidden">
            {sidebar(true)}
          </aside>
        </>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-bg/85 px-4 backdrop-blur md:hidden">
          <button
            onClick={() => setDrawer(true)}
            aria-label="Open menu"
            className="rounded-control p-1 text-fg-muted hover:bg-neutral-bg hover:text-fg"
          >
            <MenuIcon />
          </button>

          <NextLink href={home} className="flex-1 text-sm font-semibold tracking-tight">
            Drone Ops
          </NextLink>

          {/* The bell keeps its right-anchored dropdown, which only works with a
              top bar. On desktop the Notifications row carries the count. */}
          <NotificationBell />
        </header>

        {children}
      </div>
    </div>
  );
}
