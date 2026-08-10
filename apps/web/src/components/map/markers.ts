import { PIN_HTML } from "./tiles";

/**
 * Icons for the map, built as HTML strings for Leaflet's `divIcon`.
 *
 * Separate from tiles.ts, which is about where the imagery comes from. This is
 * about what we draw on top of it.
 *
 * ONE RULE GOVERNS THIS FILE: no inline `style` on anything a CSS class needs
 * to override later. An inline declaration beats any class selector on
 * specificity, so a highlight rule written as `.provider-marker.is-highlighted
 * .provider-marker-dot { width: 20px }` would silently do nothing against a
 * `style="width:14px"`. Everything visual lives in globals.css; these builders
 * emit structure only.
 */

/**
 * Zero-sized, zero-anchored: (0,0) inside the html IS the coordinate.
 *
 * Leaflet's DivIcon otherwise defaults to `iconSize: [12,12]` and, with no
 * explicit anchor, centres on that — so the icon box's origin lands 6px up and
 * left of the actual point. Invisible on a lone pin; very visible on a ring
 * meant to be concentric with one, or on a disc meant to mark a location.
 */
export const ANCHOR = {
  iconSize: [0, 0] as [number, number],
  iconAnchor: [0, 0] as [number, number],
};

/** Provider names and place labels are user-supplied; they never reach innerHTML raw. */
export const escapeHtml = (value: string): string =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

/**
 * The picked pin, optionally sweeping.
 *
 * Two rings on one animation offset by half its duration, so one is always
 * mid-sweep and the pulse never visibly stalls. Pure CSS: animating a real
 * L.circle's radius would re-project and repaint geometry every frame.
 */
export const pinHtml = (sweeping: boolean): string => `
<span class="map-pin-box">
  ${
    sweeping
      ? `<span class="radar-sweep" style="animation-delay:0s"></span>
         <span class="radar-sweep" style="animation-delay:1.1s"></span>`
      : ""
  }
  <span class="map-pin-glyph">${PIN_HTML}</span>
</span>`;

/**
 * A result marker: a disc, because the position it stands for is a
 * neighbourhood rather than an address (the API snaps it to a ~5 km grid).
 *
 * `-hit` is a transparent square much larger than the visible dot. Leaflet
 * hit-tests the icon element, and a 14px disc is a poor target for a finger.
 */
export const markerHtml = (label: string): string => `
<span class="provider-marker-box">
  <span class="provider-marker-hit"></span>
  <span class="provider-marker-dot"></span>
  <span class="provider-marker-label">${escapeHtml(label)}</span>
</span>`;
