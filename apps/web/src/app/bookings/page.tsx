"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { FormError } from "@/components/ui/form";
import { RowsSkeleton } from "@/components/ui/skeleton";
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
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg"
        >
          Book a service
        </Link>
      </header>

      <FormError message={error} />

      {loading ? (
        <RowsSkeleton />
      ) : items.length === 0 ? (
        <p className="rounded-lg border border-border-strong px-4 py-10 text-center text-sm text-fg-subtle">
          No bookings yet.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border-strong">
          {items.map((booking) => {
            const action = needsYou(booking);

            return (
              <li key={booking.id}>
                <Link
                  href={`/bookings/${booking.id}`}
                  className="block px-4 py-3.5 hover:bg-neutral-bg"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {booking.serviceTypeName} · {booking.quantity}{" "}
                        {booking.pricingUnit.replace("PER_", "").toLowerCase()}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-fg-subtle">
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
                    <p className="mt-2 text-xs font-medium text-warning">
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
