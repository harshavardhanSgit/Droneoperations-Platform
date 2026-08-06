"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, FormError, SelectField } from "@/components/ui/form";
import { StatusPill } from "@/components/ui/status-pill";
import { EmptyState, PageHeader, Surface, Page, cardGrid } from "@/components/ui/surface";
import { CardListSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/core/api/client";
import type { Booking } from "@/core/api/types";
import { RequireAuth, RequireRole } from "@/core/auth/require-auth";
import * as bookingApi from "@/features/bookings/api";
import { mapLink, rupees, shortDate, WINDOWS, windowLabel } from "@/features/bookings/format";
import * as providerApi from "@/features/provider/bookings-api";

type Panel = { id: string; kind: "complete" | "propose" | "cancel" } | null;

const unit = (b: Booking) => b.pricingUnit.replace("PER_", "").toLowerCase();

function Jobs() {
  const toast = useToast();
  const [items, setItems] = useState<Booking[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [panel, setPanel] = useState<Panel>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [finalQuantity, setFinalQuantity] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState("");
  const [slot, setSlot] = useState(WINDOWS[1]);
  const [reason, setReason] = useState("");

  const load = () =>
    providerApi
      .listAssignedBookings("ACCEPTED")
      .then((list) => setItems(list.items))
      .catch((caught: unknown) =>
        setError(caught instanceof ApiError ? caught.message : "Could not load your jobs"),
      )
      .finally(() => setLoading(false));

  useEffect(() => {
    void load();
  }, []);

  const run = async (id: string, work: () => Promise<unknown>, done?: string) => {
    setBusy(id);
    setError(null);
    try {
      await work();
      if (done) toast(done);
      setPanel(null);
      setFinalQuantity("");
      setNote("");
      setDate("");
      setReason("");
      await load();
    } catch (caught: unknown) {
      setError(caught instanceof ApiError ? caught.message : "That did not go through");
    } finally {
      setBusy(null);
    }
  };

  const toDo = items.filter((b) => b.status === "SCHEDULED");
  const waiting = items.filter((b) => b.status === "AWAITING_CONFIRMATION");
  const done = items.filter((b) => b.status === "COMPLETED");

  const scheduled = (b: Booking) => (
    <Surface as="li" key={b.id} className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{b.customerName}</p>
          <p className="mt-0.5 text-sm text-fg-muted">
            {b.serviceTypeName} · {b.areaName}
          </p>
        </div>
        <p className="tabular shrink-0 text-right font-medium">{rupees(b.estimatedTotalMinor)}</p>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-border pt-3 text-sm">
        <div>
          <dt className="text-xs text-fg-subtle">Agreed date</dt>
          <dd>
            {b.confirmedDate ? shortDate(b.confirmedDate) : shortDate(b.preferredDate)}
            {b.confirmedWindow ? ` · ${windowLabel(b.confirmedWindow)}` : ""}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-fg-subtle">Booked</dt>
          <dd className="tabular">
            {b.quantity} {unit(b)}
          </dd>
        </div>
        {b.locationNote || (b.latitude != null && b.longitude != null) ? (
          <div className="col-span-2">
            <dt className="text-xs text-fg-subtle">Where</dt>
            <dd>
              {b.locationNote ??
                `${b.latitude!.toFixed(5)}, ${b.longitude!.toFixed(5)}`}
            </dd>
            {b.latitude != null && b.longitude != null ? (
              <dd className="mt-0.5">
                <a
                  href={mapLink(b.latitude, b.longitude)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-accent hover:underline"
                >
                  Open in map ↗
                </a>
              </dd>
            ) : null}
          </div>
        ) : null}
      </dl>

      {/* A reschedule the customer proposed outranks the normal actions — it is
          a question addressed to this provider, and it blocks nothing else. */}
      {b.pendingSchedule?.proposedBy === "CUSTOMER" ? (
        <div className="mt-3 rounded-control bg-warning-bg p-3">
          <p className="text-sm text-warning">
            Customer asked to move this to {shortDate(b.pendingSchedule.date)} ·{" "}
            {windowLabel(b.pendingSchedule.window)}
          </p>
          <div className="mt-3 flex gap-2">
            <Button
              variant="primary"
              className="flex-1"
              disabled={busy === b.id}
              onClick={() => void run(b.id, () => bookingApi.confirmSchedule(b.id), "Date agreed")}
            >
              Agree
            </Button>
            <Button
              className="flex-1"
              disabled={busy === b.id}
              onClick={() => setPanel({ id: b.id, kind: "propose" })}
            >
              Suggest another
            </Button>
          </div>
        </div>
      ) : b.pendingSchedule?.proposedBy === "PROVIDER" ? (
        <p className="mt-3 text-sm text-fg-muted">
          You suggested {shortDate(b.pendingSchedule.date)} ·{" "}
          {windowLabel(b.pendingSchedule.window)}. Waiting for the customer.
        </p>
      ) : null}

      {panel?.id === b.id && panel.kind === "complete" ? (
        <div className="mt-4 space-y-3 border-t border-border pt-4">
          <Field
            label={`How much did you actually cover?`}
            hint={`Booked: ${b.quantity} ${unit(b)}. Enter what you really did — the bill follows this number.`}
            type="number"
            inputMode="decimal"
            min={0}
            value={finalQuantity}
            onChange={(e) => setFinalQuantity(e.target.value)}
            placeholder={`${unit(b)}`}
          />
          <Field
            label="Anything to note? (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Wind picked up after the north block"
          />
          {finalQuantity && Number(finalQuantity) !== b.quantity && b.unitPriceMinor ? (
            <p className="tabular rounded-control bg-neutral-bg px-3 py-2 text-sm">
              Bill becomes {rupees(Number(finalQuantity) * b.unitPriceMinor)} instead of{" "}
              {rupees(b.estimatedTotalMinor)}
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button variant="ghost" className="flex-1" onClick={() => setPanel(null)}>
              Not yet
            </Button>
            <Button
              variant="primary"
              className="flex-1"
              disabled={!finalQuantity || Number(finalQuantity) <= 0 || busy === b.id}
              onClick={() =>
                void run(
                  b.id,
                  () => providerApi.completeBooking(b.id, Number(finalQuantity), note || undefined),
                  "Marked done — waiting on the customer to confirm",
                )
              }
            >
              Mark done
            </Button>
          </div>
        </div>
      ) : panel?.id === b.id && panel.kind === "propose" ? (
        <div className="mt-4 space-y-3 border-t border-border pt-4">
          <Field
            label="New date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <SelectField label="Time of day" value={slot} onChange={(e) => setSlot(e.target.value)}>
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
              disabled={!date || busy === b.id}
              onClick={() => void run(b.id, () => bookingApi.proposeSchedule(b.id, date, slot), "Date sent to the customer")}
            >
              Send
            </Button>
          </div>
        </div>
      ) : panel?.id === b.id && panel.kind === "cancel" ? (
        <div className="mt-4 space-y-3 border-t border-border pt-4">
          <Field
            label="Why are you cancelling?"
            hint="The customer sees this. Cancelling is final — the job does not come back."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Drone grounded, cannot make the date"
          />
          <div className="flex gap-2">
            <Button variant="ghost" className="flex-1" onClick={() => setPanel(null)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              className="flex-1"
              disabled={reason.trim().length < 3 || busy === b.id}
              onClick={() => void run(b.id, () => bookingApi.cancelBooking(b.id, reason), "Job cancelled")}
            >
              Cancel job
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          <Button
            variant="primary"
            full
            disabled={busy === b.id}
            onClick={() => setPanel({ id: b.id, kind: "complete" })}
          >
            Mark done
          </Button>
          <div className="flex gap-2">
            <Button
              className="flex-1"
              disabled={busy === b.id}
              onClick={() => setPanel({ id: b.id, kind: "propose" })}
            >
              Another date
            </Button>
            <Button
              variant="danger"
              className="flex-1"
              disabled={busy === b.id}
              onClick={() => setPanel({ id: b.id, kind: "cancel" })}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </Surface>
  );

  return (
    <Page>
      <PageHeader title="My jobs" description="Work you have taken on." />

      <FormError message={error} />

      {loading ? (
        <CardListSkeleton />
      ) : items.length === 0 ? (
        <EmptyState
          title="Nothing on your books yet"
          description="Jobs you accept show up here, with everything you need to finish them off."
        />
      ) : (
        <div className="space-y-8">
          {toDo.length > 0 ? (
            <section>
              <h2 className="mb-3 text-sm font-medium text-fg-muted">To do</h2>
              <ul className={cardGrid}>{toDo.map(scheduled)}</ul>
            </section>
          ) : null}

          {waiting.length > 0 ? (
            <section>
              <h2 className="mb-3 text-sm font-medium text-fg-muted">Waiting on the customer</h2>
              <ul className={cardGrid}>
                {waiting.map((b) => (
                  <Surface as="li" key={b.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{b.customerName}</p>
                        <p className="mt-0.5 text-sm text-fg-muted">
                          {b.finalQuantity} {unit(b)} done
                          {b.finalQuantity !== b.quantity ? ` of ${b.quantity} booked` : ""}
                        </p>
                      </div>
                      <p className="tabular shrink-0 font-medium">{rupees(b.finalAmountMinor)}</p>
                    </div>
                    <p className="mt-3 border-t border-border pt-3 text-sm text-fg-muted">
                      They confirm the work, then you can record the payment.
                    </p>
                  </Surface>
                ))}
              </ul>
            </section>
          ) : null}

          {done.length > 0 ? (
            <section>
              <h2 className="mb-3 text-sm font-medium text-fg-muted">Done</h2>
              <ul className="divide-y divide-border rounded-surface border border-border">
                {done.map((b) => (
                  <li key={b.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{b.customerName}</p>
                      <p className="tabular mt-0.5 text-xs text-fg-subtle">
                        {b.finalQuantity ?? b.quantity} {unit(b)}
                        {b.confirmedDate ? ` · ${shortDate(b.confirmedDate)}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <p className="tabular text-sm font-medium">
                        {rupees(b.finalAmountMinor ?? b.estimatedTotalMinor)}
                      </p>
                      <StatusPill tone="success" size="console">
                        Completed
                      </StatusPill>
                    </div>
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

export default function ProviderJobsPage() {
  return (
    <RequireAuth>
      <RequireRole kind="PROVIDER">
        <Jobs />
      </RequireRole>
    </RequireAuth>
  );
}
