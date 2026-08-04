"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/form";
import { EmptyState, PageHeader, Surface, Page } from "@/components/ui/surface";
import { ApiError } from "@/core/api/client";
import type { Earnings } from "@/core/api/types";
import { RequireAuth, RequireRole } from "@/core/auth/require-auth";
import { rupees } from "@/features/bookings/format";
import { getEarnings } from "@/features/provider/earnings-api";

/**
 * Deliberately NOT four equal cards.
 *
 * A provider opens this asking one question — "how much am I still owed?" —
 * and four identically-weighted tiles answer it no faster than a table would.
 * Outstanding is set large because it is the question; everything else is the
 * context that makes it trustworthy.
 */
function EarningsView() {
  const [data, setData] = useState<Earnings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void getEarnings()
      .then(setData)
      .catch((caught: unknown) =>
        setError(caught instanceof ApiError ? caught.message : "Could not load your earnings"),
      )
      .finally(() => setLoading(false));
  }, []);

  const awaited = data ? data.completedJobs - data.paidJobs : 0;

  return (
    <Page>
      <PageHeader title="Earnings" description="What you have been paid, and what is still due." />

      <FormError message={error} />

      {loading ? (
        <p className="text-sm text-fg-subtle">Loading…</p>
      ) : !data ? null : data.completedJobs === 0 ? (
        <EmptyState
          title="No completed jobs yet"
          description="Once a customer confirms a job you finished, it shows up here."
          action={
            <Link href="/provider/jobs">
              <Button>See my jobs</Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-4">
          <Surface className="p-6">
            <p className="text-sm text-fg-muted">Still to be paid</p>
            <p
              className={`tabular mt-1 text-4xl font-semibold tracking-tight ${
                data.outstandingMinor > 0 ? "text-warning" : ""
              }`}
            >
              {rupees(data.outstandingMinor)}
            </p>
            <p className="mt-2 text-sm text-fg-muted">
              {awaited === 0
                ? "Every finished job has been settled."
                : `${awaited} ${awaited === 1 ? "job is" : "jobs are"} waiting on payment.`}
            </p>
          </Surface>

          <Surface className="divide-y divide-border">
            <div className="flex items-baseline justify-between px-5 py-4">
              <span className="text-sm text-fg-muted">Received so far</span>
              <span className="tabular font-medium">{rupees(data.receivedMinor)}</span>
            </div>
            <div className="flex items-baseline justify-between px-5 py-4">
              <span className="text-sm text-fg-muted">Jobs completed</span>
              <span className="tabular font-medium">{data.completedJobs}</span>
            </div>
            <div className="flex items-baseline justify-between px-5 py-4">
              <span className="text-sm text-fg-muted">Jobs paid</span>
              <span className="tabular font-medium">{data.paidJobs}</span>
            </div>
          </Surface>

          {/*
            Money moves directly between customer and provider (D6). The platform
            records that it happened and never holds it — saying so plainly here
            is honest, and stops a provider waiting on a payout that will never come.
          */}
          <p className="px-1 text-xs text-fg-subtle">
            Customers pay you directly. This is a record of what was agreed and what has been
            marked as paid — the platform never holds your money.
          </p>
        </div>
      )}
    </Page>
  );
}

export default function ProviderEarningsPage() {
  return (
    <RequireAuth>
      <RequireRole kind="PROVIDER">
        <EarningsView />
      </RequireRole>
    </RequireAuth>
  );
}
