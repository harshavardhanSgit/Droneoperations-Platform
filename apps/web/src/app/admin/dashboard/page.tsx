"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { FormError } from "@/components/ui/form";
import { Page, PageHeader, Surface } from "@/components/ui/surface";
import { ApiError, apiFetch } from "@/core/api/client";
import type { Dashboard } from "@/core/api/types";
import { RequireAuth, RequireRole } from "@/core/auth/require-auth";

/**
 * Not four equal cards.
 *
 * An operator opens this asking one question — "is anything stuck?" — so the
 * things that need a human come first, as links to the screen where the work
 * happens. Everything else is background. A grid of identically-weighted tiles
 * would give a number that needs action and a number that does not exactly the
 * same visual claim.
 */
function AdminDashboard() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    apiFetch<Dashboard>("/api/v1/admin/dashboard")
      .then((d) => {
        if (cancelled) return;
        setData(d);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setError(caught instanceof ApiError ? caught.message : "Could not load the dashboard");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const queue = !data
    ? []
    : [
        {
          count: data.providersAwaitingReview,
          label: "provider application",
          verb: "waiting for review",
          href: "/admin/providers",
        },
        {
          count: data.bookingsUnassigned,
          label: "job",
          verb: "with no provider",
          href: "/admin/bookings",
        },
        {
          count: data.ticketsUnassigned,
          label: "grounded drone",
          verb: "waiting for an engineer",
          href: "/admin/tickets",
        },
      ].filter((item) => item.count > 0);

  return (
    <Page size="console">
      <PageHeader title="Operations" description="What needs you, and what is running." />

      <FormError message={error} />

      {loading ? (
        <p className="text-sm text-fg-subtle">Loading…</p>
      ) : !data ? null : (
        <div className="space-y-8">
          <section>
            <h2 className="mb-3 text-sm font-medium text-fg-muted">Needs you</h2>

            {queue.length === 0 ? (
              <Surface className="px-5 py-8 text-center">
                <p className="font-medium">Nothing is stuck</p>
                <p className="mt-1 text-sm text-fg-muted">
                  Every application is reviewed, every job has a provider, and no drone is waiting
                  on an engineer.
                </p>
              </Surface>
            ) : (
              <ul className="grid gap-3 md:grid-cols-3">
                {queue.map((item) => (
                  <li key={item.href}>
                    <Link href={item.href} className="block">
                      <Surface className="p-5 transition-colors hover:bg-neutral-bg">
                        <p className="tabular text-3xl font-semibold tracking-tight text-warning">
                          {item.count}
                        </p>
                        <p className="mt-1 text-sm">
                          {item.label}
                          {item.count === 1 ? "" : "s"} {item.verb}
                        </p>
                      </Surface>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="mb-3 text-sm font-medium text-fg-muted">Running</h2>
            <Surface className="divide-y divide-border">
              {[
                { label: "Providers able to take work", value: data.providersActive },
                { label: "Jobs agreed, not yet delivered", value: data.bookingsInFlight },
                { label: "Delivered, waiting on the customer", value: data.bookingsAwaitingSignOff },
                { label: "Repairs under way", value: data.ticketsInProgress },
              ].map((row) => (
                <div key={row.label} className="flex items-baseline justify-between px-5 py-3">
                  <span className="text-sm text-fg-muted">{row.label}</span>
                  <span className="tabular font-medium">{row.value}</span>
                </div>
              ))}
            </Surface>
          </section>

          <p className="text-xs text-fg-subtle">
            Counts, not analytics. Charts and trends are deliberately out of scope — a number
            answers the question an operator actually opens this screen with.
          </p>
        </div>
      )}
    </Page>
  );
}

export default function AdminDashboardPage() {
  return (
    <RequireAuth>
      <RequireRole kind="PLATFORM" role="ADMIN">
        <AdminDashboard />
      </RequireRole>
    </RequireAuth>
  );
}
