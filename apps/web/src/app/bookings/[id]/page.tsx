"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { FormError } from "@/components/ui/form";
import { ApiError } from "@/core/api/client";
import type { BookingDetail, Payment, Review } from "@/core/api/types";
import { RequireAuth } from "@/core/auth/require-auth";
import * as bookingApi from "@/features/bookings/api";
import { StatusPill } from "@/components/ui/status-pill";
import { rupees, STATUS_LABEL, STATUS_TONE, WINDOWS } from "@/features/bookings/format";

const field =
  "rounded-md border border-black/15 bg-white px-3 py-2 text-sm dark:border-white/20 dark:bg-white/5";
const primary =
  "rounded-md bg-black px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black";
const secondary =
  "rounded-md border border-black/15 px-3 py-1.5 text-sm disabled:opacity-50 dark:border-white/20";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-6 border-b border-black/5 py-2 text-sm last:border-0 dark:border-white/10">
      <span className="text-black/45 dark:text-white/45">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}

function Detail() {
  const { id } = useParams<{ id: string }>();

  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [payment, setPayment] = useState<Payment | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [date, setDate] = useState("");
  const [window_, setWindow] = useState("DAWN");
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");

  const load = useCallback(async () => {
    const [detail, paid, existing] = await Promise.all([
      bookingApi.getBooking(id),
      bookingApi.getPayment(id).catch(() => null),
      bookingApi.getReview(id).catch(() => null),
    ]);
    setBooking(detail);
    setPayment(paid);
    setReview(existing);
    setDate(detail.confirmedDate ?? detail.preferredDate);
  }, [id]);

  // Every setState happens inside a promise callback, never synchronously in the
  // effect body, and a late response cannot write to an unmounted component.
  useEffect(() => {
    let cancelled = false;

    Promise.all([
      bookingApi.getBooking(id),
      bookingApi.getPayment(id).catch(() => null),
      bookingApi.getReview(id).catch(() => null),
    ])
      .then(([detail, paid, existing]) => {
        if (cancelled) return;
        setBooking(detail);
        setPayment(paid);
        setReview(existing);
        setDate(detail.confirmedDate ?? detail.preferredDate);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setError(caught instanceof ApiError ? caught.message : "Could not load this booking");
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  async function act(key: string, fn: () => Promise<unknown>) {
    setError(null);
    setBusy(key);
    try {
      await fn();
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "That did not work");
    } finally {
      setBusy(null);
    }
  }

  if (!booking) {
    return (
      <main className="mx-auto w-full max-w-2xl px-6 py-14">
        <FormError message={error} />
        {!error ? <p className="text-sm text-black/45 dark:text-white/45">Loading…</p> : null}
      </main>
    );
  }

  const open = booking.status !== "COMPLETED" && booking.status !== "CANCELLED";
  const pending = booking.pendingSchedule;
  const awaitingMe = pending?.proposedBy === "PROVIDER";
  const reviewed = review !== null;

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-14">
      <Link href="/bookings" className="text-sm text-black/45 hover:underline dark:text-white/45">
        ← My bookings
      </Link>

      <header className="mt-4 mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            {booking.serviceTypeName} · {booking.quantity}{" "}
            {booking.pricingUnit.replace("PER_", "").toLowerCase()}
          </h1>
          <p className="mt-1 text-sm text-black/50 dark:text-white/50">
            {booking.areaName}
            {booking.locationNote ? ` · ${booking.locationNote}` : ""}
          </p>
        </div>
        <StatusPill tone={STATUS_TONE[booking.status] ?? "neutral"}>
          {STATUS_LABEL[booking.status] ?? booking.status}
        </StatusPill>
      </header>

      <FormError message={error} />

      <section className="mt-4 rounded-lg border border-black/10 p-5 dark:border-white/15">
        <Row
          label="Provider"
          value={booking.activeAssignment?.providerName ?? "None — choose one"}
        />
        <Row
          label="Date"
          value={
            booking.confirmedDate
              ? `${booking.confirmedDate} ${(booking.confirmedWindow ?? "").toLowerCase()}`
              : `${booking.preferredDate} ${booking.preferredWindow.toLowerCase()} (not agreed)`
          }
        />
        <Row label="Quoted" value={rupees(booking.estimatedTotalMinor)} />
        {booking.finalQuantity ? (
          <Row
            label="Delivered"
            value={`${booking.finalQuantity} ${booking.pricingUnit.replace("PER_", "").toLowerCase()} · ${rupees(booking.finalAmountMinor)}`}
          />
        ) : null}
        {booking.completionNote ? <Row label="Provider note" value={booking.completionNote} /> : null}
        {booking.cancelledReason ? <Row label="Cancelled" value={booking.cancelledReason} /> : null}
      </section>

      {booking.status === "UNASSIGNED" ? (
        <p className="mt-4 rounded-md bg-amber-500/10 px-3 py-2.5 text-sm text-amber-800 dark:text-amber-300">
          No provider is assigned.{" "}
          <Link href="/search" className="underline underline-offset-4">
            Find another
          </Link>{" "}
          — your requirement and history are kept.
        </p>
      ) : null}

      {pending ? (
        <section className="mt-4 rounded-lg border border-black/10 p-5 dark:border-white/15">
          <h2 className="mb-1 text-sm font-medium">
            {awaitingMe ? "The provider proposed a different date" : "Waiting on the provider"}
          </h2>
          <p className="mb-3 text-sm text-black/55 dark:text-white/55">
            {pending.date} {pending.window.toLowerCase()} — proposed by{" "}
            {pending.proposedBy.toLowerCase()}
          </p>
          {awaitingMe ? (
            <button
              disabled={busy !== null}
              onClick={() => void act("confirm", () => bookingApi.confirmSchedule(id))}
              className={primary}
            >
              {busy === "confirm" ? "Confirming…" : "Accept this date"}
            </button>
          ) : (
            <p className="text-xs text-black/45 dark:text-white/45">
              You proposed this — the provider must confirm it.
            </p>
          )}
        </section>
      ) : null}

      {open && booking.status !== "UNASSIGNED" ? (
        <section className="mt-4 rounded-lg border border-black/10 p-5 dark:border-white/15">
          <h2 className="mb-3 text-sm font-medium">Propose a different date</h2>
          <div className="flex flex-wrap gap-2">
            <input
              type="date"
              className={field}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
            <select className={field} value={window_} onChange={(e) => setWindow(e.target.value)}>
              {WINDOWS.map((w) => (
                <option key={w} value={w}>
                  {w.charAt(0) + w.slice(1).toLowerCase()}
                </option>
              ))}
            </select>
            <button
              disabled={busy !== null}
              onClick={() => void act("propose", () => bookingApi.proposeSchedule(id, date, window_))}
              className={secondary}
            >
              {busy === "propose" ? "Proposing…" : "Propose"}
            </button>
          </div>
        </section>
      ) : null}

      {booking.status === "AWAITING_CONFIRMATION" ? (
        <section className="mt-4 rounded-lg border border-black/10 p-5 dark:border-white/15">
          <h2 className="mb-1 text-sm font-medium">The provider says the work is done</h2>
          <p className="mb-3 text-sm text-black/55 dark:text-white/55">
            {booking.finalQuantity} {booking.pricingUnit.replace("PER_", "").toLowerCase()} ·{" "}
            {rupees(booking.finalAmountMinor)}
          </p>
          <button
            disabled={busy !== null}
            onClick={() => void act("done", () => bookingApi.confirmCompletion(id))}
            className={primary}
          >
            {busy === "done" ? "Confirming…" : "Confirm it was done"}
          </button>
        </section>
      ) : null}

      {booking.status === "COMPLETED" ? (
        <section className="mt-4 rounded-lg border border-black/10 p-5 dark:border-white/15">
          <h2 className="mb-3 text-sm font-medium">Payment</h2>
          {payment ? (
            <>
              <Row label="Amount" value={rupees(payment.amountMinor)} />
              <Row label="Method" value={`${payment.method} · ${payment.paidOn}`} />
              <Row label="Recorded by" value={payment.recordedByRole.toLowerCase()} />
              {payment.reference ? <Row label="Reference" value={payment.reference} /> : null}
            </>
          ) : (
            <>
              <p className="mb-3 text-sm text-black/55 dark:text-white/55">
                You pay the provider directly. Record it here so both sides have the same record.
              </p>
              <div className="flex flex-wrap gap-2">
                <select className={field} id="method" defaultValue="UPI">
                  {["UPI", "CASH", "BANK_TRANSFER", "CHEQUE", "OTHER"].map((m) => (
                    <option key={m} value={m}>
                      {m.replace("_", " ").toLowerCase()}
                    </option>
                  ))}
                </select>
                <button
                  disabled={busy !== null}
                  onClick={() =>
                    void act("pay", () =>
                      bookingApi.recordPayment(id, {
                        method:
                          (document.getElementById("method") as HTMLSelectElement | null)?.value ??
                          "UPI",
                        paidOn: new Date().toISOString().slice(0, 10),
                      }),
                    )
                  }
                  className={primary}
                >
                  {busy === "pay" ? "Recording…" : `Record ${rupees(booking.finalAmountMinor)} paid`}
                </button>
              </div>
            </>
          )}
        </section>
      ) : null}

      {booking.status === "COMPLETED" && reviewed ? (
        <section className="mt-4 rounded-lg border border-black/10 p-5 dark:border-white/15">
          <h2 className="mb-2 text-sm font-medium">Your review</h2>
          <p className="text-sm">
            {"★".repeat(review.rating)}
            <span className="text-black/25 dark:text-white/25">{"★".repeat(5 - review.rating)}</span>
            {review.comment ? <span className="ml-2">{review.comment}</span> : null}
          </p>
        </section>
      ) : null}

      {booking.status === "COMPLETED" && !reviewed ? (
        <section className="mt-4 rounded-lg border border-black/10 p-5 dark:border-white/15">
          <h2 className="mb-3 text-sm font-medium">Rate this provider</h2>
          <div className="mb-3 flex gap-1.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                onClick={() => setRating(n)}
                className={`h-8 w-8 rounded-md text-sm ${
                  n <= rating
                    ? "bg-black text-white dark:bg-white dark:text-black"
                    : "bg-black/5 dark:bg-white/10"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          <textarea
            rows={2}
            placeholder="How did it go?"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className={`${field} mb-3 w-full`}
          />
          <button
            disabled={busy !== null}
            onClick={() =>
              void act("review", () =>
                bookingApi.createReview(id, rating, comment.trim() || undefined),
              )
            }
            className={primary}
          >
            {busy === "review" ? "Sending…" : "Submit review"}
          </button>
        </section>
      ) : null}

      {open ? (
        <section className="mt-4">
          <button
            disabled={busy !== null}
            onClick={() => {
              const reason = prompt("Why are you cancelling?");
              if (reason && reason.trim().length >= 3) {
                void act("cancel", () => bookingApi.cancelBooking(id, reason.trim()));
              }
            }}
            className="text-sm text-red-700 hover:underline dark:text-red-400"
          >
            Cancel this booking
          </button>
        </section>
      ) : null}

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-medium">Timeline</h2>
        <ol className="space-y-1.5 text-sm">
          {booking.history.map((entry, index) => (
            <li key={index} className="flex gap-3 text-black/55 dark:text-white/55">
              <span className="shrink-0 tabular-nums text-black/35 dark:text-white/35">
                {new Date(entry.at).toLocaleString()}
              </span>
              <span>
                {STATUS_LABEL[entry.toStatus] ?? entry.toStatus}
                {entry.reason ? ` — ${entry.reason}` : ""}
              </span>
            </li>
          ))}
        </ol>

        {booking.assignments.length > 1 ? (
          <>
            <h3 className="mt-6 mb-2 text-xs font-medium uppercase tracking-wide text-black/45 dark:text-white/45">
              Providers asked
            </h3>
            <ul className="space-y-1 text-sm text-black/55 dark:text-white/55">
              {booking.assignments.map((a) => (
                <li key={a.id}>
                  {a.providerName} — {a.status.toLowerCase()}
                  {a.rejectionReason ? ` (${a.rejectionReason})` : ""}
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </section>
    </main>
  );
}

export default function BookingDetailPage() {
  return (
    <RequireAuth>
      <Detail />
    </RequireAuth>
  );
}
