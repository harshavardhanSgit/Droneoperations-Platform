"use client";

import { useEffect, useState } from "react";

import { IndiaMap } from "@/components/india-map";
import { ApiError, apiFetch } from "@/core/api/client";
import type { Coverage } from "@/core/api/types";

const num = (n: number) => n.toLocaleString("en-IN");

function ShowcaseKpi({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="tabular text-3xl font-semibold tracking-tight sm:text-4xl">{value}</p>
      <p className="mt-1 text-sm text-fg-muted">{label}</p>
    </div>
  );
}

/**
 * The landing page's "the platform in numbers" section.
 *
 * Fetches the PUBLIC endpoint (GET /api/v1/coverage/public) — the SAME real
 * aggregation the admin screen shows, TTL-cached and rate-limited on the API
 * so anonymous page loads cannot hammer the database. Every number here is
 * computed from actual completed bookings, active offerings and drones.
 */
export function CoverageShowcase() {
  const [data, setData] = useState<Coverage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    apiFetch<Coverage>("/api/v1/coverage/public")
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof ApiError ? caught.message : "Could not load coverage data");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="mt-20 border-t border-border pt-14">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">The platform in numbers</h2>
          <p className="mt-1 max-w-xl text-sm text-fg-muted">
            Acres sprayed, jobs delivered and districts served — computed live
            from completed bookings on the platform.
          </p>
        </div>
        <p className="rounded-control bg-neutral-bg px-2 py-1 text-[11px] text-fg-subtle">
          Live data
        </p>
      </div>

      {error ? (
        <p className="mt-8 text-sm text-fg-muted">Coverage data is unavailable right now.</p>
      ) : !data ? (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-surface bg-neutral-bg" aria-hidden />
          ))}
        </div>
      ) : (
        <>
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <ShowcaseKpi label="Acres covered" value={num(data.totals.acresCovered)} />
            <ShowcaseKpi label="Jobs completed" value={num(data.totals.jobsCompleted)} />
            <ShowcaseKpi label="Active providers" value={num(data.totals.providersActive)} />
            <ShowcaseKpi label="Drones in service" value={num(data.totals.dronesServiceable)} />
          </div>

          <div className="mt-10 grid items-start gap-8 lg:grid-cols-[1.4fr_1fr]">
            <div className="rounded-surface border border-border bg-bg p-4 sm:p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-sm font-medium">Where the fleet works</h3>
                <span className="text-[11px] text-fg-subtle">
                  {num(data.totals.statesCovered)} states · {num(data.totals.districtsCovered)}{" "}
                  districts
                </span>
              </div>
              {/* View-only here — selection is an admin-screen concern. */}
              <IndiaMap states={data.states} interactive={false} />
            </div>

            <div>
              <h3 className="text-sm font-medium">Top districts</h3>
              <ul className="mt-3 divide-y divide-border">
                {data.districts.slice(0, 8).map((district) => (
                  <li
                    key={district.id}
                    className="flex items-baseline justify-between gap-3 py-2.5 text-sm"
                  >
                    <span className="min-w-0">
                      <span className="font-medium">{district.name}</span>
                      <span className="text-fg-subtle"> · {district.state}</span>
                    </span>
                    <span className="tabular shrink-0 font-medium">
                      {num(district.acresCovered)} acres
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
