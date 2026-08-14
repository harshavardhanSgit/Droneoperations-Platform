import { useSyncExternalStore } from "react";

/** Map source, shared by every map in the app. */
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

export const TILE_URL =
  process.env.NEXT_PUBLIC_MAP_TILE_URL ??
  (MAPBOX_TOKEN
    ? `https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/{z}/{x}/{y}?access_token=${MAPBOX_TOKEN}`
    : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png");

export const TILE_ATTRIBUTION = MAPBOX_TOKEN
  ? '&copy; <a href="https://www.mapbox.com/about/maps/">Mapbox</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export const INDIA_CENTER: [number, number] = [20.5937, 78.9629];

/** The picked point — "your field". */
export const PIN_HTML = `<span style="display:block;width:26px;height:26px;transform:translate(-13px,-26px);filter:drop-shadow(0 2px 3px rgb(0 0 0 / 0.4))"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C7.6 2 4 5.6 4 10c0 5.4 8 12 8 12s8-6.6 8-12c0-4.4-3.6-8-8-8z" fill="var(--map-you, #1d4ed8)" stroke="var(--map-outline, #fff)" stroke-width="1.6"/><circle cx="12" cy="10" r="2.6" fill="var(--map-outline, #fff)"/></svg></span>`;

/** True after the first client render, false on the server. */
export function useMapMounted(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}
