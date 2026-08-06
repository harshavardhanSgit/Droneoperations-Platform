#!/usr/bin/env node
/**
 * Simplifies a GeoJSON FeatureCollection so a map can be vendored into the
 * repo at display resolution instead of shipping the full-detail source
 * (DataMeet's India states file is ~15 MB; the simplified output is <1 MB).
 *
 * Geometry only — properties are preserved untouched. Two operations:
 *   1. round coordinates to 3 decimal places (~110 m precision)
 *   2. Douglas–Peucker per ring, dropping points within `tolerance` degrees
 *      (~0.008° ≈ 900 m keeps state borders visually faithful)
 *
 * The vendored apps/web/public/india-states.geojson was produced from DataMeet's
 * open-source maps repo (https://github.com/datameet/maps, docs/data/geojson/
 * states.geojson, CC BY 2.5 / OSM). To regenerate with a fresh upstream file:
 *   node scripts/simplify-geojson.mjs <input.geojson> apps/web/public/india-states.geojson
 *
 * Usage:
 *   node scripts/simplify-geojson.mjs <input.geojson> <output.geojson> [tolerance]
 */
import { readFileSync, writeFileSync } from "node:fs";

const [, , input, output, tolArg] = process.argv;
if (!input || !output) {
  console.error("usage: node scripts/simplify-geojson.mjs <in.geojson> <out.geojson> [tol]");
  process.exit(1);
}

const tolerance = tolArg ? Number.parseFloat(tolArg) : 0.008;

const round = (v) => Math.round(v * 1000) / 1000;

function simplifyRing(ring, eps) {
  const n = ring.length;
  if (n < 5) return ring; // fewer than a closed quad: nothing to prune

  const segDist = (p, a, b) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
    let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
  };

  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const stack = [[0, n - 1]];

  while (stack.length) {
    const [s, e] = stack.pop();
    let maxD = 0;
    let idx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = segDist(ring[i], ring[s], ring[e]);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (idx !== -1 && maxD > eps) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }

  const out = [];
  for (let i = 0; i < n; i++) {
    if (keep[i]) out.push([round(ring[i][0]), round(ring[i][1])]);
  }
  return out;
}

const data = JSON.parse(readFileSync(input, "utf8"));

for (const feature of data.features) {
  const { geometry } = feature;
  if (!geometry) continue;

  // Ring depth: Polygon rings live at [polygon], MultiPolygon at [polygon][].
  const ringDepth = geometry.type === "Polygon" ? 1 : geometry.type === "MultiPolygon" ? 2 : -1;
  if (ringDepth === -1) continue;

  const walk = (coords, depth) =>
    depth === ringDepth
      ? simplifyRing(coords.map(([x, y]) => [round(x), round(y)]), tolerance)
      : coords.map((c) => walk(c, depth + 1));

  geometry.coordinates = walk(geometry.coordinates, 0);
}

// Drop the legacy `crs` member — CRS84 is the GeoJSON default and it costs bytes.
delete data.crs;

writeFileSync(output, JSON.stringify(data));
const kb = Math.round(Buffer.byteLength(JSON.stringify(data)) / 1024);
console.log(`simplified: ${data.features.length} features -> ${kb} KB -> ${output}`);
