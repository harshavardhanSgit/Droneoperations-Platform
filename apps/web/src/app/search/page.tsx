"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import { FormError } from "@/components/ui/form";
import { ApiError } from "@/core/api/client";
import type { Area, Match, MatchResults, ServiceType } from "@/core/api/types";
import { useAuth } from "@/core/auth/auth-context";
import { RequireAuth } from "@/core/auth/require-auth";
import * as bookingApi from "@/features/bookings/api";
import { rupees, WINDOWS } from "@/features/bookings/format";
import * as catalogueApi from "@/features/catalogue/api";
import * as discoveryApi from "@/features/discovery/api";

const field =
  "w-full rounded-md border border-black/15 bg-white px-3 py-2 text-sm dark:border-white/20 dark:bg-white/5";

function tomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function Search() {
  const router = useRouter();
  const { account } = useAuth();

  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([]);
  const [states, setStates] = useState<Area[]>([]);
  const [districts, setDistricts] = useState<Area[]>([]);

  const [serviceTypeId, setServiceTypeId] = useState("");
  const [stateId, setStateId] = useState("");
  const [areaId, setAreaId] = useState("");
  const [quantity, setQuantity] = useState(20);
  const [date, setDate] = useState(tomorrow());
  const [window_, setWindow] = useState("DAWN");
  const [locationNote, setLocationNote] = useState("");

  const [results, setResults] = useState<MatchResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [types, topLevel] = await Promise.all([
          catalogueApi.listServiceTypes(),
          catalogueApi.listAreas(),
        ]);
        setServiceTypes(types);
        setStates(topLevel);
        if (types[0]) setServiceTypeId(types[0].id);
      } catch (caught) {
        setError(caught instanceof ApiError ? caught.message : "Could not load the catalogue");
      }
    })();
  }, []);

  // Cascading select: districts load only when a state is chosen. The API
  // returns one level at a time on purpose — no whole-tree fetch.
  const loadDistricts = useCallback(async (parent: string) => {
    setAreaId("");
    setDistricts(parent ? await catalogueApi.listAreas(parent) : []);
  }, []);

  async function onSearch(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setResults(null);
    setBusy("search");

    try {
      setResults(await discoveryApi.findMatches({ serviceTypeId, areaId, quantity }));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Search failed");
    } finally {
      setBusy(null);
    }
  }

  async function book(match: Match) {
    setError(null);
    setBusy(match.offeringId);

    try {
      const booking = await bookingApi.createBooking({
        serviceTypeId,
        areaId,
        quantity,
        preferredDate: date,
        preferredWindow: window_,
        offeringId: match.offeringId,
        ...(locationNote.trim() ? { locationNote: locationNote.trim() } : {}),
      });
      router.push(`/bookings/${booking.id}`);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not create the booking");
      setBusy(null);
    }
  }

  if (account && account.organisation.kind !== "CUSTOMER") {
    return (
      <main className="mx-auto w-full max-w-lg px-6 py-20 text-sm text-black/60 dark:text-white/60">
        Only customer accounts can book services.
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-14">
      <h1 className="text-xl font-semibold tracking-tight">Book a service</h1>
      <p className="mt-1 mb-8 text-sm text-black/50 dark:text-white/50">
        Tell us the job. We&apos;ll show who can do it and what it costs.
      </p>

      <form
        onSubmit={onSearch}
        className="space-y-4 rounded-lg border border-black/10 p-5 dark:border-white/15"
      >
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Service</span>
          <select
            className={field}
            value={serviceTypeId}
            onChange={(e) => setServiceTypeId(e.target.value)}
          >
            {serviceTypes.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name} — priced {type.pricingUnit.replace("PER_", "per ").toLowerCase()}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">State</span>
            <select
              className={field}
              value={stateId}
              onChange={(e) => {
                setStateId(e.target.value);
                void loadDistricts(e.target.value);
              }}
            >
              <option value="">Choose…</option>
              {states.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">District</span>
            <select
              className={field}
              value={areaId}
              onChange={(e) => setAreaId(e.target.value)}
              disabled={!districts.length}
            >
              <option value="">Choose…</option>
              {districts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Quantity</span>
            <input
              type="number"
              min={1}
              className={field}
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Date</span>
            <input
              type="date"
              className={field}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Time</span>
            <select className={field} value={window_} onChange={(e) => setWindow(e.target.value)}>
              {WINDOWS.map((w) => (
                <option key={w} value={w}>
                  {w.charAt(0) + w.slice(1).toLowerCase()}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Where exactly (optional)</span>
          <input
            className={field}
            placeholder="Field behind the water tank, Kothapally village"
            value={locationNote}
            onChange={(e) => setLocationNote(e.target.value)}
          />
        </label>

        <button
          type="submit"
          disabled={!serviceTypeId || !areaId || busy === "search"}
          className="w-full rounded-md bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          {busy === "search" ? "Searching…" : "Find providers"}
        </button>
      </form>

      <div className="mt-6">
        <FormError message={error} />
      </div>

      {results ? (
        <section className="mt-6">
          <h2 className="mb-3 text-sm font-medium">
            {results.total} provider{results.total === 1 ? "" : "s"} for {results.quantity}{" "}
            {results.pricingUnit.replace("PER_", "").toLowerCase()} of {results.serviceTypeName}
          </h2>

          {results.total === 0 ? (
            <p className="rounded-lg border border-black/10 px-4 py-8 text-center text-sm text-black/45 dark:border-white/15 dark:text-white/45">
              Nobody covers this area for that quantity yet.
            </p>
          ) : (
            <ul className="space-y-3">
              {results.matches.map((match) => (
                <li
                  key={match.offeringId}
                  className="rounded-lg border border-black/10 p-4 dark:border-white/15"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium">{match.provider.name}</p>
                      <p className="text-xs text-black/45 dark:text-white/45">
                        {match.provider.city ? `${match.provider.city} · ` : ""}
                        serves {match.matchedArea}
                        {match.minQuantity ? ` · minimum ${match.minQuantity}` : ""}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-semibold">{rupees(match.price.estimatedTotalMinor)}</p>
                      <p className="text-xs text-black/45 dark:text-white/45">
                        {rupees(match.price.unitPriceMinor)} ×{results.quantity}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
                    {match.included.map((item) => (
                      <span
                        key={item}
                        className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-emerald-700 dark:text-emerald-400"
                      >
                        {item.toLowerCase()} included
                      </span>
                    ))}
                    {match.notIncluded.map((item) => (
                      <span
                        key={item}
                        className="rounded-full bg-black/5 px-2 py-0.5 text-black/45 dark:bg-white/10 dark:text-white/45"
                      >
                        no {item.toLowerCase()}
                      </span>
                    ))}
                  </div>

                  {match.notes ? (
                    <p className="mt-2 text-xs text-black/50 dark:text-white/50">{match.notes}</p>
                  ) : null}

                  <button
                    onClick={() => void book(match)}
                    disabled={busy !== null}
                    className="mt-4 w-full rounded-md bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
                  >
                    {busy === match.offeringId ? "Booking…" : "Book this provider"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </main>
  );
}

export default function SearchPage() {
  return (
    <RequireAuth>
      <Search />
    </RequireAuth>
  );
}
