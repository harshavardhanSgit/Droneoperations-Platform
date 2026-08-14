import type { ButtonHTMLAttributes } from "react";

/** Size is the density decision, made explicit. field — 44px. */
type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "field" | "console";

const VARIANT: Record<Variant, string> = {
  primary: "bg-accent text-accent-fg hover:opacity-90",
  secondary: "border border-border-strong text-fg hover:bg-neutral-bg",
  ghost: "text-fg-muted hover:bg-neutral-bg hover:text-fg",
  danger: "border border-danger text-danger hover:bg-danger-bg",
};

const SIZE: Record<Size, string> = {
  field: "h-11 px-4 text-[15px]",
  console: "h-8 px-3 text-sm",
};

export function Button({
  variant = "secondary",
  size = "field",
  full = false,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  full?: boolean;
}) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-control font-medium transition-opacity disabled:pointer-events-none disabled:opacity-45 ${VARIANT[variant]} ${SIZE[size]} ${full ? "w-full" : ""} ${className}`}
      {...props}
    />
  );
}
