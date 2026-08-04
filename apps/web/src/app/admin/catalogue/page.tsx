"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, FormError, SelectField } from "@/components/ui/form";
import { StatusPill } from "@/components/ui/status-pill";
import { EmptyState, Page, PageHeader, Surface } from "@/components/ui/surface";
import { ApiError } from "@/core/api/client";
import type { Area, ServiceType } from "@/core/api/types";
import { RequireAuth } from "@/core/auth/require-auth";
import * as catalogue from "@/features/admin/catalogue-api";

const PRICING_UNITS = ["PER_ACRE", "PER_SQ_KM", "PER_HOUR", "PER_DAY", "PER_ASSET"];

const unitLabel = (u: string) => u.replace("PER_", "per ").toLowerCase().replace("_", " ");

/**
 * The screen that makes S5 checkable.
 *
 * Adding "Aerial survey" here is a row in a table, and it is immediately
 * offerable by every provider and bookable by every customer — no deploy, no
 * migration, no code change. That claim has been in the architecture from the
 * start; until this screen existed there was no way to test it through the
 * product.
 */
function Catalogue() {
  const [services, setServices] = useState<ServiceType[]>([]);
  const [states, setStates] = useState<Area[]>([]);
  const [districts, setDistricts] = useState<Area[]>([]);
  const [openState, setOpenState] = useState<Area | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [addingService, setAddingService] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [unit, setUnit] = useState(PRICING_UNITS[0]);

  const [addingArea, setAddingArea] = useState(false);
  const [areaName, setAreaName] = useState("");

  const loadServices = () => catalogue.listServiceTypes().then(setServices);

  useEffect(() => {
    let cancelled = false;

    Promise.all([catalogue.listServiceTypes(), catalogue.listAreas()])
      .then(([types, topLevel]) => {
        if (cancelled) return;
        setServices(types);
        setStates(topLevel);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setError(caught instanceof ApiError ? caught.message : "Could not load the catalogue");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
      setAddingService(false);
      setAddingArea(false);
      setCode("");
      setName("");
      setAreaName("");
    } catch (caught: unknown) {
      setError(caught instanceof ApiError ? caught.message : "That did not go through");
    } finally {
      setBusy(false);
    }
  };

  const openDistricts = async (state: Area) => {
    setOpenState(state);
    setDistricts([]);
    setError(null);
    try {
      setDistricts(await catalogue.listAreas(state.id));
    } catch (caught: unknown) {
      setError(caught instanceof ApiError ? caught.message : "Could not load districts");
    }
  };

  return (
    <Page size="console">
      <PageHeader
        title="Catalogue"
        description="What the platform sells, and where. Reference data — retired, never deleted."
      />

      <FormError message={error} />

      {loading ? (
        <p className="text-sm text-fg-subtle">Loading…</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <section>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-sm font-medium">Service types</h2>
              {!addingService ? (
                <Button size="console" onClick={() => setAddingService(true)}>
                  Add a service
                </Button>
              ) : null}
            </div>

            {addingService ? (
              <Surface className="mb-3 p-4">
                <div className="space-y-3">
                  <Field
                    label="Code"
                    hint="UPPER_SNAKE_CASE. Permanent — this is what the rest of the system keys on."
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z_]/g, "_"))}
                    placeholder="AERIAL_SURVEY"
                  />
                  <Field
                    label="Name"
                    hint="What customers see."
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Aerial survey"
                  />
                  <SelectField
                    label="Priced by"
                    hint="Permanent. Changing it later would reinterpret every price already quoted."
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                  >
                    {PRICING_UNITS.map((u) => (
                      <option key={u} value={u}>
                        {unitLabel(u)}
                      </option>
                    ))}
                  </SelectField>
                  <div className="flex gap-2">
                    <Button variant="ghost" className="flex-1" onClick={() => setAddingService(false)}>
                      Cancel
                    </Button>
                    <Button
                      variant="primary"
                      className="flex-1"
                      disabled={code.length < 3 || name.trim().length < 2 || busy}
                      onClick={() =>
                        void run(async () => {
                          await catalogue.createServiceType({
                            code,
                            name: name.trim(),
                            pricingUnit: unit,
                          });
                          await loadServices();
                        })
                      }
                    >
                      Add
                    </Button>
                  </div>
                </div>
              </Surface>
            ) : null}

            <ul className="divide-y divide-border rounded-surface border border-border">
              {services.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{s.name}</p>
                    <p className="tabular truncate text-xs text-fg-subtle">
                      {s.code} · {unitLabel(s.pricingUnit)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <StatusPill tone={s.status === "ACTIVE" ? "success" : "neutral"} size="console">
                      {s.status === "ACTIVE" ? "Active" : "Retired"}
                    </StatusPill>
                    <Button
                      size="console"
                      variant="ghost"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await catalogue.updateServiceType(s.id, {
                            status: s.status === "ACTIVE" ? "RETIRED" : "ACTIVE",
                          });
                          await loadServices();
                        })
                      }
                    >
                      {s.status === "ACTIVE" ? "Retire" : "Restore"}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-sm font-medium">
                Areas{openState ? ` · ${openState.name}` : ""}
              </h2>
              {openState && !addingArea ? (
                <Button size="console" onClick={() => setAddingArea(true)}>
                  Add a district
                </Button>
              ) : null}
            </div>

            {addingArea && openState ? (
              <Surface className="mb-3 p-4">
                <div className="space-y-3">
                  <Field
                    label={`District in ${openState.name}`}
                    value={areaName}
                    onChange={(e) => setAreaName(e.target.value)}
                    placeholder="Nizamabad"
                  />
                  <div className="flex gap-2">
                    <Button variant="ghost" className="flex-1" onClick={() => setAddingArea(false)}>
                      Cancel
                    </Button>
                    <Button
                      variant="primary"
                      className="flex-1"
                      disabled={areaName.trim().length < 2 || busy}
                      onClick={() =>
                        void run(async () => {
                          await catalogue.createArea({
                            parentId: openState.id,
                            level: "DISTRICT",
                            name: areaName.trim(),
                          });
                          await openDistricts(openState);
                        })
                      }
                    >
                      Add
                    </Button>
                  </div>
                </div>
              </Surface>
            ) : null}

            {states.length === 0 ? (
              <EmptyState title="No areas yet" />
            ) : (
              <div className="rounded-surface border border-border">
                <ul className="divide-y divide-border">
                  {states.map((state) => (
                    <li key={state.id}>
                      <button
                        onClick={() => void openDistricts(state)}
                        className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-neutral-bg ${
                          openState?.id === state.id ? "bg-neutral-bg font-medium" : ""
                        }`}
                      >
                        {state.name}
                        <span className="text-xs text-fg-subtle">
                          {openState?.id === state.id ? "▾" : "▸"}
                        </span>
                      </button>

                      {openState?.id === state.id ? (
                        <ul className="divide-y divide-border border-t border-border bg-bg-sunken">
                          {districts.length === 0 ? (
                            <li className="px-4 py-2.5 text-xs text-fg-subtle">
                              No districts under {state.name} yet.
                            </li>
                          ) : (
                            districts.map((d) => (
                              <li
                                key={d.id}
                                className="flex items-center justify-between px-4 py-2 pl-8 text-sm"
                              >
                                {d.name}
                                {d.status !== "ACTIVE" ? (
                                  <StatusPill tone="neutral" size="console">
                                    Retired
                                  </StatusPill>
                                ) : null}
                              </li>
                            ))
                          )}
                        </ul>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        </div>
      )}

      <p className="mt-4 text-xs text-fg-subtle">
        A service type added here is immediately offerable by every provider and bookable by every
        customer — no deployment. Retiring one hides it from new offerings and bookings; everything
        already referencing it keeps working.
      </p>
    </Page>
  );
}

export default function AdminCataloguePage() {
  return (
    <RequireAuth>
      <Catalogue />
    </RequireAuth>
  );
}
