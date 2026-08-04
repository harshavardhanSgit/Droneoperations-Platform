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
    <div className="flex items-center justify-between gap-4 border-b border-border py-2.5 text-sm last:border-0">
      <span className="text-fg-muted">{label}</span>
      <span
        className={
          result.ok
            ? "text-success"
            : "text-danger"
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
      <p className="mt-2 text-sm text-fg-muted">
        Enterprise platform for commercial drone service operations.
      </p>

      <div className="mt-8 flex gap-3">
        <Link
          href="/login"
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg"
        >
          Sign in
        </Link>
        <Link
          href="/register"
          className="rounded-md border border-border-strong px-4 py-2 text-sm font-medium"
        >
          Create account
        </Link>
      </div>

      <section className="mt-12 rounded-lg border border-border-strong p-5">
        <h2 className="mb-3 text-sm font-medium">API status</h2>
        <Status label="Liveness" result={liveness} />
        <Status label="Readiness (PostgreSQL)" result={readiness} />
      </section>
    </main>
  );
}
