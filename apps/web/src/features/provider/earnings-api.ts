import { apiFetch } from "@/core/api/client";
import type { Earnings } from "@/core/api/types";

/** Settlement's provider-facing read. */
export const getEarnings = () => apiFetch<Earnings>("/api/v1/providers/me/earnings");
