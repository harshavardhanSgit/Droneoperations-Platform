import { cardGrid } from "./surface";

/**
 * Placeholders shaped like the content they stand in for.
 *
 * The point is NOT decoration. A bare "Loading…" occupies one line, so when the
 * real data lands the page grows by several hundred pixels and everything the
 * user was about to click moves. A spinner in the same place shifts just as
 * badly. A skeleton that occupies the eventual space means nothing moves — the
 * grey shapes simply become text.
 *
 * Everything here is aria-hidden and wrapped in a role="status" region, so a
 * screen reader hears "Loading" once instead of reading out a wall of empty
 * boxes.
 */
function Bar({ className = "" }: { className?: string }) {
  return <span className={`block animate-pulse rounded bg-neutral-bg ${className}`} aria-hidden />;
}

function Region({ children }: { children: React.ReactNode }) {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Loading</span>
      {children}
    </div>
  );
}

/** Matches a Surface card: title, subtitle, a divider and a body. */
export function CardListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <Region>
      <ul className={cardGrid}>
        {Array.from({ length: count }, (_, i) => (
          <li key={i} className="rounded-surface border border-border bg-bg-raised p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-2">
                <Bar className="h-4 w-2/5" />
                <Bar className="h-3 w-3/5" />
              </div>
              <Bar className="h-5 w-20 rounded-full" />
            </div>
            <div className="mt-3 space-y-2 border-t border-border pt-3">
              <Bar className="h-3 w-1/2" />
              <Bar className="h-3 w-1/3" />
            </div>
            <Bar className="mt-4 h-11 w-full" />
          </li>
        ))}
      </ul>
    </Region>
  );
}

/** Matches a divide-y list inside a Surface. */
export function RowsSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <Region>
      <div className="divide-y divide-border rounded-surface border border-border">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center justify-between gap-4 px-4 py-3.5">
            <div className="min-w-0 flex-1 space-y-2">
              <Bar className="h-4 w-1/3" />
              <Bar className="h-3 w-1/2" />
            </div>
            <Bar className="h-4 w-16" />
          </div>
        ))}
      </div>
    </Region>
  );
}

/** Matches the console tables: a header rule then fixed-height rows. */
export function TableSkeleton({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <Region>
      <div className="overflow-hidden rounded-surface border border-border">
        <div className="flex gap-4 border-b border-border px-4 py-2.5">
          {Array.from({ length: columns }, (_, i) => (
            <Bar key={i} className="h-3 flex-1" />
          ))}
        </div>
        <div className="divide-y divide-border">
          {Array.from({ length: rows }, (_, r) => (
            <div key={r} className="flex items-center gap-4 px-4 py-3">
              {Array.from({ length: columns }, (_, c) => (
                <Bar key={c} className="h-3.5 flex-1" />
              ))}
            </div>
          ))}
        </div>
      </div>
    </Region>
  );
}
