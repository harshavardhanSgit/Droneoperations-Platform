/**
 * Inline SVG, keyed by route.
 *
 * No icon library: the web app's dependencies are deliberately next + react and
 * little else, and a nav needs sixteen glyphs — not a package. These are stroke
 * icons on a 24-unit grid using currentColor, so they inherit the link's colour
 * and the token layer keeps working without a per-icon dark variant.
 */
const PATHS: Record<string, string> = {
  // Customer
  "/bookings": "M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01",
  "/search": "M11 18a7 7 0 100-14 7 7 0 000 14zM20 20l-4.2-4.2",

  // Provider
  "/provider/requests": "M4 13h4l2 3h4l2-3h4M4 13V7a2 2 0 012-2h12a2 2 0 012 2v6l-1 6H5l-1-6z",
  "/provider/jobs": "M9 5h6v3H9zM4 8h16v11a1 1 0 01-1 1H5a1 1 0 01-1-1zM4 13h16",
  "/provider/services": "M4 4h7l9 9-7 7-9-9zM8.5 8.5h.01",
  "/provider/drones": "M7 7h10v10H7zM7 7L3 3M17 7l4-4M7 17l-4 4M17 17l4 4M4 4h.01M20 4h.01M4 20h.01M20 20h.01",
  "/provider/earnings": "M4 6h16v12H4zM12 9a3 3 0 100 6 3 3 0 000-6M7 9h.01M17 15h.01",
  "/provider/onboarding": "M4 21h16M6 21V8l6-4 6 4v13M10 12h.01M14 12h.01M10 16h.01M14 16h.01",

  // Platform
  "/admin/dashboard": "M3 13h4l3 7 4-16 3 9h4",
  "/admin/bookings": "M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01",
  "/admin/providers": "M9 11a4 4 0 100-8 4 4 0 000 8zM2 21v-1a6 6 0 0112 0v1M17 11a3 3 0 100-6M18 21v-1a5 5 0 00-2-4",
  "/admin/tickets": "M15 6a4 4 0 00-5.5 5.2L4 17v3h3l5.8-5.5A4 4 0 0018 9",
  "/admin/catalogue": "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  "/engineer/tickets": "M15 6a4 4 0 00-5.5 5.2L4 17v3h3l5.8-5.5A4 4 0 0018 9",

  // Shared
  "/notifications": "M18 9a6 6 0 10-12 0c0 6-2 6-2 8h16c0-2-2-2-2-8M10.5 20a2 2 0 003 0",
  "/dashboard": "M12 12a4 4 0 100-8 4 4 0 000 8zM4 21v-1a8 8 0 0116 0v1",
};

const FALLBACK = "M12 20a8 8 0 100-16 8 8 0 000 16z";

export function NavIcon({ href, className = "" }: { href: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={`size-4 shrink-0 ${className}`}
    >
      <path d={PATHS[href] ?? FALLBACK} />
    </svg>
  );
}

export function MenuIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden
      className="size-5"
    >
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

export function CloseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden
      className="size-5"
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function SignOutIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="size-4"
    >
      <path d="M14 20H6a2 2 0 01-2-2V6a2 2 0 012-2h8M17 15l4-3-4-3M21 12H10" />
    </svg>
  );
}

/** Points the way the sidebar will move, not the way the chevron sits. */
export function CollapseIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="size-4"
    >
      <path d={collapsed ? "M9 6l6 6-6 6" : "M15 6l-6 6 6 6"} />
    </svg>
  );
}
