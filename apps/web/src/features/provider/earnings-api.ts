import { apiFetch } from "@/core/api/client";
import type { Earnings } from "@/core/api/types";

/**
 * Settlement's provider-facing read. Lives here rather than in a settlement
 * feature because the route is provider-scoped — the same reason the backend
 * hangs it off /providers/me while the module that owns it is Settlement.
 */
export const getEarnings = () => apiFetch<Earnings>("/api/v1/providers/me/earnings");
