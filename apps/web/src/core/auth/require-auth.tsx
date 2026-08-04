"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { useAuth } from "./auth-context";

/**
 * UX only — NOT a security boundary.
 *
 * This stops a signed-out user staring at an empty page. It cannot stop anyone
 * reading data: the browser bundle is public and the API is reachable directly.
 * Authorisation is enforced by the API's global JwtAuthGuard, and this
 * component just mirrors that decision for the user's benefit.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "anonymous") {
      router.replace("/login");
    }
  }, [status, router]);

  if (status !== "authenticated") {
    return (
      <div className="px-6 py-20 text-sm text-fg-muted">
        {status === "loading" ? "Restoring session…" : "Redirecting to sign in…"}
      </div>
    );
  }

  return <>{children}</>;
}
