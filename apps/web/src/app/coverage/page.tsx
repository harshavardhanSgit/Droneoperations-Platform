"use client";

import { useEffect, useMemo, useState } from "react";

import { FormError } from "@/components/ui/form";
import { IndiaMap } from "@/components/india-map";
import { RowsSkeleton } from "@/components/ui/skeleton";
import { Page, PageHeader, Surface } from "@/components/ui/surface";
import { ApiError } from "@/core/api/client";
import { RequireAuth, RequireRole } from "@/core/auth/require-auth";
import type { Coverage } from "@/core/api/types";
import { getCoverage } from "@/features/coverage/api";

const num = (n: number) => n.toLocaleString("en-IN");

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <Surface className="p-5">
      <p className="tabular text-3xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 text-sm text-fg-muted">{label}</p>
    </Surface>
  );
}

function Legend({ maxAcres }: { maxAcres: number }) {
  const steps = [0.16, 0.3, 0.45, 0.6, 0.73];
  return (
    <div className="flex items-center gap-2 text-[11px] text-fg-subtle">
      <span>less</span>
      <span className="flex gap-0.5">
        {steps.map((opacity) => (
          <span
            key={opacity}
            className="size-2.5 rounded-[2px]"
            style={{ backgroundColor: "var(--success)", opacity }}
            aria-hidden
          />
        ))}
      </span>
      <span>more acres</span>
      <span className="ml-1 hidden tabular sm:inline">{num(maxAcres)} max</span>
    </div>
  );
}

function CoverageContent() {
  const [data, setData] = useState<Coverage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    getCoverage()
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setError(caught instanceof ApiError ? caught.message : "Could not load coverage");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const districts = useMemo(() => {
    if (!data) return [];
    const list = selected ? data.districts.filter((d) => d.state === selected) : data.districts;
    return list.slice(0, 10);
  }, [data, selected]);

  const maxAcres = useMemo(
    () => (data ? Math.max(...data.states.map((s) => s.acresCovered), 1) : 1),
    [data],
  );

  /** "By delivery" means by delivery — an activated-but-idle provider gets a
   * row only once they have something to show for it. */
  const deliveringProviders = useMemo(
    () =>
      data ? data.providers.filter((p) => p.jobs > 0 || p.acresCovered > 0).slice(0, 6) : [],
    [data],
  );

  return (
    <Page size="console">
      <PageHeader
        title="Coverage"
        description="Where the fleet actually works, platform-wide — derived from completed jobs, live offerings and serviceable drones. Staff only; providers and customers see their own numbers on their own screens."
      />

      <FormError message={error} />

      {loading ? (
        <RowsSkeleton />
      ) : !data ? null : (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Acres covered" value={num(data.totals.acresCovered)} />
            <Kpi label="Jobs completed" value={num(data.totals.jobsCompleted)} />
            <Kpi label="Active providers" value={num(data.totals.providersActive)} />
            <Kpi label="Drones serviceable" value={num(data.totals.dronesServiceable)} />
          </div>

          <div className="grid items-start gap-3 lg:grid-cols-[1.5fr_1fr]">
            <Surface className="p-4 sm:p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-sm font-medium">India · coverage by state</h2>
                <Legend maxAcres={maxAcres} />
              </div>

              <IndiaMap states={data.states} selected={selected} onSelect={setSelected} />

              {selected ? (
                <button
                  onClick={() => setSelected(null)}
                  className="mt-3 text-xs text-fg-muted underline underline-offset-4 hover:text-fg"
                >
                  Clear selection
                </button>
              ) : (
                <p className="mt-3 text-xs text-fg-subtle">
                  Click a shaded state to see its districts.
                </p>
              )}
            </Surface>

            <Surface className="p-5">
              <h2 className="text-sm font-medium">
                {selected ? `${selected} · districts` : "Districts by acres"}
              </h2>
              <p className="mt-1 text-xs text-fg-subtle">
                Top {districts.length}
                {selected ? ` in ${selected}` : " across India"}.
              </p>

              <ul className="mt-3 divide-y divide-border">
                {districts.length === 0 ? (
                  <li className="py-4 text-sm text-fg-muted">
                    No completed work in {selected} yet.
                  </li>
                ) : (
                  districts.map((district) => (
                    <li
                      key={district.id}
                      className="flex items-baseline justify-between gap-3 py-2.5 text-sm"
                    >
                      <span className="min-w-0">
                        <span className="font-medium">{district.name}</span>
                        <span className="text-fg-subtle"> · {district.state}</span>
                        {district.providers > 0 ? (
                          <span className="ml-2 rounded-full bg-neutral-bg px-1.5 py-0.5 text-[11px] text-fg-muted">
                            {district.providers} provider{district.providers === 1 ? "" : "s"}
                          </span>
                        ) : null}
                      </span>
                      <span className="tabular shrink-0 font-medium">
                        {num(district.acresCovered)} acres
                      </span>
                    </li>
                  ))
                )}
              </ul>
            </Surface>
          </div>

          <Surface className="p-5">
            <h2 className="text-sm font-medium">Providers by delivery</h2>
            <p className="mt-1 text-xs text-fg-subtle">
              {data.totals.providersActive - deliveringProviders.length > 0
                ? `${data.totals.providersActive - deliveringProviders.length} activated provider${
                    data.totals.providersActive - deliveringProviders.length === 1 ? " is" : "s are"
                  } not delivering yet.`
                : "Every activated provider has delivered work."}
            </p>

            <ul className="mt-3 divide-y divide-border">
              {deliveringProviders.length === 0 ? (
                <li className="py-4 text-sm text-fg-muted">No completed work yet.</li>
              ) : (
                deliveringProviders.map((provider) => (
                  <li
                    key={provider.name}
                    className="flex items-baseline justify-between gap-3 py-2.5 text-sm"
                  >
                    <span className="min-w-0 truncate font-medium">{provider.name}</span>
                    <span className="tabular flex shrink-0 gap-4 text-fg-muted">
                      <span>
                        {provider.jobs} job{provider.jobs === 1 ? "" : "s"}
                      </span>
                      <span>{num(provider.acresCovered)} acres</span>
                      <span>
                        {provider.drones} drone{provider.drones === 1 ? "" : "s"}
                      </span>
                    </span>
                  </li>
                ))
              )}
            </ul>
          </Surface>
        </div>
      )}
    </Page>
  );
}

export default function CoveragePage() {
  return (
    <RequireAuth>
      <RequireRole kind="PLATFORM" role="ADMIN">
        <CoverageContent />
      </RequireRole>
    </RequireAuth>
  );
}
