"use client";

import { useAuth } from "@/core/auth/auth-context";
import { RequireAuth } from "@/core/auth/require-auth";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-6 border-b border-black/5 py-2.5 text-sm last:border-0 dark:border-white/10">
      <span className="text-black/50 dark:text-white/50">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

function DashboardContent() {
  const { account } = useAuth();

  if (!account) return null;

  return (
    <main className="mx-auto w-full max-w-lg px-6 py-16">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            {account.organisation.name}
          </h1>
          <p className="mt-1 text-sm text-black/50 dark:text-white/50">
            Signed in as {account.fullName}
          </p>
        </div>
      </header>

      <section className="rounded-lg border border-black/10 p-5 dark:border-white/15">
        <h2 className="mb-3 text-sm font-medium">Account</h2>
        <Row label="Email" value={account.email} />
        {account.phone ? <Row label="Phone" value={account.phone} /> : null}
        <Row label="Organisation type" value={account.organisation.type} />
        <Row label="Marketplace side" value={account.organisation.kind} />
        <Row label="Role" value={account.role} />
      </section>




      <p className="mt-6 text-xs text-black/40 dark:text-white/40">
        This data came from <code className="font-mono">GET /api/v1/auth/me</code>, which
        requires a valid access token. Reload the page — the access token is lost, and the
        session is restored from the refresh cookie.
      </p>
    </main>
  );
}

export default function DashboardPage() {
  return (
    <RequireAuth>
      <DashboardContent />
    </RequireAuth>
  );
}
