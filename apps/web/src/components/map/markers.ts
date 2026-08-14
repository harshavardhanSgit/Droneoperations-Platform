import { PIN_HTML } from "./tiles";

/** Icons for the map, built as HTML strings for Leaflet's `divIcon`. */

/** Zero-sized, zero-anchored: (0,0) inside the html IS the coordinate. */
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

/** The picked pin, optionally sweeping. */
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
 * A result marker: a disc, because the position it stands for is a neighbourhood rather than an
 * address (the API snaps it to a ~5 km grid).
 *
 * Classes only, never an inline style: Leaflet writes `style` on the icon element, so an
 * inline rule here outranks `.is-highlighted` and the highlight silently does nothing.
 */
export const markerHtml = (label: string): string => `
<span class="provider-marker-box">
  <span class="provider-marker-hit"></span>
  <span class="provider-marker-dot"></span>
  <span class="provider-marker-label">${escapeHtml(label)}</span>
</span>`;
