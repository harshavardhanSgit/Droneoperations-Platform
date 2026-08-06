"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { linksFor } from "@/components/app-shell";
import { CoverageShowcase } from "@/components/coverage-showcase";
import { Drone3D } from "@/components/drone-3d";
import { useAuth } from "@/core/auth/auth-context";
import { getLiveness, getReadiness } from "@/features/health/api";

type RoleKind = "customer" | "provider" | "staff";

function RoleIcon({ kind }: { kind: RoleKind }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
    className: "size-5",
  } as const;

  if (kind === "customer") {
    return (
      <svg {...common}>
        <circle cx="11" cy="11" r="7" />
        <path d="M21 21l-4.35-4.35" />
        <path d="M11 8v6M8 11h6" />
      </svg>
    );
  }
  if (kind === "provider") {
    return (
      <svg {...common}>
        <path d="M6 18L12 12l6 6M6 6l6 6 6-6" />
        <circle cx="6" cy="6" r="2.2" />
        <circle cx="18" cy="6" r="2.2" />
        <circle cx="6" cy="18" r="2.2" />
        <circle cx="18" cy="18" r="2.2" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M12 3l7 3v5c0 4.4-2.9 7.9-7 10-4.1-2.1-7-5.6-7-10V6z" />
      <path d="M9.3 12.2l2 2 3.6-3.8" />
    </svg>
  );
}

const ROLES: { kind: RoleKind; title: string; body: string }[] = [
  {
    kind: "customer",
    title: "Customer",
    body: "Find a provider in your district, compare prices and book.",
  },
  {
    kind: "provider",
    title: "Provider",
    body: "Publish services and prices, accept work, manage your fleet.",
  },
  {
    kind: "staff",
    title: "Platform staff",
    body: "Approve providers, oversee bookings, dispatch engineers.",
  },
];

/** Slim live strip at the very bottom — the health probes live here now. */
function HealthStrip() {
  const [api, setApi] = useState<boolean | null>(null);
  const [db, setDb] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;

    getLiveness()
      .then(() => !cancelled && setApi(true))
      .catch(() => !cancelled && setApi(false));

    getReadiness()
      .then(() => !cancelled && setDb(true))
      .catch(() => !cancelled && setDb(false));

    return () => {
      cancelled = true;
    };
  }, []);

  const dot = (ok: boolean | null) =>
    ok === null ? "bg-neutral" : ok ? "bg-success" : "bg-danger";

  return (
    <footer className="relative z-10 border-t border-border">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-3 text-xs text-fg-subtle">
        <span className="flex items-center gap-1.5">
          <span className={`size-1.5 animate-pulse rounded-full ${dot(api)}`} aria-hidden />
          API {api === null ? "checking" : api ? "healthy" : "unavailable"}
        </span>
        <span className="flex items-center gap-1.5">
          <span className={`size-1.5 animate-pulse rounded-full ${dot(db)}`} aria-hidden />
          Database {db === null ? "checking" : db ? "connected" : "unreachable"}
        </span>
      </div>
    </footer>
  );
}

export default function Landing() {
  const { status, account } = useAuth();
  const router = useRouter();

  /**
   * Signed-in visitors go straight to their own first screen.
   *
   * NOT next/navigation's redirect(): that runs on the server, and the server
   * cannot see this session. The access token lives in memory and the refresh
   * cookie is httpOnly, scoped to /api/v1/auth, and set by the API's origin —
   * a different host from the web app in production. Only the browser knows.
   */
  useEffect(() => {
    if (status === "authenticated" && account) {
      const first = linksFor(account.organisation.kind, account.role)[0];
      router.replace(first?.href ?? "/dashboard");
    }
  }, [status, account, router]);

  // Nothing until we know. Rendering the landing page to someone who is
  // already signed in, then yanking it away, reads as a bug.
  if (status !== "anonymous") {
    return <div className="min-h-dvh" />;
  }

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden">
      {/* Backdrop: faint field-map grid, then a readability veil over the text side. */}
      <div aria-hidden className="field-grid absolute inset-0" />
      <div aria-hidden className="hero-veil absolute inset-0" />

      <header className="relative z-10 flex items-center justify-between px-6 py-5 sm:px-8">
        <p className="font-medium tracking-tight">Drone Operations Platform</p>
        <Link href="/login" className="text-sm text-fg-muted hover:text-fg">
          Sign in
        </Link>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col px-6 pb-16 pt-12 sm:pt-20">
        <div className="grid items-center gap-10 lg:grid-cols-[1.02fr_.98fr]">
          <div className="fade-up max-w-xl">
            <h1 className="text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
              Drone services for agriculture, on demand.
            </h1>
            <p className="fade-up mt-4 text-lg text-fg-muted" style={{ animationDelay: "90ms" }}>
              Find a provider in your district, see the price upfront, and book the job — no phone
              calls.
            </p>
          </div>

          <div className="fade-up" style={{ animationDelay: "180ms" }}>
            <div className="drone-drift relative mx-auto h-[380px] w-full max-w-[560px] lg:h-[520px]">
              <Drone3D />

              <div
                aria-hidden
                className="chip-float absolute left-2 top-8 hidden rounded-control border border-border bg-bg/80 px-2.5 py-1.5 text-xs text-fg-muted backdrop-blur lg:block"
              >
                On-demand aerial work
              </div>
              <div
                aria-hidden
                className="chip-float-2 absolute bottom-14 right-2 hidden rounded-control border border-border bg-bg/80 px-2.5 py-1.5 text-xs text-fg-muted backdrop-blur lg:block"
              >
                Prices upfront, always
              </div>
            </div>
          </div>
        </div>

        <div className="mt-14 grid gap-4 sm:grid-cols-3">
          {ROLES.map((role, index) => (
            <div
              key={role.kind}
              className="fade-up flex flex-col rounded-surface border border-border bg-bg p-5 text-left transition-[transform,border-color] hover:-translate-y-0.5 hover:border-border-strong"
              style={{ animationDelay: `${280 + index * 80}ms` }}
            >
              <div className="flex size-9 items-center justify-center rounded-control bg-neutral-bg">
                <RoleIcon kind={role.kind} />
              </div>
              <h2 className="mt-3 font-medium">{role.title}</h2>
              <p className="mt-1 flex-1 text-sm text-fg-muted">{role.body}</p>
              <Link
                href="/login"
                className="group mt-4 inline-flex h-9 items-center justify-center gap-1.5 rounded-control bg-accent px-3 text-sm font-medium text-accent-fg hover:opacity-90"
              >
                Sign in
                <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
                  →
                </span>
              </Link>
              {role.kind !== "staff" && (
                <Link href="/register" className="mt-2 text-xs text-fg-subtle hover:text-fg">
                  New here? Create an account
                </Link>
              )}
            </div>
          ))}
        </div>

        {/* The business, told through real data — the same aggregation the
            admin screen shows, served anonymously and TTL-cached. */}
        <CoverageShowcase />
      </main>

      <HealthStrip />
    </div>
  );
}
