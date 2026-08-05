"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { linksFor } from "@/components/app-shell";
import { useAuth } from "@/core/auth/auth-context";
import { useCountUp } from "@/core/hooks/use-count-up";
import { useInView } from "@/core/hooks/use-in-view";
import { getLiveness, getReadiness } from "@/features/health/api";

/**
 * Wraps a section and fades it up the first time it scrolls into view.
 *
 * The CSS does the animating; this only decides when. Under reduced motion the
 * .reveal rule in globals.css pins both states to visible, so the observer
 * still runs but changes nothing.
 */
function Reveal({ children, className = "" }: { children: ReactNode; className?: string }) {
  const { ref, inView } = useInView<HTMLElement>();

  return (
    <section ref={ref} className={`reveal ${inView ? "reveal-in" : ""} ${className}`}>
      {children}
    </section>
  );
}

function StepIcon({ d }: { d: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="size-5"
    >
      <path d={d} />
    </svg>
  );
}

const STEPS = [
  {
    title: "Say what you need",
    body: "Service, district, how many acres, when. Prices come back with what is and is not included.",
    icon: "M9 5h6v3H9zM4 8h16v11a1 1 0 01-1 1H5a1 1 0 01-1-1zM4 13h16",
  },
  {
    title: "A provider takes it on",
    body: "They accept, or propose a date that suits the weather. You agree it before anyone travels.",
    icon: "M4 13h4l2 3h4l2-3h4M4 13V7a2 2 0 012-2h12a2 2 0 012 2v6l-1 6H5l-1-6z",
  },
  {
    title: "Work done, then paid",
    body: "They record what was actually covered. You confirm it. The bill follows the work, not the estimate.",
    icon: "M4 12l5 5L20 6",
  },
];

const STATS = [
  { value: 4, suffix: "", label: "service types" },
  { value: 18, suffix: "", label: "districts covered" },
  { value: 6, suffix: "", label: "active providers" },
  { value: 24, suffix: "/7", label: "request any time" },
];

const ROLES = [
  {
    title: "I need work done",
    body: "Compare providers on price, inclusions and rating. Book without a phone call.",
    href: "/register",
    cta: "Create a customer account",
  },
  {
    title: "I own drones",
    body: "List what you sell, set your own prices and areas, and run your jobs from one screen.",
    href: "/register",
    cta: "Register as a provider",
  },
  {
    title: "I run the platform",
    body: "Approve providers, step in on stuck jobs, dispatch engineers to grounded machines.",
    href: "/login",
    cta: "Staff sign in",
  },
];

function Stat({ value, suffix, label }: { value: number; suffix: string; label: string }) {
  const { ref, inView } = useInView<HTMLDivElement>("0px");
  const shown = useCountUp(value, inView);

  return (
    <div ref={ref} className="text-center">
      <p className="tabular text-3xl font-semibold tracking-tight">
        {shown}
        {suffix}
      </p>
      <p className="mt-1 text-sm text-fg-muted">{label}</p>
    </div>
  );
}

/** Slim live strip. The probes moved here from the middle of the page. */
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
    <footer className="border-t border-border">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-4 text-xs text-fg-subtle">
        <span className="flex items-center gap-1.5">
          <span className={`size-1.5 animate-pulse rounded-full ${dot(api)}`} aria-hidden />
          API {api === null ? "checking" : api ? "healthy" : "unavailable"}
        </span>
        <span className="flex items-center gap-1.5">
          <span className={`size-1.5 animate-pulse rounded-full ${dot(db)}`} aria-hidden />
          Database {db === null ? "checking" : db ? "connected" : "unreachable"}
        </span>
        <span className="ml-auto">Drone Operations Platform</span>
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

  // Nothing until we know. Rendering the marketing page to someone who is
  // already signed in, then yanking it away, reads as a bug.
  if (status !== "anonymous") {
    return <div className="min-h-dvh" />;
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <main className="flex-1">
        <section className="relative overflow-hidden">
          {/* Decorative only, and aria-hidden: two slow orbs behind the hero. */}
          <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
            <div className="orb absolute -left-24 -top-32 size-[28rem] rounded-full bg-info/20 blur-3xl" />
            <div
              className="orb absolute -right-32 top-24 size-[32rem] rounded-full bg-success/15 blur-3xl"
              style={{ animationDelay: "-9s" }}
            />
          </div>

          <div className="mx-auto grid w-full max-w-5xl gap-10 px-6 py-20 sm:py-28 lg:grid-cols-[1.1fr_.9fr] lg:items-center">
            <div>
              <p
                className="fade-up text-sm font-medium text-fg-muted"
                style={{ animationDelay: "0ms" }}
              >
                Agricultural spraying · Telangana, Andhra Pradesh, Maharashtra
              </p>

              <h1
                className="fade-up mt-3 text-4xl font-semibold leading-tight tracking-tight sm:text-5xl"
                style={{ animationDelay: "80ms" }}
              >
                Hire a drone the way you would hire any professional.
              </h1>

              <p
                className="fade-up mt-4 max-w-xl text-lg text-fg-muted"
                style={{ animationDelay: "160ms" }}
              >
                Today this is arranged by phone call and guesswork. Here you can see who covers your
                district, what they charge, what the price includes — and keep a record of the job
                afterwards.
              </p>

              <div
                className="fade-up mt-8 flex flex-wrap gap-3"
                style={{ animationDelay: "240ms" }}
              >
                <Link
                  href="/search"
                  className="inline-flex h-11 items-center rounded-control bg-accent px-5 text-[15px] font-medium text-accent-fg hover:opacity-90"
                >
                  Find a provider
                </Link>
                <Link
                  href="/register"
                  className="inline-flex h-11 items-center rounded-control border border-border-strong px-5 text-[15px] font-medium hover:bg-neutral-bg"
                >
                  Create account
                </Link>
              </div>
            </div>

            {/*
              A CTA card, not an embedded search form.
              service-types, areas and discovery/matches all sit behind the API's
              global auth guard — an anonymous visitor would get three empty
              dropdowns and a 401. A form that looks usable and is not is worse
              than an honest invitation.
            */}
            <div
              className="fade-up rounded-surface border border-border bg-bg-raised p-6"
              style={{ animationDelay: "320ms" }}
            >
              <h2 className="text-sm font-medium">Get a price</h2>
              <p className="mt-1 text-sm text-fg-muted">
                Tell us the service, the district and how many acres. You will see every provider
                who covers it, with their price and what it includes.
              </p>

              <ul className="mt-4 space-y-2 text-sm text-fg-muted">
                {["Prices before you commit", "What is not included, stated plainly", "No fee to use"].map(
                  (item) => (
                    <li key={item} className="flex items-start gap-2">
                      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-success" aria-hidden />
                      {item}
                    </li>
                  ),
                )}
              </ul>

              <Link
                href="/search"
                className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-control bg-accent text-[15px] font-medium text-accent-fg hover:opacity-90"
              >
                Get a quote
              </Link>
              <p className="mt-2 text-center text-xs text-fg-subtle">
                Takes a minute · sign in to see prices
              </p>
            </div>
          </div>
        </section>

        <Reveal className="border-t border-border">
          <div className="mx-auto w-full max-w-5xl px-6 py-16">
            <h2 className="text-xl font-semibold tracking-tight">How it works</h2>
            <div className="mt-8 grid gap-6 md:grid-cols-3">
              {STEPS.map((step, index) => (
                <div key={step.title}>
                  <div className="flex size-9 items-center justify-center rounded-control bg-neutral-bg text-fg">
                    <StepIcon d={step.icon} />
                  </div>
                  <p className="tabular mt-3 text-xs text-fg-subtle">Step {index + 1}</p>
                  <h3 className="mt-1 font-medium">{step.title}</h3>
                  <p className="mt-1 text-sm text-fg-muted">{step.body}</p>
                </div>
              ))}
            </div>
          </div>
        </Reveal>

        <Reveal className="border-t border-border bg-bg-raised">
          <div className="mx-auto grid w-full max-w-5xl grid-cols-2 gap-8 px-6 py-14 md:grid-cols-4">
            {STATS.map((stat) => (
              <Stat key={stat.label} {...stat} />
            ))}
          </div>
        </Reveal>

        <Reveal className="border-t border-border">
          <div className="mx-auto w-full max-w-5xl px-6 py-16">
            <h2 className="text-xl font-semibold tracking-tight">Which one are you?</h2>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {ROLES.map((role) => (
                <div
                  key={role.title}
                  className="flex flex-col rounded-surface border border-border p-5"
                >
                  <h3 className="font-medium">{role.title}</h3>
                  <p className="mt-1 flex-1 text-sm text-fg-muted">{role.body}</p>
                  <Link
                    href={role.href}
                    className="mt-4 inline-flex h-9 items-center justify-center rounded-control border border-border-strong px-3 text-sm font-medium hover:bg-neutral-bg"
                  >
                    {role.cta}
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </main>

      <HealthStrip />
    </div>
  );
}
