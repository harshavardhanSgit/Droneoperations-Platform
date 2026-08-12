"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { linksFor } from "@/components/app-shell";
import { useAuth } from "@/core/auth/auth-context";
import { RequireAuth } from "@/core/auth/require-auth";

/**
 * Kept as a redirect, not deleted.
 *
 * This used to be the M0 walking-skeleton page — a read-only dump of
 * GET /auth/me with a note explaining how the refresh cookie works. It proved
 * the auth loop when there was nothing else to look at, and then quietly
 * stopped being linked from anywhere once every role got a real first screen.
 *
 * Deleting the route would break two fallbacks that still point here:
 * `landingRouteFor`'s default branch, and app-shell's `home` when a role has
 * no links. Both are unreachable today, but a 404 is a worse failure than a
 * redirect if either ever fires — so this forwards to whatever the signed-in
 * role's first screen actually is.
 */
function DashboardRedirect() {
  const { account } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!account) return;

    const first = linksFor(account.organisation.kind, account.role)[0];
    router.replace(first?.href ?? "/account");
  }, [account, router]);

  return <div className="px-6 py-20 text-sm text-fg-muted">Taking you to your workspace…</div>;
}

export default function DashboardPage() {
  return (
    <RequireAuth>
      <DashboardRedirect />
    </RequireAuth>
  );
}
