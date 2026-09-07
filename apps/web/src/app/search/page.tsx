"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";

import { MapPicker, type MapMarker, type PickedLocation } from "@/components/map-picker";
import { Button } from "@/components/ui/button";
import { Field, fieldBase, FormError, SelectField } from "@/components/ui/form";
import { CardListSkeleton } from "@/components/ui/skeleton";
import { EmptyState, Page, PageHeader, Surface } from "@/components/ui/surface";
import { ApiError } from "@/core/api/client";
import type {
  Area,
  BookingDetail,
  Match,
  MatchResults,
  ProviderRating,
  ServiceType,
} from "@/core/api/types";
import { useAuth } from "@/core/auth/auth-context";
import { RequireAuth } from "@/core/auth/require-auth";
import * as bookingApi from "@/features/bookings/api";
import { distanceLabel, rupees, shortDate, windowLabel, WINDOWS } from "@/features/bookings/format";
import * as customerApi from "@/features/auth/customer-api";
import * as catalogueApi from "@/features/catalogue/api";
import { resolveAreaFromPin } from "@/features/catalogue/resolve-area";
import * as discoveryApi from "@/features/discovery/api";
import { getProviderRating } from "@/features/discovery/reviews-api";
import { INCLUSION_LABEL } from "@/features/provider/offerings-format";

function tomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * A Nominatim display_name is a full postal address ("Mandi Bazar Rd, Subedari, Hanamkonda,
 * Warangal, Telangana, 506002, India") — too long for a note the provider reads in a list.
 */
function shortLabel(label: string): string {
  return label
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(", ");
}

const unitNoun = (pricingUnit: string) => pricingUnit.replace("PER_", "").toLowerCase();

const inclusionWords = (items: string[]) =>
  items.map((item) => (INCLUSION_LABEL[item] ?? item).toLowerCase()).join(", ");

/** Which result wins on price, distance and rating. */
function standoutMarks(matches: Match[]): Map<string, string[]> {
  const marks = new Map<string, string[]>();

  // "Cheapest of one" is not a fact about anything.
  if (matches.length < 2) return marks;

  const award = (
    label: string,
    valueOf: (m: Match) => number | undefined,
    beats: (a: number, b: number) => boolean,
  ) => {
    let best: number | undefined;
    let winners: string[] = [];

    for (const match of matches) {
      const value = valueOf(match);
      if (value === undefined) continue;

      if (best === undefined || beats(value, best)) {
        best = value;
        winners = [match.offeringId];
      } else if (value === best) {
        winners.push(match.offeringId);
      }
    }

    // A mark two providers share differentiates nothing; it is decoration.
    if (winners.length !== 1) return;
    const id = winners[0]!;
    marks.set(id, [...(marks.get(id) ?? []), label]);
  };

  award("Cheapest", (m) => m.price.estimatedTotalMinor, (a, b) => a < b);
  award("Nearest", (m) => m.provider.distanceKm, (a, b) => a < b);
  // 5.0 from a single customer is not "best rated".
  award(
    "Best rated",
    (m) => (m.provider.ratingCount >= 3 ? m.provider.rating : undefined),
    (a, b) => a > b,
  );

  return marks;
}

function Search() {
  const router = useRouter();
  const { account } = useAuth();

  /**
   * D9. A rejected booking keeps its requirement, quote history and timeline, so choosing
   * another provider must ASSIGN to that booking — not create a second one. The id arrives as
   * ?reassign=<bookingId>; while it is set the requirement is fixed and only the provider changes.
   */
  const reassignId = useSearchParams().get("reassign");
  const [reassigning, setReassigning] = useState<BookingDetail | null>(null);
  // The search runs itself once the booking has filled the form in. Guarded so a re-sort or a
  // later render cannot trigger a second automatic search.
  const autoSearched = useRef(false);

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
  // The field's exact spot, picked on the map.
  const [point, setPoint] = useState<{ latitude: number; longitude: number } | null>(null);
  // The pin's own place name, kept apart from locationNote because the customer may have
  // replaced that with their own words ("behind the water tank").
  const [pinLabel, setPinLabel] = useState<string | null>(null);
  // Whether the customer has typed their own words into the note.
  const noteEdited = useRef(false);
  // The state/district the pin auto-selected, so "Clear location" can undo exactly that — a
  // select the customer then changed by hand is left alone.
  const pickFilled = useRef<{ stateId?: string; areaId?: string }>({});
  // Picks resolve asynchronously (districts load after the state is known).
  const pickSeq = useRef(0);

  const [sort, setSort] = useState<discoveryApi.MatchSort>("PRICE_ASC");
  const [openReviews, setOpenReviews] = useState<string | null>(null);
  const [reviews, setReviews] = useState<ProviderRating | null>(null);
  const [results, setResults] = useState<MatchResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Whether the form is open.
  const [editing, setEditing] = useState(false);
  // The card the pointer is over, and the one selected from the map.
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const searching = busy === "search";
  const collapsed = results !== null && !editing;
  const active = selected ?? hovered;

  useEffect(() => {
    void (async () => {
      try {
        const [types, topLevel] = await Promise.all([
          catalogueApi.listServiceTypes(),
          catalogueApi.listAreas(),
        ]);
        setServiceTypes(types);
        setStates(topLevel);
        // Not while reassigning: the booking's own service type wins, and picking a different
        // one would produce an offering the API refuses (assertOfferingMatches).
        if (types[0] && !reassignId) setServiceTypeId(types[0].id);
      } catch (caught) {
        setError(caught instanceof ApiError ? caught.message : "Could not load the catalogue");
      }
    })();
  }, [reassignId]);

  /**
   * Reassigning: the requirement comes from the booking, not from the form. Everything the
   * search needs — service, quantity and the field's pin — is already on the booking, so the
   * customer never re-enters it and cannot accidentally pick an offering for a different job.
   */
  useEffect(() => {
    if (!reassignId) return;

    let cancelled = false;

    bookingApi
      .getBooking(reassignId)
      .then((booking) => {
        if (cancelled) return;

        setReassigning(booking);
        setServiceTypeId(booking.serviceTypeId);
        setAreaId(booking.areaId);
        setQuantity(booking.quantity);
        setDate(booking.preferredDate);
        setWindow(booking.preferredWindow);
        if (booking.locationNote) setLocationNote(booking.locationNote);

        if (booking.latitude != null && booking.longitude != null) {
          setPoint({ latitude: booking.latitude, longitude: booking.longitude });
          setPinLabel(booking.locationNote ?? booking.areaName);
        }
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setError(
          caught instanceof ApiError ? caught.message : "Could not load the booking to reassign",
        );
      });

    return () => {
      cancelled = true;
    };
  }, [reassignId]);

  // Cascading select: districts load only when a state is chosen.
  const loadDistricts = useCallback(async (parent: string) => {
    setAreaId("");
    const districts = parent ? await catalogueApi.listAreas(parent) : [];
    setDistricts(districts);
    return districts;
  }, []);

  /** Open on the customer's saved field rather than the middle of India. */
  useEffect(() => {
    // Reassigning uses the booking's own field, not the saved default.
    if (reassignId) return;

    let cancelled = false;

    customerApi
      .getOwnCustomerProfile()
      .then((profile) => {
        if (cancelled) return;
        if (profile.latitude === undefined || profile.longitude === undefined) return;

        setPoint({ latitude: profile.latitude, longitude: profile.longitude });
        setPinLabel(profile.locationLabel ?? "Your saved field");

        // The district select is cascading — it has no options until its state is chosen — so
        // the state has to be restored and its districts loaded before the district id means
        // anything.
        if (profile.defaultAreaId && profile.defaultAreaParentId) {
          const stateId = profile.defaultAreaParentId;
          const areaId = profile.defaultAreaId;

          setStateId(stateId);
          void loadDistricts(stateId).then(() => {
            if (!cancelled) setAreaId(areaId);
          });
        }
      })
      .catch(() => {
        // No saved field, or it would not load. Either way the page works
        // exactly as it did before — this is a convenience, not a dependency.
      });

    return () => {
      cancelled = true;
    };
    // Runs ONCE, on mount. loadDistricts is a stable useCallback with no deps,
    // so listing it would change nothing — but including it invites someone to
    // add a real dependency later and turn a one-time restore into a loop that
    // overwrites whatever the customer has since chosen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reassignId]);

  /**
   * A picked pin is a precise answer — carry it into the State and District selects so the
   * customer does not re-type what the map already knows.
   */
  const fillFromPin = useCallback(
    async (location: PickedLocation) => {
      const seq = ++pickSeq.current;
      const resolved = await resolveAreaFromPin(location, states);

      // Superseded by a newer pick, or by the customer choosing a state by hand while this was
      // in flight.
      if (seq !== pickSeq.current) return;
      if (!resolved.stateId) return; // outside the catalogue — leave the selects alone

      setStateId(resolved.stateId);
      // Straight from the resolver rather than a second fetch: it already loaded exactly the
      // rows this select needs.
      setDistricts(resolved.districts);
      setAreaId(resolved.areaId ?? "");

      pickFilled.current = resolved.areaId
        ? { stateId: resolved.stateId, areaId: resolved.areaId }
        : { stateId: resolved.stateId };
    },
    [states],
  );

  async function runSearch(next: discoveryApi.MatchSort, options: { fresh: boolean }) {
    if (!point) return;

    setError(null);
    setBusy("search");
    // A fresh search invalidates the old rows entirely; a re-sort keeps them on screen and dims
    // them.
    if (options.fresh) {
      setResults(null);
      setSelected(null);
      setHovered(null);
    }

    try {
      setResults(
        await discoveryApi.findMatches({
          serviceTypeId,
          quantity,
          sort: next,
          latitude: point.latitude,
          longitude: point.longitude,
          ...(areaId ? { areaId } : {}),
        }),
      );
      setEditing(false);
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : options.fresh ? "Search failed" : "Could not re-sort",
      );
    } finally {
      setBusy(null);
    }
  }

  async function onSearch(event: FormEvent) {
    event.preventDefault();
    await runSearch(sort, { fresh: true });
  }

  /**
   * Reassigning has nothing to fill in, so the search runs itself as soon as the booking has
   * supplied the service and the pin. `autoSearched` makes it once, not once per render.
   */
  useEffect(() => {
    if (!reassigning || autoSearched.current) return;
    if (!serviceTypeId || !point) return;

    autoSearched.current = true;
    void runSearch(sort, { fresh: true });
    // runSearch closes over form state that is already settled by this point, and listing it
    // would re-run the search on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reassigning, serviceTypeId, point]);

  // Re-sorting asks the server rather than reordering in the browser.
  async function resort(next: discoveryApi.MatchSort) {
    setSort(next);
    if (!results) return;
    await runSearch(next, { fresh: false });
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
      // A profile that will not load must not break the booking flow.
      setReviews({ providerId, count: 0, reviews: [] });
    }
  }

  /**
   * The API envelope carries per-field reasons ("longitude must have no more than 7 decimal
   * places") under details.fields, but its top-level message is the bare "Validation failed".
   */
  function validationDetail(caught: ApiError): string | null {
    const fields = caught.details?.fields as Record<string, string[]> | undefined;
    if (!fields) return null;
    const reasons = Object.entries(fields).flatMap(([field, messages]) =>
      messages.map((message) => `${field}: ${message}`),
    );
    return reasons.length ? reasons.join("; ") : null;
  }

  async function book(match: Match) {
    setError(null);
    setBusy(match.offeringId);

    try {
      // D9: an existing booking is ASSIGNED to, never recreated. Creating a second booking
      // would strand the first one and lose the record of who already declined it.
      const booking = reassignId
        ? await bookingApi.assignProvider(reassignId, match.offeringId)
        : await bookingApi.createBooking({
            serviceTypeId,
            areaId,
            quantity,
            preferredDate: date,
            preferredWindow: window_,
            offeringId: match.offeringId,
            ...(locationNote.trim() ? { locationNote: locationNote.trim() } : {}),
            ...(point ? { latitude: point.latitude, longitude: point.longitude } : {}),
          });

      router.push(`/bookings/${booking.id}`);
    } catch (caught) {
      const detail = caught instanceof ApiError ? validationDetail(caught) : null;
      setError(
        caught instanceof ApiError
          ? detail
            ? `${caught.message}: ${detail}`
            : caught.message
          : reassignId
            ? "Could not assign this provider"
            : "Could not create the booking",
      );
      setBusy(null);
    }
  }

  /** Result markers, keyed by PROVIDER rather than by offering. */
  const markers = useMemo<MapMarker[]>(() => {
    const byProvider = new Map<string, MapMarker>();

    for (const match of results?.matches ?? []) {
      const p = match.provider;
      if (p.approxLatitude === undefined || p.approxLongitude === undefined) continue;
      if (byProvider.has(p.providerId)) continue; // first wins; matches arrive sorted

      byProvider.set(p.providerId, {
        id: p.providerId,
        latitude: p.approxLatitude,
        longitude: p.approxLongitude,
        label: p.distanceKm !== undefined ? distanceLabel(p.distanceKm) : p.name,
        title: `${p.name} — approximate area`,
      });
    }

    return [...byProvider.values()];
  }, [results]);

  /**
   * Providers who already turned THIS booking down, and why.
   *
   * Discovery matches on service, area and distance — it knows nothing about one booking's
   * history, so a provider who declined an hour ago comes back in the results. Asking them
   * again is legitimate (they may be free now), so they are kept in the list and labelled
   * rather than hidden: the customer decides, but not blindly.
   */
  const declined = useMemo(() => {
    const byProvider = new Map<string, string | null>();

    for (const assignment of reassigning?.assignments ?? []) {
      if (assignment.status !== "REJECTED") continue;
      byProvider.set(assignment.providerId, assignment.rejectionReason ?? null);
    }

    return byProvider;
  }, [reassigning]);

  /** offeringId → providerId, so card hover can address a marker. */
  const providerOf = useMemo(() => {
    const map = new Map<string, string>();
    for (const match of results?.matches ?? []) map.set(match.offeringId, match.provider.providerId);
    return map;
  }, [results]);

  const marks = useMemo(() => standoutMarks(results?.matches ?? []), [results]);

  const undrawn = (results?.matches ?? []).filter(
    (m) => m.provider.approxLatitude === undefined,
  ).length;

  /** A marker was clicked: select its first card and bring it into view. */
  const focusProvider = useCallback(
    (providerId: string) => {
      const match = results?.matches.find((m) => m.provider.providerId === providerId);
      if (!match) return;

      setSelected(match.offeringId);
      document.getElementById(`match-${match.offeringId}`)?.scrollIntoView({
        // "nearest", not "center": on desktop the card is usually already visible, and yanking
        // the page would be worse than not moving it.
        block: "nearest",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
      });
    },
    [results],
  );

  if (account && account.organisation.kind !== "CUSTOMER") {
    return (
      <Page size="form">
        <p className="text-sm text-fg-muted">Only customer accounts can book services.</p>
      </Page>
    );
  }

  const mapColumn = (
    <div className="lg:sticky lg:top-8">
      <MapPicker
        // Literal strings: Tailwind v4 scans source text, so an interpolated height compiles to
        // no CSS and the map collapses.
        heightClass="h-64 sm:h-80 lg:h-[calc(100dvh-8rem)]"
        initial={point ?? undefined}
        markers={markers}
        highlightedMarkerId={active ? (providerOf.get(active) ?? null) : null}
        onMarkerClick={focusProvider}
        pending={searching}
        fitToMarkers
        onPick={(location: PickedLocation) => {
          setPoint({ latitude: location.latitude, longitude: location.longitude });
          setPinLabel(shortLabel(location.label));
          // The pin is the precise answer; the note stays human.
          if (!noteEdited.current) setLocationNote(shortLabel(location.label));
          void fillFromPin(location);
        }}
        onClear={() => {
          // Removing the pin also removes the coordinates from the booking — and the note it
          // auto-filled, unless the customer replaced it with their own words.
          pickSeq.current++; // a stale district load must not re-fill
          setPoint(null);
          setPinLabel(null);
          // Results framed around a pin that no longer exists is a confusing screen, so they go
          // with it.
          setResults(null);
          setSelected(null);
          setHovered(null);
          setEditing(false);
          // "Nearest first" has nothing to measure from once the pin is gone, and the API
          // refuses that combination.
          setSort((current) => (current === "DISTANCE_ASC" ? "PRICE_ASC" : current));
          if (!noteEdited.current) setLocationNote("");
          const filled = pickFilled.current;
          if (filled.stateId && stateId === filled.stateId) {
            setStateId("");
            setDistricts([]);
          }
          if (filled.areaId && areaId === filled.areaId) setAreaId("");
          pickFilled.current = {};
        }}
      />

      {/*
        Only once there are markers to caveat. MapPicker already prints its own
        "click the map to mark your location" hint, and a second line under it
        saying much the same thing is how people learn to read neither.
      */}
      {markers.length ? (
        <>
          {/*
            A legend, so the two colours are never the only thing telling the
            marks apart — the shapes already differ, and this names them.
            Swatches are inline styles reading the fixed map variables, because
            these colours deliberately sit outside the Tailwind theme.
          */}
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fg-muted">
            <span className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="size-2.5 rounded-full ring-1 ring-white"
                style={{ background: "var(--map-you)" }}
              />
              Your field
            </span>
            <span className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="size-2.5 rounded-full ring-1 ring-white"
                style={{ background: "var(--map-provider)" }}
              />
              Provider
            </span>
          </div>

          <p className="mt-1.5 text-xs text-fg-subtle">
            Provider positions are approximate — accurate to about 5 km, not an exact address.
            {undrawn > 0
              ? ` ${undrawn} provider${undrawn === 1 ? " has" : "s have"} not set a base and cannot be shown.`
              : ""}
          </p>
        </>
      ) : null}
    </div>
  );

  const searchForm = (
    <form id="search-form" onSubmit={onSearch} className="space-y-4">
      <SelectField
        label="Service"
        value={serviceTypeId}
        onChange={(e) => setServiceTypeId(e.target.value)}
      >
        {serviceTypes.map((type) => (
          <option key={type.id} value={type.id}>
            {type.name} — priced {type.pricingUnit.replace("PER_", "per ").toLowerCase()}
          </option>
        ))}
      </SelectField>

      <div className="grid grid-cols-3 gap-3">
        <Field
          label="Quantity"
          type="number"
          min={1}
          value={quantity}
          onChange={(e) => setQuantity(Number(e.target.value))}
        />
        <Field label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <SelectField label="Time" value={window_} onChange={(e) => setWindow(e.target.value)}>
          {WINDOWS.map((w) => (
            <option key={w} value={w}>
              {windowLabel(w)}
            </option>
          ))}
        </SelectField>
      </div>

      <Field
        label="Landmark or directions (optional)"
        placeholder="Behind the water tank"
        value={locationNote}
        onChange={(e) => {
          noteEdited.current = true;
          setLocationNote(e.target.value);
        }}
      />

      {/*
        Not a filter. The pin decides who appears; this pair only names the
        district the booking is filed under, and the pin fills it in.
      */}
      <div className="grid grid-cols-2 gap-3">
        <SelectField
          label="State"
          value={stateId}
          onChange={(e) => {
            // A hand-chosen state must win over an in-flight pin fill, so a still-loading
            // district response cannot clobber it.
            pickSeq.current++;
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
        </SelectField>

        <SelectField
          label="District"
          hint="Filled in from your pin. It does not change who is shown."
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
        </SelectField>
      </div>

      <Button type="submit" variant="primary" full disabled={!serviceTypeId || !point || searching}>
        {searching ? "Searching…" : point ? "Find providers" : "Drop a pin to search"}
      </Button>
    </form>
  );

  const card = (match: Match) => {
    const p = match.provider;
    const cardMarks = marks.get(match.offeringId) ?? [];
    const isActive = active === match.offeringId;
    const unit = results ? unitNoun(results.pricingUnit) : "";

    return (
      <Surface
        as="li"
        key={match.offeringId}
        id={`match-${match.offeringId}`}
        onMouseEnter={() => setHovered(match.offeringId)}
        onMouseLeave={() => setHovered(null)}
        className={`scroll-mt-24 p-4 transition-colors ${
          isActive ? "border-border-strong bg-bg-sunken" : "hover:border-border-strong"
        }`}
      >
        {/*
          A permanent property of the data, so it gets its own typographic
          register — uppercase, tracked, small — rather than a colour. Border
          and background are reserved for hover and selection; conflating "this
          is the cheapest" with "your pointer is here" would make both
          meaningless.
        */}
        {cardMarks.length ? (
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-fg-muted">
            {cardMarks.join(" · ")}
          </p>
        ) : null}

        {declined.has(p.providerId) ? (
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-warning">
            Already declined this job
            {declined.get(p.providerId) ? ` — ${declined.get(p.providerId)}` : ""}
          </p>
        ) : null}

        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-medium">{p.name}</p>

            <p className="mt-0.5 text-sm text-fg-muted">
              {/*
                A provider with no reviews reads "New", never a rating of zero —
                an unknown is not a bad score.
              */}
              {p.rating != null ? (
                <button
                  onClick={() => void toggleReviews(p.providerId)}
                  aria-expanded={openReviews === p.providerId}
                  className="tabular text-fg underline decoration-border underline-offset-2 hover:decoration-fg"
                >
                  ★ {p.rating.toFixed(1)}
                  <span className="text-fg-subtle"> ({p.ratingCount})</span>
                </button>
              ) : (
                <span className="text-fg-subtle">New — no reviews</span>
              )}

              {p.distanceKm !== undefined ? (
                <>
                  {" · "}
                  <span className="tabular">{distanceLabel(p.distanceKm)}</span> away
                </>
              ) : null}
            </p>

            <p className="mt-0.5 text-xs text-fg-subtle">
              {p.city ? `Based in ${p.city}` : "Base not set"}
              {match.minQuantity ? ` · minimum ${match.minQuantity} ${unit}` : ""}
            </p>
          </div>

          <div className="shrink-0 text-right">
            <p className="tabular text-base font-semibold">
              {rupees(match.price.estimatedTotalMinor)}
            </p>
            <p className="tabular mt-0.5 text-xs text-fg-subtle">
              {rupees(match.price.unitPriceMinor)} × {results?.quantity} {unit}
            </p>
          </div>
        </div>

        {/*
          R9. What is NOT included is the thing that causes arguments on site,
          so it is the heaviest text in the lower half of the card — emphasised
          by WEIGHT, not hue. "No chemical" is not a status, and this system
          reserves colour for status; weight also survives greyscale, a
          screenshot forwarded on WhatsApp, and colour blindness.
        */}
        {match.included.length || match.notIncluded.length ? (
          <div className="mt-3 space-y-1 border-t border-border pt-3 text-xs">
            {match.included.length ? (
              <p className="text-fg-subtle">
                Includes <span className="text-fg-muted">{inclusionWords(match.included)}</span>
              </p>
            ) : null}
            <p className="text-fg-subtle">
              {match.notIncluded.length ? (
                <>
                  You supply{" "}
                  <span className="font-medium text-fg">{inclusionWords(match.notIncluded)}</span>
                </>
              ) : (
                <span className="font-medium text-fg">Nothing extra to supply</span>
              )}
            </p>
          </div>
        ) : null}

        {match.notes ? (
          <p className="mt-2 line-clamp-2 text-xs text-fg-muted">{match.notes}</p>
        ) : null}

        {openReviews === p.providerId ? (
          <div className="mt-4 space-y-2 border-t border-border pt-4">
            {reviews === null ? (
              <p className="text-xs text-fg-subtle">Loading reviews…</p>
            ) : reviews.reviews.length === 0 ? (
              <p className="text-xs text-fg-subtle">No written reviews yet.</p>
            ) : (
              <ul className="space-y-2.5">
                {reviews.reviews.slice(0, 5).map((review) => (
                  <li key={review.id} className="text-xs">
                    <p className="tabular text-fg">
                      {"★".repeat(review.rating)}
                      <span className="text-fg-subtle">{"★".repeat(5 - review.rating)}</span>{" "}
                      <span className="text-fg-muted">{review.customerName}</span>
                    </p>
                    {review.comment ? (
                      <p className="mt-0.5 text-fg-muted">{review.comment}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            <Button size="console" variant="ghost" onClick={() => setOpenReviews(null)}>
              Close
            </Button>
          </div>
        ) : null}

        <Button
          variant="primary"
          full
          className="mt-4"
          disabled={busy !== null || !areaId}
          onClick={() => void book(match)}
        >
          {busy === match.offeringId ? "Booking…" : "Book this provider"}
        </Button>
      </Surface>
    );
  };

  const resultsColumn = results ? (
    <section>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-medium">
            <span className="tabular">{results.total}</span> provider
            {results.total === 1 ? "" : "s"} can do this
          </h2>
          {/*
            Said once, here — not repeated on every card, which is how people
            learn to stop reading a caveat.
          */}
          <p className="mt-1 text-xs text-fg-subtle">
            Distances are straight-line from your pin, not road distance.
          </p>
        </div>

        {results.total > 1 ? (
          <label className="flex shrink-0 items-center gap-2 text-sm text-fg-muted">
            Sort
            <select
              value={sort}
              onChange={(e) => void resort(e.target.value as discoveryApi.MatchSort)}
              disabled={busy !== null}
              className={fieldBase}
            >
              <option value="PRICE_ASC">Cheapest first</option>
              <option value="PRICE_DESC">Most expensive first</option>
              <option value="RATING_DESC">Best rated first</option>
              {/*
                Only offered once a pin exists — the API refuses this sort
                without coordinates, and an option that always errors is worse
                than one that is not there.
              */}
              {point ? <option value="DISTANCE_ASC">Nearest first</option> : null}
            </select>
          </label>
        ) : null}
      </div>

      {/*
        One notice for the whole search, not one per card. Discovery works
        anywhere; a BOOKING needs a catalogue district, because Booking.areaId
        is a required FK. The warning tone is legitimate here — "blocked,
        waiting on you" is a genuine status.
      */}
      {results.total > 0 && !areaId ? (
        <p className="mb-3 rounded-control bg-warning-bg px-3 py-2 text-xs text-warning">
          Your pin is outside the districts we cover, so booking is blocked.{" "}
          <button
            onClick={() => setEditing(true)}
            className="font-medium underline underline-offset-2"
          >
            Choose a district
          </button>{" "}
          to continue, or contact us to have yours added.
        </p>
      ) : null}

      {results.total === 0 ? (
        <EmptyState
          title="Nobody covers this field yet"
          description="No provider travels this far for a job this size. Try moving the pin, or come back — coverage grows as providers join."
          action={<Button onClick={() => setEditing(true)}>Change the search</Button>}
        />
      ) : (
        <ul
          className={`space-y-3 ${searching ? "opacity-60 transition-opacity" : ""}`}
          aria-busy={searching}
        >
          {results.matches.map(card)}
        </ul>
      )}
    </section>
  ) : searching ? (
    // Single column, not the default two-up grid: the point of a skeleton is to occupy the
    // eventual space, and the eventual space here is one column.
    <CardListSkeleton count={3} layout="space-y-3" />
  ) : null;

  return (
    <Page size="console">
      <PageHeader
        title={reassignId ? "Choose another provider" : "Book a service"}
        description={
          reassigning
            ? `${reassigning.serviceTypeName} · ${reassigning.quantity} ${unitNoun(
                reassigning.pricingUnit,
              )} · ${reassigning.areaName}. Your requirement and history are kept — only the provider changes.`
            : "Tell us the job. We'll show who can do it and what it costs."
        }
      />

      {/*
        The grid NEVER changes shape — only the left column's contents do. That
        is what keeps the map mounted across a search (so the pin survives) and
        stops the page reflowing on submit.

        items-start is mandatory: without it an expanded reviews panel would
        stretch the map column and the sticky map would jump.
      */}
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_26rem]">
        {/* Map first on a phone: the pin is the primary input, and on touch a
            marker tap is the only way to reach a card. */}
        <div className="order-1 min-w-0 lg:order-2">{mapColumn}</div>

        <div className="order-2 min-w-0 space-y-4 lg:order-1">
          <Surface className="p-4">
            {collapsed ? (
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                {/*
                  Reads from `results`, never from the form state, so the bar
                  always describes the search that produced what is on screen —
                  not edits the customer has typed but not submitted.
                */}
                <p className="truncate font-medium">
                  {results.serviceTypeName}
                  <span className="text-fg-muted"> · </span>
                  <span className="tabular">{results.quantity}</span> {unitNoun(results.pricingUnit)}
                </p>
                <p className="mt-0.5 truncate text-sm text-fg-muted">
                  {pinLabel ?? "Pinned location"} · {shortDate(date)},{" "}
                  {windowLabel(window_).toLowerCase()}
                </p>
              </div>
              <Button
                className="shrink-0"
                aria-expanded={false}
                aria-controls="search-form"
                onClick={() => setEditing(true)}
              >
                Change
              </Button>
            </div>
          ) : results ? (
            <>
              <div className="flex items-start justify-between gap-4">
                <p className="min-w-0 truncate font-medium">Change your search</p>
                <Button
                  variant="ghost"
                  className="shrink-0"
                  aria-expanded
                  aria-controls="search-form"
                  onClick={() => setEditing(false)}
                >
                  Cancel
                </Button>
              </div>
                <div className="mt-4 border-t border-border pt-4">{searchForm}</div>
              </>
            ) : (
              searchForm
            )}
          </Surface>

          <FormError message={error} />

          {resultsColumn}
        </div>
      </div>
    </Page>
  );
}

export default function SearchPage() {
  return (
    <RequireAuth>
      {/* useSearchParams() reads the request, so Next requires a boundary above it. */}
      <Suspense fallback={<CardListSkeleton />}>
        <Search />
      </Suspense>
    </RequireAuth>
  );
}
