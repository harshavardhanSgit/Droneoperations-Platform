"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/form";
import { StatusPill } from "@/components/ui/status-pill";
import { EmptyState, PageHeader, Page } from "@/components/ui/surface";
import { ApiError } from "@/core/api/client";
import type { StaffMember, Ticket } from "@/core/api/types";
import { RequireAuth } from "@/core/auth/require-auth";
import * as admin from "@/features/admin/maintenance-api";
import { TICKET_LABEL, TICKET_TONE, whenShort } from "@/features/maintenance/format";

const FILTERS = [
  { value: "OPEN", label: "Needs an engineer" },
  { value: "ASSIGNED", label: "Assigned" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "CLOSED", label: "Closed" },
  { value: "", label: "All" },
];

/**
 * The console surface: 32px rows, tabular figures, a real table.
 *
 * This is the deliberate opposite of the provider screens. An operator scanning
 * a queue compares rows against each other, so the rows must line up and fit on
 * one screen. The same content as cards would be honest and useless.
 */
function Tickets() {
  const [items, setItems] = useState<Ticket[]>([]);
  const [engineers, setEngineers] = useState<StaffMember[]>([]);
  const [status, setStatus] = useState("OPEN");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Deliberately does not touch `loading` — a synchronous setState inside an
  // effect triggers an extra render pass before paint. Callers that need a
  // spinner set it themselves; the first load starts with loading already true.
  const load = (next = status) => {
    return admin
      .listTickets(next || undefined)
      .then((list) => setItems(list.items))
      .catch((caught: unknown) =>
        setError(caught instanceof ApiError ? caught.message : "Could not load tickets"),
      )
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    void load();
    void admin
      .listEngineers()
      .then((list) => setEngineers(list.items))
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const choose = (next: string) => {
    setStatus(next);
    setAssigning(null);
    setLoading(true);
    void load(next);
  };

  const assign = async (ticketId: string, engineerUserId: string) => {
    setBusy(true);
    setError(null);
    try {
      await admin.assignEngineer(ticketId, engineerUserId);
      setAssigning(null);
      await load();
    } catch (caught: unknown) {
      setError(caught instanceof ApiError ? caught.message : "Could not assign that engineer");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page size="console">
      <PageHeader
        title="Maintenance"
        description="Faults reported by providers. Assign an engineer to get the machine back in the air."
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
        <p className="text-sm text-fg-subtle">Loading…</p>
      ) : items.length === 0 ? (
        <EmptyState
          title="Nothing here"
          description={
            status === "OPEN"
              ? "No drone is waiting on an engineer. Providers report faults from their own screens."
              : "No tickets in this state."
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-surface border border-border">
          <table className="w-full min-w-[46rem] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-fg-subtle">
                <th className="px-4 py-2 font-medium">Drone</th>
                <th className="px-4 py-2 font-medium">Provider</th>
                <th className="px-4 py-2 font-medium">Fault</th>
                <th className="px-4 py-2 font-medium">Raised</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((t) => (
                <tr key={t.id} className="h-8 align-middle">
                  <td className="px-4 py-2">
                    <span className="font-medium">{t.droneModel}</span>
                    <span className="tabular ml-2 text-xs text-fg-subtle">
                      {t.droneRegistration}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-fg-muted">{t.providerName}</td>
                  <td className="max-w-[18rem] truncate px-4 py-2" title={t.description}>
                    {t.description}
                  </td>
                  <td className="tabular px-4 py-2 text-fg-muted">{whenShort(t.createdAt)}</td>
                  <td className="px-4 py-2">
                    <StatusPill tone={TICKET_TONE[t.status] ?? "neutral"} size="console">
                      {TICKET_LABEL[t.status] ?? t.status}
                    </StatusPill>
                  </td>
                  <td className="px-4 py-2 text-right">
                    {t.status !== "OPEN" ? null : assigning === t.id ? (
                      <select
                        autoFocus
                        disabled={busy}
                        defaultValue=""
                        onChange={(e) => e.target.value && void assign(t.id, e.target.value)}
                        onBlur={() => setAssigning(null)}
                        className="h-8 rounded-control border border-border-strong bg-bg px-2 text-sm"
                      >
                        <option value="" disabled>
                          Pick an engineer…
                        </option>
                        {engineers.map((eng) => (
                          <option key={eng.id} value={eng.id}>
                            {eng.fullName}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <Button
                        size="console"
                        disabled={engineers.length === 0}
                        title={
                          engineers.length === 0 ? "No service engineers exist yet" : undefined
                        }
                        onClick={() => setAssigning(t.id)}
                      >
                        Assign
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Page>
  );
}

export default function AdminTicketsPage() {
  return (
    <RequireAuth>
      <Tickets />
    </RequireAuth>
  );
}
