/**
 * The vocabulary features use to describe meaning. A feature says a booking is
 * "warning"; this layer decides what warning looks like. Nothing in components/ui
 * may import a domain type, and nothing in features/ may name a colour.
 */
export type Tone = "success" | "warning" | "danger" | "info" | "neutral";

export const TONE_TEXT: Record<Tone, string> = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  info: "text-info",
  neutral: "text-neutral",
};

export const TONE_SURFACE: Record<Tone, string> = {
  success: "bg-success-bg text-success",
  warning: "bg-warning-bg text-warning",
  danger: "bg-danger-bg text-danger",
  info: "bg-info-bg text-info",
  neutral: "bg-neutral-bg text-neutral",
};

export const TONE_DOT: Record<Tone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
  neutral: "bg-neutral",
};
