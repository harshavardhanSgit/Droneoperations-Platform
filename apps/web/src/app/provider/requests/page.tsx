"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, FormError, SelectField } from "@/components/ui/form";
import { StatusPill } from "@/components/ui/status-pill";
import { EmptyState, PageHeader, Surface, Page, cardGrid } from "@/components/ui/surface";
import { ApiError } from "@/core/api/client";
import type { Booking } from "@/core/api/types";
import { RequireAuth, RequireRole } from "@/core/auth/require-auth";
import * as bookingApi from "@/features/bookings/api";
import { rupees, shortDate, WINDOWS, windowLabel } from "@/features/bookings/format";
import * as providerApi from "@/features/provider/bookings-api";

type Panel = { id: string; kind: "decline" | "propose" } | null;

/**
 * A request the provider has already answered by proposing their own date. It
 * stays in this inbox because the assignment is still PENDING — the customer's
 * confirmation is what accepts it. Showing "Accept / Decline" again here would
 * invite a provider to answer a question they have already answered.
 */
function awaitingCustomer(booking: Booking) {
  return booking.pendingSchedule?.proposedBy === "PROVIDER";
}

function Requests() {
  const [items, setItems] = useState<Booking[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [panel, setPanel] = useState<Panel>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [reason, setReason] = useState("");
  const [date, setDate] = useState("");
  const [slot, setSlot] = useState(WINDOWS[1]);

  const load = () =>
    providerApi
      .listAssignedBookings("PENDING")
      .then((list) => setItems(list.items))
      .catch((caught: unknown) =>
        setError(caught instanceof ApiError ? caught.message : "Could not load your requests"),
      )
      .finally(() => setLoading(false));

  useEffect(() => {
    void load();
  }, []);

  // Every action reloads rather than patching local state. A booking is a
  // shared aggregate — the customer may have cancelled it while this screen sat
  // open — so the server's answer is the only trustworthy one.
  const run = async (id: string, work: () => Promise<unknown>) => {
    setBusy(id);
    setError(null);
    try {
      await work();
      setPanel(null);
      setReason("");
      setDate("");
      await load();
    } catch (caught: unknown) {
      setError(caught instanceof ApiError ? caught.message : "That did not go through");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Page>
      <PageHeader
        title="Requests"
        description={
          items.length > 0
            ? `${items.length} ${items.length === 1 ? "job is" : "jobs are"} waiting on your answer`
            : undefined
        }
      />

      <FormError message={error} />

      {loading ? (
        <p className="text-sm text-fg-subtle">Loading…</p>
      ) : items.length === 0 ? (
        <EmptyState
          title="No requests right now"
          description="When a customer picks your business for a job, it lands here. You will also get a notification."
        />
      ) : (
        <ul className={cardGrid}>
          {items.map((booking) => {
            const waiting = awaitingCustomer(booking);
            const open = panel?.id === booking.id ? panel.kind : null;
            const working = busy === booking.id;

            return (
              <Surface as="li" key={booking.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{booking.customerName}</p>
                    <p className="mt-0.5 text-sm text-fg-muted">
                      {booking.serviceTypeName} · {booking.areaName}
                    </p>
                  </div>
                  {waiting ? (
                    <StatusPill tone="info">Waiting on customer</StatusPill>
                  ) : (
                    <p className="tabular shrink-0 text-right font-medium">
                      {rupees(booking.estimatedTotalMinor)}
                    </p>
                  )}
                </div>

                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-border pt-3 text-sm">
                  <div>
                    <dt className="text-xs text-fg-subtle">Area to cover</dt>
                    <dd className="tabular">
                      {booking.quantity} {booking.pricingUnit.replace("PER_", "").toLowerCase()}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-fg-subtle">
                      {booking.pendingSchedule ? "Proposed date" : "Preferred date"}
                    </dt>
                    <dd>
                      {shortDate(booking.pendingSchedule?.date ?? booking.preferredDate)} ·{" "}
                      {windowLabel(booking.pendingSchedule?.window ?? booking.preferredWindow)}
                    </dd>
                  </div>
                  {booking.locationNote ? (
                    <div className="col-span-2">
                      <dt className="text-xs text-fg-subtle">Where</dt>
                      <dd>{booking.locationNote}</dd>
                    </div>
                  ) : null}
                </dl>

                {waiting ? (
                  <p className="mt-3 text-sm text-fg-muted">
                    You proposed this date. The customer confirms it — that also accepts the job.
                  </p>
                ) : open === null ? (
                  <div className="mt-4 space-y-2">
                    <Button
                      variant="primary"
                      full
                      disabled={working}
                      onClick={() => void run(booking.id, () => providerApi.acceptBooking(booking.id))}
                    >
                      Accept
                    </Button>
                    <div className="flex gap-2">
                      <Button
                        className="flex-1"
                        disabled={working}
                        onClick={() => setPanel({ id: booking.id, kind: "propose" })}
                      >
                        Another date
                      </Button>
                      <Button
                        variant="danger"
                        className="flex-1"
                        disabled={working}
                        onClick={() => setPanel({ id: booking.id, kind: "decline" })}
                      >
                        Decline
                      </Button>
                    </div>
                  </div>
                ) : open === "propose" ? (
                  <div className="mt-4 space-y-3 border-t border-border pt-4">
                    <Field
                      label="Date that works for you"
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                    />
                    <SelectField
                      label="Time of day"
                      value={slot}
                      onChange={(e) => setSlot(e.target.value)}
                    >
                      {WINDOWS.map((w) => (
                        <option key={w} value={w}>
                          {windowLabel(w)}
                        </option>
                      ))}
                    </SelectField>
                    <div className="flex gap-2">
                      <Button variant="ghost" className="flex-1" onClick={() => setPanel(null)}>
                        Cancel
                      </Button>
                      <Button
                        variant="primary"
                        className="flex-1"
                        disabled={!date || working}
                        onClick={() =>
                          void run(booking.id, () =>
                            bookingApi.proposeSchedule(booking.id, date, slot),
                          )
                        }
                      >
                        Send to customer
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 space-y-3 border-t border-border pt-4">
                    <Field
                      label="Why are you declining?"
                      hint="The customer sees this, and their request stays open for another provider."
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Machine is in for service"
                    />
                    <div className="flex gap-2">
                      <Button variant="ghost" className="flex-1" onClick={() => setPanel(null)}>
                        Keep it
                      </Button>
                      <Button
                        variant="danger"
                        className="flex-1"
                        disabled={reason.trim().length < 3 || working}
                        onClick={() =>
                          void run(booking.id, () => providerApi.rejectBooking(booking.id, reason))
                        }
                      >
                        Decline
                      </Button>
                    </div>
                  </div>
                )}
              </Surface>
            );
          })}
        </ul>
      )}
    </Page>
  );
}

export default function ProviderRequestsPage() {
  return (
    <RequireAuth>
      <RequireRole kind="PROVIDER">
        <Requests />
      </RequireRole>
    </RequireAuth>
  );
}
