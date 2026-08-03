const PIPELINE = [
  { key: "REGISTERED", label: "Registered" },
  { key: "PROFILE_COMPLETE", label: "Business details" },
  { key: "DOCUMENTS_SUBMITTED", label: "Documents" },
  { key: "UNDER_REVIEW", label: "Under review" },
  { key: "ACTIVATED", label: "Active" },
] as const;

/**
 * Mirrors the backend's TRANSITIONS table. Deliberately display-only — the
 * server decides what is legal, this just shows the user where they are.
 */
export function StageTracker({ stage }: { stage: string }) {
  if (stage === "REJECTED" || stage === "SUSPENDED") {
    return (
      <div className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">
        {stage === "REJECTED"
          ? "Your application was not approved. Update your details and submit again."
          : "This account has been suspended by the platform."}
      </div>
    );
  }

  const current = PIPELINE.findIndex((step) => step.key === stage);

  return (
    <ol className="flex flex-wrap gap-x-2 gap-y-2">
      {PIPELINE.map((step, index) => {
        const done = index < current;
        const active = index === current;

        return (
          <li key={step.key} className="flex items-center gap-2">
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
                done
                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                  : active
                    ? "bg-black text-white dark:bg-white dark:text-black"
                    : "bg-black/5 text-black/40 dark:bg-white/10 dark:text-white/40"
              }`}
            >
              {done ? "✓" : index + 1}
            </span>
            <span
              className={`text-sm ${active ? "font-medium" : "text-black/50 dark:text-white/50"}`}
            >
              {step.label}
            </span>
            {index < PIPELINE.length - 1 ? (
              <span className="text-black/20 dark:text-white/20">→</span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
