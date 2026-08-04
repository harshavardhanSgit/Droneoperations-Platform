"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import { FormError } from "@/components/ui/form";
import { Page } from "@/components/ui/surface";
import { ApiError } from "@/core/api/client";
import type {
  Area,
  Match,
  MatchResults,
  ProviderRating,
  ServiceType,
} from "@/core/api/types";
import { useAuth } from "@/core/auth/auth-context";
import { RequireAuth } from "@/core/auth/require-auth";
import * as bookingApi from "@/features/bookings/api";
import { rupees, WINDOWS } from "@/features/bookings/format";
import * as catalogueApi from "@/features/catalogue/api";
import * as discoveryApi from "@/features/discovery/api";
import { getProviderRating } from "@/features/discovery/reviews-api";

const field =
  "h-11 w-full rounded-control border border-border-strong bg-bg px-3 text-[15px] outline-none focus:border-accent";

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

  const [sort, setSort] = useState<discoveryApi.MatchSort>("PRICE_ASC");
  const [openReviews, setOpenReviews] = useState<string | null>(null);
  const [reviews, setReviews] = useState<ProviderRating | null>(null);
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
      setResults(await discoveryApi.findMatches({ serviceTypeId, areaId, quantity, sort }));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Search failed");
    } finally {
      setBusy(null);
    }
  }

  async function toggleReviews(providerId: string) {
    if (openReviews === providerId) {
      setOpenReviews(null);
      return;
    }

    setOpenReviews(providerId);
    setReviews(null);

    try {
      setReviews(await getProviderRating(providerId));
    } catch {
      // A profile that will not load must not break the booking flow. The
      // customer can still see price and inclusions and book.
      setReviews({ providerId, count: 0, reviews: [] });
    }
  }

  // Re-sorting asks the server rather than reordering in the browser. The
  // ranking rule — unrated providers last, price breaking ties — belongs in one
  // place, and duplicating it here is how two sort orders start to disagree.
  async function resort(next: discoveryApi.MatchSort) {
    setSort(next);
    if (!results) return;

    setBusy("search");
    try {
      setResults(await discoveryApi.findMatches({ serviceTypeId, areaId, quantity, sort: next }));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not re-sort");
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
      <Page size="form">
        <p className="text-sm text-fg-muted">Only customer accounts can book services.</p>
      </Page>
    );
  }

  return (
    <Page>
      <h1 className="text-xl font-semibold tracking-tight">Book a service</h1>
      <p className="mt-1 mb-8 text-sm text-fg-subtle">
        Tell us the job. We&apos;ll show who can do it and what it costs.
      </p>

      <form
        onSubmit={onSearch}
        className="space-y-4 rounded-surface border border-border p-5"
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
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-medium">
              {results.total} provider{results.total === 1 ? "" : "s"} for {results.quantity}{" "}
              {results.pricingUnit.replace("PER_", "").toLowerCase()} of {results.serviceTypeName}
            </h2>

            {results.total > 1 ? (
              <label className="flex items-center gap-2 text-xs text-fg-muted">
                Sort by
                <select
                  value={sort}
                  onChange={(e) => void resort(e.target.value as discoveryApi.MatchSort)}
                  disabled={busy !== null}
                  className="h-8 rounded-control border border-border-strong bg-bg px-2 text-sm text-fg"
                >
                  <option value="PRICE_ASC">Cheapest first</option>
                  <option value="PRICE_DESC">Most expensive first</option>
                  <option value="RATING_DESC">Best rated first</option>
                </select>
              </label>
            ) : null}
          </div>

          {results.total === 0 ? (
            <p className="rounded-surface border border-dashed border-border px-4 py-8 text-center text-sm text-fg-muted">
              Nobody covers this area for that quantity yet.
            </p>
          ) : (
            <ul className="space-y-3">
              {results.matches.map((match) => (
                <li
                  key={match.offeringId}
                  className="rounded-surface border border-border p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-medium">{match.provider.name}</p>
                      {/*
                        A provider with no reviews reads "New", never a rating of
                        zero — an unknown is not a bad score, and the review count
                        is shown because 5.0 from one customer and 4.6 from forty
                        are not the same claim.
                      */}
                      <p className="mt-0.5 text-xs">
                        {match.provider.rating != null ? (
                          <button
                            onClick={() => void toggleReviews(match.provider.providerId)}
                            className="tabular text-fg underline decoration-border underline-offset-2 hover:decoration-fg"
                          >
                            ★ {match.provider.rating.toFixed(1)}{" "}
                            <span className="text-fg-subtle">
                              ({match.provider.ratingCount}{" "}
                              {match.provider.ratingCount === 1 ? "review" : "reviews"})
                            </span>
                          </button>
                        ) : (
                          <span className="text-fg-subtle">New — no reviews yet</span>
                        )}
                      </p>
                      <p className="mt-0.5 text-xs text-fg-subtle">
                        {match.provider.city ? `${match.provider.city} · ` : ""}
                        serves {match.matchedArea}
                        {match.minQuantity ? ` · minimum ${match.minQuantity}` : ""}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="tabular font-semibold">
                        {rupees(match.price.estimatedTotalMinor)}
                      </p>
                      <p className="tabular text-xs text-fg-subtle">
                        {rupees(match.price.unitPriceMinor)} ×{results.quantity}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
                    {match.included.map((item) => (
                      <span
                        key={item}
                        className="rounded-full bg-success-bg px-2 py-0.5 text-success"
                      >
                        {item.toLowerCase()} included
                      </span>
                    ))}
                    {match.notIncluded.map((item) => (
                      <span
                        key={item}
                        className="rounded-full bg-neutral-bg px-2 py-0.5 text-neutral"
                      >
                        no {item.toLowerCase()}
                      </span>
                    ))}
                  </div>

                  {match.notes ? (
                    <p className="mt-2 text-xs text-fg-muted">{match.notes}</p>
                  ) : null}

                  {openReviews === match.provider.providerId ? (
                    <div className="mt-3 border-t border-border pt-3">
                      {reviews === null ? (
                        <p className="text-xs text-fg-subtle">Loading reviews…</p>
                      ) : reviews.reviews.length === 0 ? (
                        <p className="text-xs text-fg-subtle">No written reviews yet.</p>
                      ) : (
                        <ul className="space-y-2">
                          {reviews.reviews.slice(0, 5).map((review) => (
                            <li key={review.id} className="text-xs">
                              <p className="tabular text-fg">
                                {"★".repeat(review.rating)}
                                <span className="text-fg-subtle">
                                  {"★".repeat(5 - review.rating)}
                                </span>{" "}
                                <span className="text-fg-muted">{review.customerName}</span>
                              </p>
                              {review.comment ? (
                                <p className="mt-0.5 text-fg-muted">{review.comment}</p>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ) : null}

                  <button
                    onClick={() => void book(match)}
                    disabled={busy !== null}
                    className="mt-4 h-11 w-full rounded-control bg-accent px-3 text-[15px] font-medium text-accent-fg disabled:opacity-45"
                  >
                    {busy === match.offeringId ? "Booking…" : "Book this provider"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </Page>
  );
}

export default function SearchPage() {
  return (
    <RequireAuth>
      <Search />
    </RequireAuth>
  );
}
