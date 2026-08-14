/** Borders, not shadows. */
export function Surface({
  children,
  className = "",
  as: Tag = "div",
  ...props
}: {
  children: React.ReactNode;
  className?: string;
  as?: "div" | "section" | "li" | "article";
} & React.HTMLAttributes<HTMLElement>) {
  return (
    // Extra props are forwarded so a card can carry an id or pointer handlers without its
    // caller abandoning the primitive and hand-rolling the border.
    <Tag className={`rounded-surface border border-border bg-bg-raised ${className}`} {...props}>
      {children}
    </Tag>
  );
}

/** The page container. */
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

/** Cards in one column on a phone, two from `md` up. */
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

/** An empty state is a real state, not a blank area. */
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
