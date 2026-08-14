import type { Area } from "@/core/api/types";
import type { PickedLocation } from "@/components/map-picker";

import * as catalogueApi from "./api";

/** The geocoder names a place in its own words; the selects run on catalogue ids. */
export function nameMatches(areaName: string, candidate?: string): boolean {
  if (!candidate) return false;

  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const a = norm(areaName);
  const b = norm(candidate);

  if (!a || !b) return false;
  if (a === b) return true;

  // Substring matching only above four characters: below that, short names collide constantly
  // ("Bid" inside "Bidar") and would attach a booking to the wrong district.
  return a.length >= 4 && b.length >= 4 && (a.includes(b) || b.includes(a));
}

/** A picked pin, resolved to catalogue ids. */
export interface ResolvedArea {
  stateId?: string;
  areaId?: string;
  /** The districts fetched while resolving. */
  districts: Area[];
}

export async function resolveAreaFromPin(
  location: Pick<PickedLocation, "state" | "district" | "city">,
  states: Area[],
): Promise<ResolvedArea> {
  const state = states.find((s) => nameMatches(s.name, location.state));
  if (!state) return { districts: [] };

  const districts = await catalogueApi.listAreas(state.id);

  // District first, then city: Nominatim puts the district in `state_district` or `county`, but
  // for a city that IS a district it only fills `city`.
  const district =
    districts.find((d) => nameMatches(d.name, location.district)) ??
    districts.find((d) => nameMatches(d.name, location.city));

  return {
    stateId: state.id,
    ...(district ? { areaId: district.id } : {}),
    districts,
  };
}
