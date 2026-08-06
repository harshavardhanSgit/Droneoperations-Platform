"use client";

// REQUIRED for the map to render at all. Without it, Leaflet's tile grid has
// no positioning (panes are not absolute), so tiles stack as overlapping
// rectangles — and Tailwind's preflight `img { max-width: 100% }` additionally
// shrinks each 256px tile. leaflet.css restores both.
import "leaflet/dist/leaflet.css";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

/**
 * A point picked on the map, plus whatever the reverse geocoder could name it.
 * The text fields are best-effort — the provider can correct them afterwards.
 */
export interface PickedLocation {
  latitude: number;
  longitude: number;
  /** Human-readable name from the geocoder, shown under the map. */
  label: string;
  addressLine?: string;
  city?: string;
  state?: string;
  /** District-level name, best-effort (Nominatim puts it in state_district or county). */
  district?: string;
  pincode?: string;
}

interface MapPickerProps {
  initial?: { latitude: number; longitude: number };
  onPick: (location: PickedLocation) => void;
  /** Called when the user removes the pin. The parent decides what happens to
   *  its own fields (the coordinate state it filled from onPick). */
  onClear?: () => void;
  disabled?: boolean;
}

/**
 * Map source. OpenStreetMap's public tiles need no API key and cover India
 * well, so the default stack costs nothing and works immediately. A premium
 * provider can be dropped in without code changes:
 *
 *   NEXT_PUBLIC_MAPBOX_TOKEN=sk…  → Mapbox Streets (billing required)
 *   NEXT_PUBLIC_MAP_TILE_URL=…    → any XYZ tile server
 *
 * Geocoding (search + reverse) uses Nominatim, OpenStreetMap's public API —
 * free, CORS-enabled, and fine at debounced human typing rates. For
 * production, proxy these calls through the API instead: public instances
 * rate-limit and expect a real Referer, and CORS is a dev convenience that
 * should not be assumed.
 */
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
const TILE_URL =
  process.env.NEXT_PUBLIC_MAP_TILE_URL ??
  (MAPBOX_TOKEN
    ? `https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/{z}/{x}/{y}?access_token=${MAPBOX_TOKEN}`
    : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png");
const TILE_ATTRIBUTION = MAPBOX_TOKEN
  ? '&copy; <a href="https://www.mapbox.com/about/maps/">Mapbox</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

const NOMINATIM = "https://nominatim.openstreetmap.org";
const INDIA_CENTER: [number, number] = [20.5937, 78.9629];

interface GeocodeAddress {
  house_number?: string;
  road?: string;
  suburb?: string;
  neighbourhood?: string;
  village?: string;
  town?: string;
  city?: string;
  municipality?: string;
  county?: string;
  state_district?: string;
  state?: string;
  postcode?: string;
}

interface GeocodeResult {
  display_name?: string;
  lat?: string;
  lon?: string;
  address?: GeocodeAddress;
}

/** Best-effort mapping of OSM address parts onto the provider profile fields. */
function fromAddress(displayName: string | undefined, address: GeocodeAddress = {}) {
  const addressLine = [address.house_number, address.road, address.suburb ?? address.neighbourhood]
    .filter(Boolean)
    .join(", ") || undefined;

  return {
    label:
      displayName ??
      ([address.road, address.city ?? address.town, address.state].filter(Boolean).join(", ") ||
        "Picked location"),
    addressLine,
    city: address.city ?? address.town ?? address.village ?? address.municipality ?? address.county,
    district: address.state_district ?? address.county,
    state: address.state,
    pincode: address.postcode,
  };
}

async function reverseGeocode(latitude: number, longitude: number): Promise<
  Pick<PickedLocation, "label" | "addressLine" | "city" | "district" | "state" | "pincode">
> {
  const response = await fetch(
    `${NOMINATIM}/reverse?format=jsonv2&addressdetails=1&zoom=18&lat=${latitude}&lon=${longitude}`,
    { headers: { Accept: "application/json" } },
  );
  if (!response.ok) throw new Error(`geocoder ${response.status}`);
  const body = (await response.json()) as GeocodeResult;
  return fromAddress(body.display_name, body.address);
}

const PIN_HTML = `<span style="display:block;width:26px;height:26px;transform:translate(-13px,-26px);filter:drop-shadow(0 2px 3px rgb(0 0 0 / 0.35))"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C7.6 2 4 5.6 4 10c0 5.4 8 12 8 12s8-6.6 8-12c0-4.4-3.6-8-8-8z" fill="var(--color-accent, #2563eb)"/><circle cx="12" cy="10" r="3" fill="#fff"/></svg></span>`;

/**
 * The typed query highlighted inside a suggestion, case-insensitive. Built from
 * React elements — never dangerouslySetInnerHTML, so a geocoder label cannot
 * inject markup.
 */
function Highlight({ text, query }: { text: string; query: string }) {
  const needle = query.trim();
  if (!needle) return text;

  const lower = text.toLowerCase();
  const q = needle.toLowerCase();
  const parts: ReactNode[] = [];
  let cursor = 0;
  let index = lower.indexOf(q);

  while (index !== -1) {
    if (index > cursor) parts.push(text.slice(cursor, index));
    parts.push(
      <span key={index} className="font-medium text-accent">
        {text.slice(index, index + q.length)}
      </span>,
    );
    cursor = index + q.length;
    index = lower.indexOf(q, cursor);
  }

  parts.push(text.slice(cursor));
  return parts;
}

type LeafletNamespace = typeof import("leaflet");

interface MapHandle {
  map: import("leaflet").Map;
  L: LeafletNamespace;
  marker: import("leaflet").Marker | null;
}

/**
 * A Leaflet map for picking a single point. Imperatively managed — no react
 * wrapper dependency — and the `window`-touching leaflet module is imported
 * dynamically after mount, so it never runs during SSR.
 */
export function MapPicker({ initial, onPick, onClear, disabled }: MapPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<MapHandle | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const aliveRef = useRef(true);
  const onPickRef = useRef(onPick);
  const onClearRef = useRef(onClear);
  const searchBoxRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  // Holds the label of the suggestion just picked. The input then contains a
  // full place name, and the search effect must not fire a redundant geocode
  // on it (which would pop the dropdown back open). Storing the label rather
  // than a boolean means a pick whose label equals the current query cannot
  // leak and silently suppress a later, legitimate search.
  const suppressNextSearchRef = useRef<string | null>(null);

  // False once the component unmounts, so a reverse geocode still in flight
  // cannot call setState or the parent's onPick against a dead tree. Reset to
  // true on every (re-)mount — StrictMode remounts components in dev.
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  // Keep the latest callbacks without updating refs during render.
  useEffect(() => {
    onPickRef.current = onPick;
    onClearRef.current = onClear;
  });

  // True after the first client render, false on the server — Leaflet only
  // exists in a browser, so the map is created in an effect keyed on this.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ label: string; latitude: number; longitude: number }[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  // The query the current results (or the empty state) belong to. Gates the
  // "no places found" message, so it can never show for a query whose search
  // is still in flight.
  const [searchedQuery, setSearchedQuery] = useState("");
  // The suggestion highlighted for Enter / ArrowUp / ArrowDown. New results
  // highlight the first row, so Enter always has an obvious target.
  const [activeIndex, setActiveIndex] = useState(0);
  // Live copy of activeIndex for event handlers. State only flushes on
  // render, but two keys can land before that flush (a fast ArrowDown then
  // Enter) — the handler must see the value the previous key already set, not
  // a stale render. Every write goes through setActive() so the two never
  // diverge.
  const activeIndexRef = useRef(0);
  const setActive = useCallback((index: number) => {
    activeIndexRef.current = index;
    setActiveIndex(index);
  }, []);
  const [locating, setLocating] = useState(false);
  const [picked, setPicked] = useState<PickedLocation | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);

  /** Move the pin. One owner — every pick path goes through this. */
  const placeMarker = useCallback((latitude: number, longitude: number) => {
    const handle = handleRef.current;
    if (!handle) return;
    handle.marker?.remove();
    handle.marker = handle.L.marker([latitude, longitude], {
      icon: handle.L.divIcon({ className: "", html: PIN_HTML }),
    }).addTo(handle.map);
  }, []);

  /**
   * Remove the pin, its label, and any search text. The map itself is left
   * where it is — only the marker goes. The parent hears via onClear and
   * resets whatever it stored from onPick.
   */
  const clearPick = useCallback(() => {
    if (!aliveRef.current) return;
    // Kill any geocode still in flight — its response must not reopen the
    // dropdown over a picker the user just cleared.
    abortRef.current?.abort();
    const handle = handleRef.current;
    if (handle) {
      handle.marker?.remove();
      handle.marker = null;
    }
    setPicked(null);
    setQuery("");
    setSearchOpen(false);
    setResults([]);
    setSearchedQuery("");
    onClearRef.current?.();
  }, []);

  /** Shared pick flow: remember, draw, notify. */
  const applyPick = useCallback(
    (location: PickedLocation, options?: { fly?: boolean }) => {
      if (!aliveRef.current) return;
      // Leaflet hands out full float precision (13.981379563926025) but the
      // API validates coordinates to 7 decimal places (~1 cm). Round to 6
      // (~0.1 m) here — one chokepoint for every pick path — so a map click
      // can never trip validation that a search pick sails past.
      const rounded = {
        ...location,
        latitude: Math.round(location.latitude * 1e6) / 1e6,
        longitude: Math.round(location.longitude * 1e6) / 1e6,
      };
      setPicked(rounded);
      placeMarker(rounded.latitude, rounded.longitude);
      if (options?.fly) {
        handleRef.current?.map.flyTo([rounded.latitude, rounded.longitude], 14);
      }
      onPickRef.current(rounded);
    },
    [placeMarker],
  );

  /** Create the map once, after mount. */
  useEffect(() => {
    if (!mounted || !containerRef.current || handleRef.current) return;

    let disposed = false;
    let created = false;

    void import("leaflet").then((L) => {
      if (disposed || !containerRef.current) return;

      const map = L.map(containerRef.current, {
        center: initial ? [initial.latitude, initial.longitude] : INDIA_CENTER,
        zoom: initial ? 13 : 5,
        // Wheel zoom starts off so the page scrolls normally over the map; the
        // first interaction with the map turns it on (see the click handler),
        // so the map never feels dead after the user has engaged with it.
        scrollWheelZoom: false,
        // Default zoom controls sit top-left, exactly where the full-width
        // search bar is — they would be hidden underneath it. Bottom-left is
        // empty (the button is bottom-right), so they go there.
        zoomControl: false,
      });
      L.control.zoom({ position: "bottomleft" }).addTo(map);
      L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION }).addTo(map);
      handleRef.current = { map, L, marker: null };

      if (!disabled) {
        map.on("click", () => {
          if (!map.scrollWheelZoom.enabled()) map.scrollWheelZoom.enable();
        });
      }

      if (initial) placeMarker(initial.latitude, initial.longitude);
      created = true;

      if (!disabled) {
        map.on("click", (event: import("leaflet").LeafletMouseEvent) => {
          const { lat, lng } = event.latlng;
          setGeoError(null);
          void reverseGeocode(lat, lng)
            .then((place) => applyPick({ latitude: lat, longitude: lng, ...place }))
            .catch(() =>
              applyPick({ latitude: lat, longitude: lng, label: `${lat.toFixed(5)}, ${lng.toFixed(5)}` }),
            );
        });
      }
    });

    return () => {
      disposed = true;
      if (created && handleRef.current) handleRef.current.map.remove();
      handleRef.current = null;
    };
    // The map is created once. `initial` arriving late (after the provider
    // loads) is handled below, not by recreating the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  /** When the provider's saved point arrives, centre the map on it. */
  useEffect(() => {
    if (!mounted || !handleRef.current || !initial) return;
    handleRef.current.map.flyTo([initial.latitude, initial.longitude], 13);
    placeMarker(initial.latitude, initial.longitude);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial?.latitude, initial?.longitude, mounted, placeMarker]);

  /**
   * Live recommendations as the user types. Two characters is enough to match
   * most Indian places ("Wa" → Warangal), and 250ms keeps up with typing
   * without spamming the geocoder. Every in-flight request is aborted when a
   * newer keystroke arrives, so a stale response can never overwrite the
   * dropdown for the current query.
   */
  useEffect(() => {
    // A freshly picked label is not a query the user typed — do not search
    // for it, or the dropdown would reopen over the pin they just chose.
    if (query.trim() === suppressNextSearchRef.current) {
      suppressNextSearchRef.current = null;
      return;
    }

    if (disabled || query.trim().length < 2) return;

    const timer = window.setTimeout(() => {
      setSearching(true);
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      // countrycodes=in scopes recommendations to India — the platform only
      // operates there, and a two-letter prefix like "Wa" would otherwise
      // suggest Western Australia or Washington instead of Warangal.
      fetch(
        `${NOMINATIM}/search?format=jsonv2&addressdetails=1&limit=8&countrycodes=in&q=${encodeURIComponent(query.trim())}`,
        { signal: controller.signal, headers: { Accept: "application/json" } },
      )
        .then((response) => {
          if (!response.ok) throw new Error(`geocoder ${response.status}`);
          return response.json() as Promise<GeocodeResult[]>;
        })
        .then((items) => {
          // The keystroke that aborted this fetch means the response is for a
          // query the user has already moved past — a microtask that was
          // queued before the abort can still land here, so check, don't
          // assume.
          if (controller.signal.aborted) return;
          setResults(
            items.map((item) => ({
              label: item.display_name ?? `${item.lat}, ${item.lon}`,
              latitude: Number(item.lat),
              longitude: Number(item.lon),
            })),
          );
          setSearchedQuery(query.trim());
          setActive(0);
          setSearchOpen(true);
        })
        .catch((cause: unknown) => {
          if (cause instanceof DOMException && cause.name === "AbortError") return;
          setResults([]);
        })
        .finally(() => setSearching(false));
    }, 250);

    return () => window.clearTimeout(timer);
  }, [query, disabled, setActive]);

  /** Keep the highlighted suggestion visible as the keyboard moves it. */
  useEffect(() => {
    if (activeIndex < 0 || !listRef.current) return;
    listRef.current.children[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  /** A click anywhere else — the map, the form — closes the recommendations. */
  useEffect(() => {
    if (!searchOpen) return;
    const onDocumentMouseDown = (event: MouseEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(event.target as Node)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocumentMouseDown);
    return () => document.removeEventListener("mousedown", onDocumentMouseDown);
  }, [searchOpen]);

  const pickSearchResult = useCallback(
    (result: { label: string; latitude: number; longitude: number }) => {
      // A search for a longer query can be in flight while an older result
      // list is still shown — picking must cancel it, or its response would
      // reopen the dropdown over the pin just chosen.
      abortRef.current?.abort();
      suppressNextSearchRef.current = result.label;
      setQuery(result.label);
      setSearchOpen(false);
      setActive(0);
      setGeoError(null);

      void reverseGeocode(result.latitude, result.longitude)
        .then((place) => applyPick({ latitude: result.latitude, longitude: result.longitude, ...place }, { fly: true }))
        .catch(() =>
          applyPick({ latitude: result.latitude, longitude: result.longitude, label: result.label }, { fly: true }),
        );
    },
    [applyPick, setActive],
  );

  const locateMe = useCallback(() => {
    setGeoError(null);

    // The browser blocks geolocation outside a secure context. localhost
    // counts, so dev works; plain HTTP on another host silently fails.
    if (!("geolocation" in navigator)) {
      setGeoError("Your browser does not support geolocation — pick the point on the map instead");
      return;
    }
    if (!window.isSecureContext) {
      setGeoError("Your browser blocks location on insecure connections — open this site over HTTPS or localhost");
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        void reverseGeocode(latitude, longitude)
          .then((place) => applyPick({ latitude, longitude, ...place }, { fly: true }))
          .catch(() => applyPick({ latitude, longitude, label: "Your location" }, { fly: true }))
          .finally(() => setLocating(false));
      },
      (error) => {
        // The three standard failure codes — each gets its own message so the
        // user knows whether to check the browser prompt, the network, or the
        // device rather than staring at a generic error.
        const message =
          error.code === error.PERMISSION_DENIED
            ? "Location permission was denied — allow location for this site, or pick the point on the map"
            : error.code === error.POSITION_UNAVAILABLE
              ? "Your browser could not find your position — pick the point on the map instead"
              : error.code === error.TIMEOUT
                ? "Location timed out — try again, or pick the point on the map"
                : "Could not read your location — pick the point on the map instead";
        setGeoError(message);
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }, [applyPick]);

  return (
    <div className={`map-picker ${disabled ? "pointer-events-none opacity-70" : ""}`}>
      <div className="relative h-72 overflow-hidden rounded-control border border-border-strong">
        {/* No aria-hidden here: Leaflet's zoom controls are interactive
            elements inside this container, and hiding them from assistive
            tech hides working buttons. The tile images themselves carry
            role="presentation" and are skipped by screen readers. */}
        {mounted ? <div ref={containerRef} className="absolute inset-0 z-0" /> : null}

        {!disabled ? (
          <>
            {/* Search sits above the Leaflet panes (which top out at z 1000). */}
            <div ref={searchBoxRef} className="absolute inset-x-3 top-3 z-[1001]">
              <div className="relative">
                <input
                  type="search"
                  value={query}
                  onChange={(event) => {
                    const value = event.target.value;
                    setQuery(value);
                    // Kill any in-flight geocode for the previous query the
                    // moment the text changes — a stale response must not
                    // overwrite the dropdown for what is being typed now.
                    abortRef.current?.abort();
                    if (value.trim().length < 2) setSearchOpen(false);
                    setActive(0);
                  }}
                  onFocus={() => results.length > 0 && setSearchOpen(true)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      // Inside a form (the booking search page) Enter would
                      // submit it — a submit is never what the user meant
                      // here. Enter picks the highlighted suggestion, or the
                      // first if nothing is highlighted.
                      event.preventDefault();
                      const result =
                        results[activeIndexRef.current >= 0 ? activeIndexRef.current : 0];
                      if (result) pickSearchResult(result);
                    } else if (event.key === "ArrowDown") {
                      event.preventDefault();
                      if (results.length > 0) {
                        setActive((activeIndexRef.current + 1) % results.length);
                      }
                    } else if (event.key === "ArrowUp") {
                      event.preventDefault();
                      if (results.length > 0) {
                        setActive(
                          (activeIndexRef.current - 1 + results.length) % results.length,
                        );
                      }
                    } else if (event.key === "Escape") {
                      setSearchOpen(false);
                    }
                  }}
                  placeholder="Search for a place or address…"
                  aria-label="Search for a place or address"
                  role="combobox"
                  aria-expanded={searchOpen}
                  aria-controls={
                    searchOpen && results.length > 0 ? "map-picker-results" : undefined
                  }
                  aria-autocomplete="list"
                  className="h-10 w-full rounded-control border border-border-strong bg-bg/95 px-3 pr-10 text-sm shadow-sm outline-none backdrop-blur focus:border-accent"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-fg-subtle">
                  {searching ? "…" : "⌕"}
                </span>
              </div>

              {searchOpen && results.length > 0 ? (
                <ul
                  ref={listRef}
                  id="map-picker-results"
                  className="mt-1 max-h-48 overflow-y-auto rounded-control border border-border bg-bg shadow-lg"
                >
                  {results.map((result, index) => (
                    <li key={`${result.latitude},${result.longitude}`}>
                      <button
                        type="button"
                        onMouseEnter={() => setActive(index)}
                        onClick={() => pickSearchResult(result)}
                        className={`w-full px-3 py-2 text-left text-sm ${
                          index === activeIndex ? "bg-neutral-bg" : "hover:bg-neutral-bg"
                        }`}
                      >
                        <Highlight text={result.label} query={query} />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : searchOpen &&
                !searching &&
                query.trim().length >= 2 &&
                query.trim() === searchedQuery ? (
                <p className="mt-1 rounded-control border border-border bg-bg px-3 py-2 text-sm text-fg-muted shadow-lg">
                  No places found for “{query.trim()}” — try a nearby village or town.
                </p>
              ) : null}
            </div>

            <button
              type="button"
              onClick={() => void locateMe()}
              disabled={locating}
              className="absolute bottom-3 right-3 z-[1001] flex h-10 items-center gap-2 rounded-control border border-border-strong bg-bg/95 px-3 text-sm shadow-sm backdrop-blur hover:bg-neutral-bg disabled:opacity-60"
            >
              <span aria-hidden>◎</span>
              {locating ? "Locating…" : "Use my location"}
            </button>
          </>
        ) : null}
      </div>

      {geoError ? <p className="mt-1.5 text-xs text-danger">{geoError}</p> : null}

      {picked ? (
        <div className="mt-2 flex items-start justify-between gap-3">
          <p className="flex items-start gap-1.5 text-xs text-fg-muted">
            <span aria-hidden className="mt-0.5 text-success">●</span>
            <span className="min-w-0">
              <span className="font-medium text-fg">{picked.label}</span>
              <span className="tabular-nums"> ({picked.latitude.toFixed(5)}, {picked.longitude.toFixed(5)})</span>
            </span>
          </p>
          {!disabled ? (
            <button
              type="button"
              onClick={clearPick}
              className="shrink-0 rounded-control border border-border-strong bg-bg px-2.5 py-1 text-xs text-fg-subtle transition-colors hover:bg-neutral-bg hover:text-fg"
            >
              Clear location
            </button>
          ) : null}
        </div>
      ) : !disabled ? (
        <p className="mt-2 text-xs text-fg-subtle">
          Search, or click anywhere on the map to mark your location. The address fields below fill in automatically.
        </p>
      ) : null}
    </div>
  );
}
