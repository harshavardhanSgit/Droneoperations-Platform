"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { useAuth } from "./auth-context";

/** UX only — NOT a security boundary. */
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

/** Also UX only — the API's PermissionsGuard is still the boundary. */
export function RequireRole({
  kind,
  role,
  children,
}: {
  kind: string;
  role?: string;
  children: ReactNode;
}) {
  const { account } = useAuth();

  if (!account) return null;

  const allowed =
    account.organisation.kind === kind && (role === undefined || account.role === role);

  if (!allowed) {
    return (
      <div className="mx-auto w-full max-w-md px-5 py-20">
        <p className="font-medium">Not your screen</p>
        <p className="mt-1 text-sm text-fg-muted">
          This is for {role ? role.toLowerCase().replace(/_/g, " ") : kind.toLowerCase()} accounts.
          You are signed in as {account.email}.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
