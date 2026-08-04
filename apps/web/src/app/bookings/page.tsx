"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { FormError } from "@/components/ui/form";
import { ApiError } from "@/core/api/client";
import type { Booking } from "@/core/api/types";
import { RequireAuth } from "@/core/auth/require-auth";
import * as bookingApi from "@/features/bookings/api";
import { StatusPill } from "@/components/ui/status-pill";
import { rupees, STATUS_LABEL, STATUS_TONE } from "@/features/bookings/format";

function needsYou(booking: Booking): string | null {
  if (booking.status === "UNASSIGNED") return "Choose another provider";
  if (booking.status === "AWAITING_CONFIRMATION") return "Confirm the work was done";
  if (booking.pendingSchedule?.proposedBy === "PROVIDER") return "Confirm the proposed date";
  return null;
}

function Bookings() {
  const [items, setItems] = useState<Booking[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void bookingApi
      .listBookings()
      .then((list) => setItems(list.items))
      .catch((caught: unknown) =>
        setError(caught instanceof ApiError ? caught.message : "Could not load your bookings"),
      )
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-14">
      <header className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold tracking-tight">My bookings</h1>
        <Link
          href="/search"
          className="rounded-md bg-black px-3 py-1.5 text-sm font-medium text-white dark:bg-white dark:text-black"
        >
          Book a service
        </Link>
      </header>

      <FormError message={error} />

      {loading ? (
        <p className="text-sm text-black/45 dark:text-white/45">Loading…</p>
      ) : items.length === 0 ? (
        <p className="rounded-lg border border-black/10 px-4 py-10 text-center text-sm text-black/45 dark:border-white/15 dark:text-white/45">
          No bookings yet.
        </p>
      ) : (
        <ul className="divide-y divide-black/10 rounded-lg border border-black/10 dark:divide-white/15 dark:border-white/15">
          {items.map((booking) => {
            const action = needsYou(booking);

            return (
              <li key={booking.id}>
                <Link
                  href={`/bookings/${booking.id}`}
                  className="block px-4 py-3.5 hover:bg-black/[0.02] dark:hover:bg-white/[0.03]"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {booking.serviceTypeName} · {booking.quantity}{" "}
                        {booking.pricingUnit.replace("PER_", "").toLowerCase()}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-black/45 dark:text-white/45">
                        {booking.areaName} ·{" "}
                        {booking.confirmedDate ?? booking.preferredDate}{" "}
                        {(booking.confirmedWindow ?? booking.preferredWindow).toLowerCase()}
                        {booking.activeAssignment
                          ? ` · ${booking.activeAssignment.providerName}`
                          : ""}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <StatusPill tone={STATUS_TONE[booking.status] ?? "neutral"}>
                        {STATUS_LABEL[booking.status] ?? booking.status}
                      </StatusPill>
                      <p className="tabular mt-1 text-xs text-fg-subtle">
                        {rupees(booking.finalAmountMinor ?? booking.estimatedTotalMinor)}
                      </p>
                    </div>
                  </div>

                  {action ? (
                    <p className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-400">
                      → {action}
                    </p>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

export default function BookingsPage() {
  return (
    <RequireAuth>
      <Bookings />
    </RequireAuth>
  );
}
