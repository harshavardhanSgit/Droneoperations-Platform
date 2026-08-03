import Link from "next/link";

import { ApiError } from "@/core/api/client";
import { getLiveness, getReadiness } from "@/features/health/api";

export const dynamic = "force-dynamic";

type Probe<T> = { ok: true; data: T } | { ok: false; error: ApiError };

async function probe<T>(fn: () => Promise<T>): Promise<Probe<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof ApiError
          ? error
          : new ApiError("UNKNOWN_ERROR", "Unexpected failure", 0),
    };
  }
}

function Status({ label, result }: { label: string; result: Probe<unknown> }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-black/5 py-2.5 text-sm last:border-0 dark:border-white/10">
      <span className="text-black/50 dark:text-white/50">{label}</span>
      <span
        className={
          result.ok
            ? "text-emerald-700 dark:text-emerald-400"
            : "text-red-700 dark:text-red-400"
        }
      >
        {result.ok ? "healthy" : (result.error.code ?? "unavailable")}
      </span>
    </div>
  );
}

export default async function Home() {
  const [liveness, readiness] = await Promise.all([probe(getLiveness), probe(getReadiness)]);

  return (
    <main className="mx-auto w-full max-w-lg px-6 py-20">
      <h1 className="text-2xl font-semibold tracking-tight">
        Drone Operations Platform
      </h1>
      <p className="mt-2 text-sm text-black/50 dark:text-white/50">
        Enterprise platform for commercial drone service operations.
      </p>

      <div className="mt-8 flex gap-3">
        <Link
          href="/login"
          className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
        >
          Sign in
        </Link>
        <Link
          href="/register"
          className="rounded-md border border-black/15 px-4 py-2 text-sm font-medium dark:border-white/20"
        >
          Create account
        </Link>
      </div>

      <section className="mt-12 rounded-lg border border-black/10 p-5 dark:border-white/15">
        <h2 className="mb-3 text-sm font-medium">API status</h2>
        <Status label="Liveness" result={liveness} />
        <Status label="Readiness (PostgreSQL)" result={readiness} />
      </section>
    </main>
  );
}
