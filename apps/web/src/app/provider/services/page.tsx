"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, FormError, SelectField } from "@/components/ui/form";
import { CardListSkeleton } from "@/components/ui/skeleton";
import { StatusPill } from "@/components/ui/status-pill";
import { cardGrid, EmptyState, Page, PageHeader, Surface } from "@/components/ui/surface";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/core/api/client";
import type { Area, Offering, OfferingVersion, ServiceType } from "@/core/api/types";
import { RequireAuth, RequireRole } from "@/core/auth/require-auth";
import { rupees } from "@/features/bookings/format";
import * as catalogueApi from "@/features/catalogue/api";
import * as offeringsApi from "@/features/provider/offerings-api";
import type { Inclusion, OfferingTerms } from "@/features/provider/offerings-api";
import {
  ALL_INCLUSIONS,
  INCLUSION_LABEL,
  toMinor,
  toRupees,
  unitLabel,
  versionRange,
} from "@/features/provider/offerings-format";

type Panel = { id: string; kind: "reprice" | "areas" | "history" } | null;

/** Terms as the form holds them — strings, because inputs deal in strings. */
type TermsDraft = {
  price: string;
  minQuantity: string;
  inclusions: Inclusion[];
  notes: string;
};

const emptyDraft: TermsDraft = { price: "", minQuantity: "", inclusions: [], notes: "" };

const draftFrom = (version: OfferingVersion): TermsDraft => ({
  price: toRupees(version.unitPriceMinor),
  minQuantity: version.minQuantity ? String(version.minQuantity) : "",
  inclusions: [...version.inclusions],
  notes: version.notes ?? "",
});

const termsFrom = (draft: TermsDraft): OfferingTerms => ({
  unitPriceMinor: toMinor(draft.price),
  ...(draft.minQuantity ? { minQuantity: Number(draft.minQuantity) } : {}),
  ...(draft.inclusions.length ? { inclusions: draft.inclusions } : {}),
  ...(draft.notes.trim() ? { notes: draft.notes.trim() } : {}),
});

/** Districts, grouped under their state. Coverage is chosen at district level. */
function AreaPicker({
  states,
  selected,
  onChange,
}: {
  states: Area[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [openState, setOpenState] = useState<string | null>(null);
  const [districts, setDistricts] = useState<Record<string, Area[]>>({});

  const expand = async (state: Area) => {
    setOpenState(openState === state.id ? null : state.id);

    if (!districts[state.id]) {
      const loaded = await catalogueApi.listAreas(state.id);
      setDistricts((current) => ({ ...current, [state.id]: loaded }));
    }
  };

  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((a) => a !== id) : [...selected, id]);

  return (
    <div className="rounded-control border border-border">
      <ul className="divide-y divide-border">
        {states.map((state) => (
          <li key={state.id}>
            <button
              type="button"
              onClick={() => void expand(state)}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-neutral-bg"
            >
              {state.name}
              <span className="text-xs text-fg-subtle">
                {openState === state.id ? "▾" : "▸"}
              </span>
            </button>

            {openState === state.id ? (
              <div className="flex flex-wrap gap-1.5 border-t border-border bg-bg-sunken p-3">
                {(districts[state.id] ?? []).map((district) => {
                  const on = selected.includes(district.id);

                  return (
                    <button
                      key={district.id}
                      type="button"
                      onClick={() => toggle(district.id)}
                      className={`h-8 rounded-control px-2.5 text-sm ${
                        on
                          ? "bg-accent font-medium text-accent-fg"
                          : "border border-border-strong text-fg-muted hover:text-fg"
                      }`}
                    >
                      {district.name}
                    </button>
                  );
                })}
                {(districts[state.id] ?? []).length === 0 ? (
                  <span className="text-xs text-fg-subtle">Loading districts…</span>
                ) : null}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function TermsFields({
  draft,
  onChange,
  unit,
}: {
  draft: TermsDraft;
  onChange: (next: TermsDraft) => void;
  unit: string;
}) {
  const toggleInclusion = (item: Inclusion) =>
    onChange({
      ...draft,
      inclusions: draft.inclusions.includes(item)
        ? draft.inclusions.filter((i) => i !== item)
        : [...draft.inclusions, item],
    });

  return (
    <>
      <Field
        label={`Price ${unit}`}
        hint="In rupees. This is what a customer sees before they book."
        type="number"
        inputMode="decimal"
        min={1}
        value={draft.price}
        onChange={(e) => onChange({ ...draft, price: e.target.value })}
        placeholder="450"
      />
      <Field
        label="Smallest job you will take (optional)"
        hint="You will not appear in searches below this size."
        type="number"
        inputMode="numeric"
        value={draft.minQuantity}
        onChange={(e) => onChange({ ...draft, minQuantity: e.target.value })}
        placeholder="5"
      />

      <div>
        <span className="mb-1.5 block text-sm font-medium">What your price includes</span>
        <div className="flex flex-wrap gap-1.5">
          {ALL_INCLUSIONS.map((item) => {
            const on = draft.inclusions.includes(item);

            return (
              <button
                key={item}
                type="button"
                onClick={() => toggleInclusion(item)}
                className={`h-8 rounded-control px-2.5 text-sm ${
                  on
                    ? "bg-success-bg font-medium text-success"
                    : "border border-border-strong text-fg-muted hover:text-fg"
                }`}
              >
                {INCLUSION_LABEL[item]}
              </button>
            );
          })}
        </div>
        {/* R9: what is NOT included is the thing that causes arguments on site. */}
        <span className="mt-1 block text-xs text-fg-subtle">
          Anything you leave off is shown to customers as not included.
        </span>
      </div>

      <Field
        label="Anything else they should know (optional)"
        value={draft.notes}
        onChange={(e) => onChange({ ...draft, notes: e.target.value })}
        placeholder="Two tanks per acre, dawn spraying only"
      />
    </>
  );
}

function Services() {
  const toast = useToast();

  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([]);
  const [states, setStates] = useState<Area[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const [newServiceTypeId, setNewServiceTypeId] = useState("");
  const [newDraft, setNewDraft] = useState<TermsDraft>(emptyDraft);
  const [newAreas, setNewAreas] = useState<string[]>([]);

  const [panel, setPanel] = useState<Panel>(null);
  const [draft, setDraft] = useState<TermsDraft>(emptyDraft);
  const [areaDraft, setAreaDraft] = useState<string[]>([]);
  const [versions, setVersions] = useState<OfferingVersion[] | null>(null);

  const load = () => offeringsApi.listOfferings().then(setOfferings);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      offeringsApi.listOfferings(),
      catalogueApi.listServiceTypes(),
      catalogueApi.listAreas(),
    ])
      .then(([mine, types, topLevel]) => {
        if (cancelled) return;
        setOfferings(mine);
        setServiceTypes(types);
        setStates(topLevel);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setError(caught instanceof ApiError ? caught.message : "Could not load your services");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const run = async (key: string, work: () => Promise<unknown>, done?: string) => {
    setBusy(key);
    setError(null);
    try {
      await work();
      await load();
      if (done) toast(done);
    } catch (caught: unknown) {
      setError(caught instanceof ApiError ? caught.message : "That did not go through");
    } finally {
      setBusy(null);
    }
  };

  // One active offering per service type is a database rule, so the picker only
  // shows what is still available rather than letting the API refuse.
  const offered = new Set(offerings.filter((o) => o.status === "ACTIVE").map((o) => o.serviceTypeId));
  const available = serviceTypes.filter((t) => !offered.has(t.id));

  const startAdding = () => {
    setAdding(true);
    setNewServiceTypeId(available[0]?.id ?? "");
    setNewDraft(emptyDraft);
    setNewAreas([]);
  };

  const openReprice = (offering: Offering) => {
    // Pre-filled from the current version because publishing is a REPLACEMENT:
    // a blank form would silently drop the minimum and inclusions.
    setPanel({ id: offering.id, kind: "reprice" });
    setDraft(draftFrom(offering.currentVersion));
  };

  const openAreas = (offering: Offering) => {
    setPanel({ id: offering.id, kind: "areas" });
    setAreaDraft(offering.areas.map((a) => a.id));
  };

  const openHistory = async (offering: Offering) => {
    setPanel({ id: offering.id, kind: "history" });
    setVersions(null);
    try {
      const history = await offeringsApi.offeringHistory(offering.id);
      setVersions(history.versions);
    } catch {
      setVersions([]);
    }
  };

  return (
    <Page>
      <PageHeader
        title="My services"
        description="What you sell, what it costs, and where you will travel."
        action={
          !adding && available.length > 0 ? (
            <Button onClick={startAdding}>Offer a service</Button>
          ) : null
        }
      />

      <FormError message={error} />

      {adding ? (
        <Surface className="mb-4 p-4">
          <div className="space-y-3">
            <SelectField
              label="Service"
              value={newServiceTypeId}
              onChange={(e) => setNewServiceTypeId(e.target.value)}
            >
              {available.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name} — priced {unitLabel(type.pricingUnit)}
                </option>
              ))}
            </SelectField>

            <TermsFields
              draft={newDraft}
              onChange={setNewDraft}
              unit={unitLabel(
                serviceTypes.find((t) => t.id === newServiceTypeId)?.pricingUnit ?? "PER_ACRE",
              )}
            />

            <div>
              <span className="mb-1.5 block text-sm font-medium">Where you will travel</span>
              <AreaPicker states={states} selected={newAreas} onChange={setNewAreas} />
              <span className="mt-1 block text-xs text-fg-subtle">
                {newAreas.length === 0
                  ? "Pick at least one district — you only appear in searches for districts you cover."
                  : `${newAreas.length} ${newAreas.length === 1 ? "district" : "districts"} selected`}
              </span>
            </div>

            <div className="flex gap-2">
              <Button variant="ghost" className="flex-1" onClick={() => setAdding(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                className="flex-1"
                disabled={
                  !newServiceTypeId ||
                  Number(newDraft.price) <= 0 ||
                  newAreas.length === 0 ||
                  busy === "create"
                }
                onClick={() =>
                  void run(
                    "create",
                    async () => {
                      await offeringsApi.createOffering({
                        serviceTypeId: newServiceTypeId,
                        areaIds: newAreas,
                        ...termsFrom(newDraft),
                      });
                      setAdding(false);
                    },
                    "You are now listed — customers can find you",
                  )
                }
              >
                {busy === "create" ? "Publishing…" : "Publish"}
              </Button>
            </div>
          </div>
        </Surface>
      ) : null}

      {loading ? (
        <CardListSkeleton count={2} />
      ) : offerings.length === 0 && !adding ? (
        <EmptyState
          title="You are not selling anything yet"
          description="Until you list a service with a price, customers cannot find you in search."
          action={<Button onClick={startAdding}>Offer a service</Button>}
        />
      ) : (
        <ul className={cardGrid}>
          {offerings.map((offering) => {
            const open = panel?.id === offering.id ? panel.kind : null;
            const working = busy === offering.id;
            const version = offering.currentVersion;
            const notIncluded = ALL_INCLUSIONS.filter((i) => !version.inclusions.includes(i));

            return (
              <Surface as="li" key={offering.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{offering.serviceTypeName}</p>
                    <p className="tabular mt-0.5 text-sm text-fg-muted">
                      {rupees(version.unitPriceMinor)} {unitLabel(version.pricingUnit)}
                      {version.minQuantity ? ` · min ${version.minQuantity}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <StatusPill tone={offering.status === "ACTIVE" ? "success" : "neutral"}>
                      {offering.status === "ACTIVE" ? "Listed" : "Withdrawn"}
                    </StatusPill>
                    <span className="tabular text-xs text-fg-subtle">
                      v{version.versionNumber}
                    </span>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border pt-3 text-xs">
                  {version.inclusions.map((item) => (
                    <span
                      key={item}
                      className="rounded-full bg-success-bg px-2 py-0.5 text-success"
                    >
                      {INCLUSION_LABEL[item]} included
                    </span>
                  ))}
                  {notIncluded.map((item) => (
                    <span key={item} className="rounded-full bg-neutral-bg px-2 py-0.5 text-neutral">
                      no {INCLUSION_LABEL[item]?.toLowerCase()}
                    </span>
                  ))}
                </div>

                <p className="mt-2 text-xs text-fg-subtle">
                  {offering.areas.length === 0
                    ? "No districts set — you will not appear in any search."
                    : offering.areas.map((a) => a.name).join(" · ")}
                </p>

                {version.notes ? (
                  <p className="mt-2 text-xs text-fg-muted">{version.notes}</p>
                ) : null}

                {open === "reprice" ? (
                  <div className="mt-4 space-y-3 border-t border-border pt-4">
                    <TermsFields
                      draft={draft}
                      onChange={setDraft}
                      unit={unitLabel(version.pricingUnit)}
                    />
                    {/*
                      BR8, said out loud. A provider hesitating over a price rise
                      is usually worried about the jobs they have already agreed.
                    */}
                    <p className="rounded-control bg-neutral-bg px-3 py-2 text-xs text-fg-muted">
                      Bookings already quoted keep the price they agreed. This only affects new
                      ones.
                    </p>
                    <div className="flex gap-2">
                      <Button variant="ghost" className="flex-1" onClick={() => setPanel(null)}>
                        Cancel
                      </Button>
                      <Button
                        variant="primary"
                        className="flex-1"
                        disabled={Number(draft.price) <= 0 || working}
                        onClick={() =>
                          void run(
                            offering.id,
                            async () => {
                              await offeringsApi.publishVersion(offering.id, termsFrom(draft));
                              setPanel(null);
                            },
                            `New price live — v${version.versionNumber + 1}`,
                          )
                        }
                      >
                        {working ? "Publishing…" : "Publish new terms"}
                      </Button>
                    </div>
                  </div>
                ) : open === "areas" ? (
                  <div className="mt-4 space-y-3 border-t border-border pt-4">
                    <AreaPicker states={states} selected={areaDraft} onChange={setAreaDraft} />
                    <p className="text-xs text-fg-subtle">
                      Changing where you work is not a price change — your version stays the same.
                    </p>
                    <div className="flex gap-2">
                      <Button variant="ghost" className="flex-1" onClick={() => setPanel(null)}>
                        Cancel
                      </Button>
                      <Button
                        variant="primary"
                        className="flex-1"
                        disabled={areaDraft.length === 0 || working}
                        onClick={() =>
                          void run(
                            offering.id,
                            async () => {
                              await offeringsApi.setAreas(offering.id, areaDraft);
                              setPanel(null);
                            },
                            "Coverage updated",
                          )
                        }
                      >
                        Save coverage
                      </Button>
                    </div>
                  </div>
                ) : open === "history" ? (
                  <div className="mt-4 space-y-2 border-t border-border pt-4">
                    {versions === null ? (
                      <p className="text-xs text-fg-subtle">Loading…</p>
                    ) : (
                      versions
                        .slice()
                        .sort((a, b) => b.versionNumber - a.versionNumber)
                        .map((v) => (
                          <div
                            key={v.versionNumber}
                            className="flex items-baseline justify-between gap-3 text-xs"
                          >
                            <span className="tabular text-fg-muted">
                              v{v.versionNumber} · {versionRange(v.effectiveFrom, v.effectiveTo)}
                            </span>
                            <span className="tabular font-medium">
                              {rupees(v.unitPriceMinor)}
                            </span>
                          </div>
                        ))
                    )}
                    <Button size="console" variant="ghost" onClick={() => setPanel(null)}>
                      Close
                    </Button>
                  </div>
                ) : offering.status === "ACTIVE" ? (
                  <div className="mt-4 space-y-2">
                    <Button variant="primary" full onClick={() => openReprice(offering)}>
                      Change price &amp; terms
                    </Button>
                    <div className="flex gap-2">
                      <Button className="flex-1" onClick={() => openAreas(offering)}>
                        Where I work
                      </Button>
                      <Button className="flex-1" onClick={() => void openHistory(offering)}>
                        History
                      </Button>
                      <Button
                        variant="danger"
                        disabled={working}
                        onClick={() =>
                          void run(
                            offering.id,
                            () => offeringsApi.withdrawOffering(offering.id),
                            `${offering.serviceTypeName} withdrawn — existing bookings are unaffected`,
                          )
                        }
                      >
                        Withdraw
                      </Button>
                    </div>
                  </div>
                ) : null}
              </Surface>
            );
          })}
        </ul>
      )}
    </Page>
  );
}

export default function ProviderServicesPage() {
  return (
    <RequireAuth>
      <RequireRole kind="PROVIDER">
        <Services />
      </RequireRole>
    </RequireAuth>
  );
}
