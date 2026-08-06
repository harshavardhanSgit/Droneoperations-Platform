"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { CoverageState } from "@/core/api/types";

/**
 * India rendered from a vendored, open-source GeoJSON
 * (apps/web/public/india-states.geojson — simplified from DataMeet's maps
 * repo by scripts/simplify-geojson.mjs).
 *
 * No map library: the file is a plain FeatureCollection, so a few dozen lines
 * of equirectangular projection are all it takes. That keeps the web app's
 * zero-dependency rule intact and the whole map under 350 KB.
 *
 * States with coverage data are tinted by acres (darker = more); the rest of
 * India stays as a faint backdrop — "the map faded out in the background".
 */

type Coord = [number, number];
type Ring = Coord[];
type Polygon = { type: "Polygon"; coordinates: Ring[] };
type MultiPolygon = { type: "MultiPolygon"; coordinates: Ring[][] };
type GeoFeature = {
  type: "Feature";
  properties: { ST_NM?: string };
  geometry: Polygon | MultiPolygon;
};

/** Fetched once per browser session, not once per render. */
let geoCache: Promise<GeoFeature[]> | null = null;

function loadGeo(): Promise<GeoFeature[]> {
  geoCache ??= fetch("/india-states.geojson")
    .then((r) => {
      if (!r.ok) throw new Error(`Map data unavailable (${r.status})`);
      return r.json() as Promise<{ features: GeoFeature[] }>;
    })
    .then((d) => d.features);
  return geoCache;
}

/**
 * DataMeet spells some states differently than the admin catalogue
 * ("Arunanchal Pradesh" vs "Arunachal Pradesh"), so names are matched
 * case-insensitively after trimming.
 */
const nameKey = (name: string) => name.trim().toLowerCase();

function boundingBox(features: GeoFeature[]) {
  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;

  for (const f of features) {
    const rings =
      f.geometry.type === "Polygon" ? f.geometry.coordinates : f.geometry.coordinates.flat();
    for (const ring of rings) {
      for (const [lon, lat] of ring) {
        if (lon < minLon) minLon = lon;
        if (lon > maxLon) maxLon = lon;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }
    }
  }
  return { minLon, maxLon, minLat, maxLat };
}

function ringPath(ring: Ring, x: (v: number) => number, y: (v: number) => number) {
  return (
    ring
      .map(
        ([lon, lat], i) =>
          `${i === 0 ? "M" : "L"}${x(lon).toFixed(2)} ${y(lat).toFixed(2)}`,
      )
      .join(" ") + "Z"
  );
}

function featurePath(
  f: GeoFeature,
  x: (v: number) => number,
  y: (v: number) => number,
) {
  if (f.geometry.type === "Polygon") {
    return f.geometry.coordinates.map((ring) => ringPath(ring, x, y)).join(" ");
  }
  return f.geometry.coordinates
    .flatMap((poly) => poly.map((ring) => ringPath(ring, x, y)))
    .join(" ");
}

export function IndiaMap({
  states,
  selected,
  onSelect,
  interactive = true,
}: {
  states: CoverageState[];
  selected?: string | null;
  onSelect?: (name: string | null) => void;
  /**
   * False makes the map view-only (the landing showcase): no focus stops, no
   * click/keyboard selection, and the aria-label stops promising interaction.
   */
  interactive?: boolean;
}) {
  const [features, setFeatures] = useState<GeoFeature[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hover, setHover] = useState<{ name: string; px: number; py: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    loadGeo()
      .then((f) => !cancelled && setFeatures(f))
      .catch((cause: unknown) => {
        if (!cancelled) setLoadError(cause instanceof Error ? cause.message : "Could not load the map");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const byName = useMemo(
    () => new Map(states.map((s) => [nameKey(s.name), s])),
    [states],
  );
  const maxAcres = useMemo(
    () => states.reduce((max, s) => Math.max(max, s.acresCovered), 1),
    [states],
  );

  const { W, H, x, y } = useMemo(() => {
    if (!features) return { W: 100, H: 90, x: (v: number) => v, y: (v: number) => v };
    const { minLon, maxLon, minLat, maxLat } = boundingBox(features);
    const lonSpan = maxLon - minLon;
    const latSpan = maxLat - minLat;
    const W = 100;
    const H = (latSpan / lonSpan) * W;
    const pad = 1.5;
    const innerW = W - pad * 2;
    const innerH = H - pad * 2;
    return {
      W,
      H,
      x: (lon: number) => ((lon - minLon) / lonSpan) * innerW + pad,
      y: (lat: number) => ((maxLat - lat) / latSpan) * innerH + pad,
    };
  }, [features]);

  function onMove(event: React.PointerEvent, name: string) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setHover({
      name,
      px: ((event.clientX - rect.left) / rect.width) * 100,
      py: ((event.clientY - rect.top) / rect.height) * 100,
    });
  }

  const hovered = hover ? byName.get(nameKey(hover.name)) : undefined;

  if (loadError) {
    return (
      <div className="rounded-control border border-border px-4 py-8 text-center text-sm text-fg-muted">
        {loadError}
      </div>
    );
  }

  if (!features) {
    return <div className="h-64 animate-pulse rounded-control bg-neutral-bg" aria-hidden />;
  }

  return (
    <div ref={containerRef} className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="group"
        aria-label="India coverage map — darker states have more acres covered"
        className="h-auto w-full"
      >
        {features.map((feature, index) => {
          const name = feature.properties.ST_NM ?? "";
          const data = byName.get(nameKey(name));
          const acres = data?.acresCovered ?? 0;
          const opacity = data ? 0.16 + 0.57 * Math.sqrt(acres / maxAcres) : 0.05;
          const active = selected === name || hover?.name === name;

          return (
            <path
              key={name || index}
              d={featurePath(feature, x, y)}
              fill={data ? "var(--success)" : "var(--fg)"}
              fillOpacity={active ? Math.min(1, opacity + 0.18) : opacity}
              stroke={active ? "var(--accent)" : data ? "var(--border-strong)" : "var(--border)"}
              strokeWidth={active ? 0.45 : 0.16}
              strokeLinejoin="round"
              tabIndex={data && interactive ? 0 : -1}
              role={data && interactive ? "button" : undefined}
              aria-label={
                data && interactive
                  ? `${name} — ${acres.toLocaleString("en-IN")} acres, ${data.jobs} jobs, ${
                      data.providers
                    } provider${data.providers === 1 ? "" : "s"}. Click to filter districts`
                  : undefined
              }
              aria-pressed={data && interactive ? selected === name : undefined}
              className={`${data && interactive ? "cursor-pointer" : ""} focus:outline-none`}
              onPointerMove={(e) => data && onMove(e, name)}
              onPointerLeave={() => setHover(null)}
              onClick={() =>
                data && interactive && onSelect?.(selected === name ? null : name)
              }
              onKeyDown={(e) => {
                if (data && interactive && (e.key === "Enter" || e.key === " ")) {
                  e.preventDefault();
                  onSelect?.(selected === name ? null : name);
                }
              }}
              onFocus={(e) => {
                const rect = containerRef.current?.getBoundingClientRect();
                if (!data || !interactive || !rect) return;
                const box = (e.target as SVGPathElement).getBBox();
                setHover({
                  name,
                  px: ((box.x + box.width / 2) / rect.width) * 100,
                  py: ((box.y + box.height / 2) / rect.height) * 100,
                });
              }}
              onBlur={() => setHover(null)}
            />
          );
        })}
      </svg>

      {hover && hovered ? (
        <div
          className={`pointer-events-none absolute z-10 ${
            hover.py < 15
              ? "-translate-x-1/2 translate-y-2"
              : "-translate-x-1/2 -translate-y-[calc(100%+8px)]"
          } rounded-control border border-border bg-bg px-2.5 py-1.5 text-xs`}
          style={{
            left: `${Math.min(88, Math.max(12, hover.px))}%`,
            top: `${hover.py}%`,
          }}
        >
          <p className="font-medium">{hovered.name}</p>
          <p className="mt-0.5 text-fg-muted">
            {hovered.acresCovered.toLocaleString("en-IN")} acres · {hovered.jobs} jobs
          </p>
        </div>
      ) : null}
    </div>
  );
}
