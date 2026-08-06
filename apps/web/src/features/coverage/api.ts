import { apiFetch } from "@/core/api/client";
import type { Coverage } from "@/core/api/types";

/** Derived, never stored — acres and jobs from completed bookings, provider
 * footprint from active offerings, fleet from serviceable drones. */
export const getCoverage = () => apiFetch<Coverage>("/api/v1/coverage");
