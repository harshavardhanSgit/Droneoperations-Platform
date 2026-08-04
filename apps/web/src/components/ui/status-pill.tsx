import { TONE_DOT, TONE_SURFACE, type Tone } from "./tone";

/**
 * A dot plus a word, not a saturated block of colour.
 *
 * Solid pills compete with the content they annotate, and a list of twelve of
 * them reads as a paint chart. The dot carries the signal at a glance; the word
 * carries it for anyone who cannot distinguish the hue — which is why the label
 * is never optional.
 */
export function StatusPill({
  tone,
  children,
  size = "field",
}: {
  tone: Tone;
  children: React.ReactNode;
  size?: "field" | "console";
}) {
  const dense = size === "console";

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full font-medium ${TONE_SURFACE[tone]} ${
        dense ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-[13px]"
      }`}
    >
      <span className={`size-1.5 rounded-full ${TONE_DOT[tone]}`} />
      {children}
    </span>
  );
}
