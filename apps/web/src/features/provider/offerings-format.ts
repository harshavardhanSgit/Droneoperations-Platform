import type { Inclusion } from "./offerings-api";

export const ALL_INCLUSIONS: Inclusion[] = [
  "CHEMICAL",
  "WATER",
  "TRANSPORT",
  "LABOUR",
  "FUEL",
];

/**
 * Phrased as what the CUSTOMER gets, because that is how it reads in search
 * results — "water included" answers a question a farmer is actually asking.
 */
export const INCLUSION_LABEL: Record<string, string> = {
  CHEMICAL: "Chemical",
  WATER: "Water",
  TRANSPORT: "Transport",
  LABOUR: "Labour",
  FUEL: "Fuel",
};

export const unitLabel = (pricingUnit: string) =>
  pricingUnit.replace("PER_", "per ").toLowerCase().replace("_", " ");

/** Minor units in, rupees out — for putting a stored price into a text input. */
export const toRupees = (minor: number) => String(minor / 100);

/**
 * Rupees in, minor units out. Rounded, because 449.999 is not a price and
 * floating-point arithmetic on money must never reach the database.
 */
export const toMinor = (rupees: string) => Math.round(Number(rupees) * 100);

export const versionRange = (from: string, to?: string) => {
  const day = (iso: string) =>
    new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

  return to ? `${day(from)} – ${day(to)}` : `${day(from)} – now`;
};
