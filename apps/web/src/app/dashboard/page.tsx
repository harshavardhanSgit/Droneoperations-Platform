"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { linksFor } from "@/components/app-shell";
import { useAuth } from "@/core/auth/auth-context";
import { RequireAuth } from "@/core/auth/require-auth";

/** Kept as a redirect, not deleted. */
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
