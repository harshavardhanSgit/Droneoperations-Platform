"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/form";
import { StatusPill } from "@/components/ui/status-pill";
import { EmptyState, Page, PageHeader } from "@/components/ui/surface";
import { TableSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/core/api/client";
import type { Booking, Match } from "@/core/api/types";
import { RequireAuth, RequireRole } from "@/core/auth/require-auth";
import * as admin from "@/features/admin/bookings-api";
import * as discoveryApi from "@/features/discovery/api";
import { rupees, shortDate, STATUS_LABEL, STATUS_TONE } from "@/features/bookings/format";

const FILTERS = [
  { value: "UNASSIGNED", label: "Needs a provider" },
  { value: "ASSIGNED", label: "Awaiting provider" },
  { value: "SCHEDULED", label: "Scheduled" },
  { value: "AWAITING_CONFIRMATION", label: "Awaiting sign-off" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "", label: "All" },
];

/**
 * The operator's question is "what is stuck?", so UNASSIGNED is the default
 * view rather than everything — a job nobody has taken is the one state that
 * needs a human. Force-cancel is the only write here, and it is deliberately
 * low-emphasis: it is terminal, and terminal actions should not be the easiest
 * thing on the screen.
 */
function AdminBookings() {
  const toast = useToast();
  const [items, setItems] = useState<Booking[]>([]);
  const [status, setStatus] = useState("UNASSIGNED");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const [placing, setPlacing] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Match[] | null>(null);

  const load = (next: string) =>
    admin
      .listAllBookings(next || undefined)
      .then((list) => setItems(list.items))
      .catch((caught: unknown) =>
        setError(caught instanceof ApiError ? caught.message : "Could not load bookings"),
      )
      .finally(() => setLoading(false));

  useEffect(() => {
    let cancelled = false;

    admin
      .listAllBookings("UNASSIGNED")
      .then((list) => {
        if (cancelled) return;
        setItems(list.items);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setError(caught instanceof ApiError ? caught.message : "Could not load bookings");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const choose = (next: string) => {
    setStatus(next);
    setCancelling(null);
    setLoading(true);
    void load(next);
  };

  const cancel = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      await admin.forceCancel(id, reason.trim());
      toast("Booking cancelled", "warning");
      setCancelling(null);
      setReason("");
      await load(status);
    } catch (caught: unknown) {
      setError(caught instanceof ApiError ? caught.message : "Could not cancel that booking");
    } finally {
      setBusy(false);
    }
  };

  // Asks Discovery the same question a customer's search asks — S10 in
  // practice: one matching implementation, two callers. V2's auto-assignment
  // becomes a third caller of this exact query.
  const findProviders = async (b: Booking) => {
    setPlacing(b.id);
    setCandidates(null);
    setError(null);
    try {
      const results = await discoveryApi.findMatches({
        serviceTypeId: b.serviceTypeId,
        areaId: b.areaId,
        quantity: b.quantity,
      });
      setCandidates(results.matches);
    } catch (caught: unknown) {
      setError(caught instanceof ApiError ? caught.message : "Could not look up providers");
      setPlacing(null);
    }
  };

  const place = async (bookingId: string, offeringId: string) => {
    setBusy(true);
    setError(null);
    try {
      await admin.reassign(bookingId, offeringId);
      toast("Placed — the provider has been notified");
      setPlacing(null);
      setCandidates(null);
      await load(status);
    } catch (caught: unknown) {
      setError(caught instanceof ApiError ? caught.message : "Could not place that booking");
    } finally {
      setBusy(false);
    }
  };

  const terminal = (s: string) => s === "COMPLETED" || s === "CANCELLED";

  return (
    <Page size="console">
      <PageHeader
        title="Bookings"
        description="Every job on the platform. Step in when one is stuck."
      />

      <div className="mb-4 flex flex-wrap gap-1">
        {FILTERS.map((f) => (
          <button
            key={f.value || "all"}
            onClick={() => choose(f.value)}
            className={`h-8 rounded-control px-3 text-sm ${
              status === f.value
                ? "bg-accent font-medium text-accent-fg"
                : "text-fg-muted hover:bg-neutral-bg hover:text-fg"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <FormError message={error} />

      {loading ? (
        <TableSkeleton />
      ) : items.length === 0 ? (
        <EmptyState
          title="Nothing here"
          description={
            status === "UNASSIGNED"
              ? "No job is waiting for a provider. That is the good outcome."
              : "No bookings in this state."
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-surface border border-border">
          <table className="w-full min-w-[52rem] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-fg-subtle">
                <th className="px-4 py-2 font-medium">Customer</th>
                <th className="px-4 py-2 font-medium">Service</th>
                <th className="px-4 py-2 font-medium">Provider</th>
                <th className="px-4 py-2 text-right font-medium">Value</th>
                <th className="px-4 py-2 font-medium">Wanted</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((b) => (
                <tr key={b.id} className="align-middle">
                  <td className="px-4 py-2 font-medium">{b.customerName}</td>
                  <td className="px-4 py-2 text-fg-muted">
                    {b.serviceTypeName}
                    <span className="tabular ml-2 text-xs text-fg-subtle">
                      {b.quantity} {b.pricingUnit.replace("PER_", "").toLowerCase()}
                    </span>
                    <span className="ml-2 text-xs text-fg-subtle">{b.areaName}</span>
                  </td>
                  <td className="px-4 py-2 text-fg-muted">
                    {b.activeAssignment?.providerName ?? (
                      <span className="text-fg-subtle">—</span>
                    )}
                  </td>
                  <td className="tabular px-4 py-2 text-right">
                    {rupees(b.finalAmountMinor ?? b.estimatedTotalMinor)}
                  </td>
                  <td className="tabular px-4 py-2 text-fg-muted">
                    {shortDate(b.confirmedDate ?? b.preferredDate)}
                  </td>
                  <td className="px-4 py-2">
                    <StatusPill tone={STATUS_TONE[b.status] ?? "neutral"} size="console">
                      {STATUS_LABEL[b.status] ?? b.status}
                    </StatusPill>
                  </td>
                  <td className="px-4 py-2 text-right">
                    {terminal(b.status) ? null : cancelling === b.id ? (
                      <div className="flex items-center justify-end gap-2">
                        <input
                          autoFocus
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          placeholder="Why?"
                          className="h-8 w-48 rounded-control border border-border-strong bg-bg px-2 text-sm"
                        />
                        <Button size="console" variant="ghost" onClick={() => setCancelling(null)}>
                          Keep
                        </Button>
                        <Button
                          size="console"
                          variant="danger"
                          disabled={reason.trim().length < 3 || busy}
                          onClick={() => void cancel(b.id)}
                        >
                          Cancel it
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-end gap-2">
                        {b.status === "UNASSIGNED" ? (
                          <Button size="console" onClick={() => void findProviders(b)}>
                            Find a provider
                          </Button>
                        ) : null}
                        <Button
                          size="console"
                          variant="ghost"
                          onClick={() => {
                            setCancelling(b.id);
                            setReason("");
                          }}
                        >
                          Force-cancel
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {placing ? (
        <section className="mt-4 rounded-surface border border-border p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-medium">Providers who can take this job</h2>
            <Button size="console" variant="ghost" onClick={() => setPlacing(null)}>
              Close
            </Button>
          </div>

          {candidates === null ? (
            <p className="text-sm text-fg-subtle">Looking…</p>
          ) : candidates.length === 0 ? (
            <p className="text-sm text-fg-muted">
              Nobody covers this area at this quantity. Force-cancelling with an honest reason is
              kinder than leaving it open.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {candidates.map((m) => (
                <li key={m.offeringId} className="flex items-center justify-between gap-4 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{m.provider.name}</p>
                    <p className="text-xs text-fg-subtle">
                      {m.provider.rating != null
                        ? `★ ${m.provider.rating.toFixed(1)} (${m.provider.ratingCount})`
                        : "New — no reviews yet"}
                      {m.provider.city ? ` · ${m.provider.city}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="tabular text-sm">{rupees(m.price.estimatedTotalMinor)}</span>
                    <Button
                      size="console"
                      variant="primary"
                      disabled={busy}
                      onClick={() => void place(placing, m.offeringId)}
                    >
                      Place here
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      <p className="mt-3 text-xs text-fg-subtle">
        Placing a job records it as a platform-managed assignment, so the history shows an operator
        chose the provider rather than the customer. Force-cancelling is terminal — the job does not
        come back.
      </p>
    </Page>
  );
}

export default function AdminBookingsPage() {
  return (
    <RequireAuth>
      <RequireRole kind="PLATFORM" role="ADMIN">
        <AdminBookings />
      </RequireRole>
    </RequireAuth>
  );
}
