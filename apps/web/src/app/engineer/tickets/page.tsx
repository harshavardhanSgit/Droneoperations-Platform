"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, FormError } from "@/components/ui/form";
import { StatusPill } from "@/components/ui/status-pill";
import { cardGrid, EmptyState, Page, PageHeader, Surface } from "@/components/ui/surface";
import { ApiError } from "@/core/api/client";
import type { Ticket } from "@/core/api/types";
import { RequireAuth, RequireRole } from "@/core/auth/require-auth";
import * as engineer from "@/features/engineer/api";
import { TICKET_LABEL, TICKET_TONE, whenShort } from "@/features/maintenance/format";

/**
 * The engineer surface is nearly linear: one job at a time, on a phone, on site.
 * Each ticket shows exactly the next action and nothing else — there is no
 * filtering, no sorting and no bulk anything, because none of that is a question
 * an engineer standing next to a broken drone is asking.
 */
function Tickets() {
  const [items, setItems] = useState<Ticket[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const [closing, setClosing] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const load = () =>
    engineer
      .listMyTickets()
      .then((list) => setItems(list.items))
      .catch((caught: unknown) =>
        setError(caught instanceof ApiError ? caught.message : "Could not load your tickets"),
      )
      .finally(() => setLoading(false));

  useEffect(() => {
    let cancelled = false;

    engineer
      .listMyTickets()
      .then((list) => {
        if (cancelled) return;
        setItems(list.items);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setError(caught instanceof ApiError ? caught.message : "Could not load your tickets");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const run = async (id: string, work: () => Promise<unknown>) => {
    setBusy(id);
    setError(null);
    try {
      await work();
      setClosing(null);
      setNote("");
      setFile(null);
      await load();
    } catch (caught: unknown) {
      setError(caught instanceof ApiError ? caught.message : "That did not go through");
    } finally {
      setBusy(null);
    }
  };

  // Upload then close. Two calls, one button — an engineer should not have to
  // know that a report is a separate resource from the ticket it belongs to.
  const finish = async (ticketId: string) => {
    if (!file) return;

    await run(ticketId, async () => {
      const documentId = await engineer.uploadReport(ticketId, file);
      await engineer.closeTicket(ticketId, note.trim(), documentId);
    });
  };

  const open = items.filter((t) => t.status !== "CLOSED" && t.status !== "CANCELLED");
  const done = items.filter((t) => t.status === "CLOSED");

  return (
    <Page>
      <PageHeader title="My tickets" description="Drones waiting on you." />

      <FormError message={error} />

      {loading ? (
        <p className="text-sm text-fg-subtle">Loading…</p>
      ) : items.length === 0 ? (
        <EmptyState
          title="Nothing assigned to you"
          description="When the platform assigns you a repair, it appears here."
        />
      ) : (
        <div className="space-y-8">
          {open.length > 0 ? (
            <ul className={cardGrid}>
              {open.map((t) => {
                const working = busy === t.id;

                return (
                  <Surface as="li" key={t.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{t.droneModel}</p>
                        <p className="tabular mt-0.5 text-sm text-fg-muted">
                          {t.droneRegistration}
                        </p>
                      </div>
                      <StatusPill tone={TICKET_TONE[t.status] ?? "neutral"}>
                        {TICKET_LABEL[t.status] ?? t.status}
                      </StatusPill>
                    </div>

                    <dl className="mt-3 space-y-2 border-t border-border pt-3 text-sm">
                      <div>
                        <dt className="text-xs text-fg-subtle">Reported fault</dt>
                        <dd>{t.description}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-fg-subtle">Operator</dt>
                        <dd>
                          {t.providerName} · reported {whenShort(t.createdAt)}
                        </dd>
                      </div>
                    </dl>

                    {t.status === "ASSIGNED" ? (
                      <div className="mt-4">
                        <Button
                          variant="primary"
                          full
                          disabled={working}
                          onClick={() => void run(t.id, () => engineer.startTicket(t.id))}
                        >
                          Start work
                        </Button>
                      </div>
                    ) : closing === t.id ? (
                      <div className="mt-4 space-y-3 border-t border-border pt-4">
                        <Field
                          label="What did you do?"
                          hint="At least 10 characters. The operator sees this."
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          placeholder="Replaced pump diaphragm and recalibrated nozzles"
                        />
                        <label className="block">
                          <span className="mb-1.5 block text-sm font-medium">Service report</span>
                          <input
                            type="file"
                            accept="application/pdf,image/jpeg,image/png,image/webp"
                            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                            className="w-full text-sm file:mr-3 file:rounded-control file:border file:border-border-strong file:bg-bg file:px-3 file:py-1.5 file:text-sm"
                          />
                          <span className="mt-1 block text-xs text-fg-subtle">
                            Required — a ticket cannot be closed without one.
                          </span>
                        </label>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            className="flex-1"
                            onClick={() => setClosing(null)}
                          >
                            Not yet
                          </Button>
                          <Button
                            variant="primary"
                            className="flex-1"
                            disabled={note.trim().length < 10 || !file || working}
                            onClick={() => void finish(t.id)}
                          >
                            {working ? "Uploading…" : "Close ticket"}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-4">
                        <Button
                          variant="primary"
                          full
                          disabled={working}
                          onClick={() => setClosing(t.id)}
                        >
                          Finish and close
                        </Button>
                      </div>
                    )}
                  </Surface>
                );
              })}
            </ul>
          ) : null}

          {done.length > 0 ? (
            <section>
              <h2 className="mb-3 text-sm font-medium text-fg-muted">Closed</h2>
              <ul className="divide-y divide-border rounded-surface border border-border">
                {done.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{t.droneModel}</p>
                      <p className="truncate text-xs text-fg-subtle">
                        {t.resolutionNote ?? t.description}
                      </p>
                    </div>
                    <StatusPill tone="success" size="console">
                      Fixed
                    </StatusPill>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}
    </Page>
  );
}

export default function EngineerTicketsPage() {
  return (
    <RequireAuth>
      <RequireRole kind="PLATFORM" role="SERVICE_ENGINEER">
        <Tickets />
      </RequireRole>
    </RequireAuth>
  );
}
