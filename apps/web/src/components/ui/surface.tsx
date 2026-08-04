/**
 * Borders, not shadows.
 *
 * A shadow says "this floats above the page", which is true of a dialog and
 * false of a list row. Using elevation for things that are not elevated is the
 * single most common reason an interface looks decorated rather than designed.
 * Everything here is flat and separated by a hairline.
 */
export function Surface({
  children,
  className = "",
  as: Tag = "div",
}: {
  children: React.ReactNode;
  className?: string;
  as?: "div" | "section" | "li" | "article";
}) {
  return (
    <Tag className={`rounded-surface border border-border bg-bg-raised ${className}`}>
      {children}
    </Tag>
  );
}

/**
 * The page container. Mobile-first means the layout ADAPTS upward, not that it
 * caps at a phone width and leaves a desktop two-thirds empty — which is what a
 * bare max-w-2xl does.
 *
 *   field   — reading and acting on records; wide enough for two columns of
 *             cards on a laptop, one on a phone.
 *   console — scanning tables; as wide as the content needs.
 *   form    — a single column of inputs. Deliberately narrow: line length is a
 *             legibility constraint, and a 1200px-wide text field is unusable.
 */
export function Page({
  children,
  size = "field",
}: {
  children: React.ReactNode;
  size?: "field" | "console" | "form";
}) {
  const width =
    size === "console" ? "max-w-6xl" : size === "form" ? "max-w-md" : "max-w-5xl";

  return (
    <main className={`mx-auto w-full ${width} px-5 py-8 sm:px-6 sm:py-10`}>{children}</main>
  );
}

/**
 * Cards in one column on a phone, two from `md` up. `items-start` matters:
 * without it, expanding a panel inside one card stretches its neighbour to
 * match, which looks like a rendering fault.
 */
export const cardGrid = "grid items-start gap-3 md:grid-cols-2";

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="mt-1 text-sm text-fg-muted">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/**
 * An empty state is a real state, not a blank area. It says what would be here,
 * why it is not, and what to do — in that order.
 */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-surface border border-dashed border-border px-6 py-12 text-center">
      <p className="font-medium">{title}</p>
      {description ? (
        <p className="mx-auto mt-1 max-w-sm text-sm text-fg-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
