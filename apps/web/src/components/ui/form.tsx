import type { InputHTMLAttributes, SelectHTMLAttributes } from "react";

import { Button } from "./button";

/**
 * Inputs are 44px tall for the same reason buttons are: these forms are filled
 * in on a phone, outdoors. A 32px input is a desktop assumption.
 */
const fieldClass =
  "h-11 w-full rounded-control border border-border-strong bg-bg px-3 text-[15px] outline-none focus:border-accent disabled:opacity-50";

export function Field({
  label,
  error,
  hint,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      <input className={fieldClass} aria-invalid={Boolean(error)} {...props} />
      {hint && !error ? <span className="mt-1 block text-xs text-fg-subtle">{hint}</span> : null}
      {error ? <span className="mt-1 block text-xs text-danger">{error}</span> : null}
    </label>
  );
}

export function SelectField({
  label,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      <select className={fieldClass} {...props}>
        {children}
      </select>
    </label>
  );
}

export function SubmitButton({ children, pending }: { children: string; pending: boolean }) {
  return (
    <Button type="submit" variant="primary" size="field" full disabled={pending}>
      {pending ? "Please wait…" : children}
    </Button>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;

  return (
    <p role="alert" className="rounded-control bg-danger-bg px-3 py-2 text-sm text-danger">
      {message}
    </p>
  );
}
