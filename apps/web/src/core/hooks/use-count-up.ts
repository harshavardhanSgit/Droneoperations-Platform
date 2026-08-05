"use client";

import { useEffect, useState } from "react";

/**
 * Counts from zero to `target` once `active` becomes true.
 *
 * Driven by requestAnimationFrame against elapsed time, not a fixed step per
 * frame: a setInterval counter runs at different speeds on a 60Hz and a 120Hz
 * display, and drifts whenever the tab is throttled. Time-based easing lands on
 * the exact target at the exact duration regardless.
 *
 * Honours prefers-reduced-motion by showing the final figure immediately — the
 * number is the information; the animation is not.
 */
export function useCountUp(target: number, active: boolean, durationMs = 1400) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!active) return;

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    // Reduced motion is a zero-length animation rather than a separate branch:
    // the first frame reports progress 1 and lands on the target, so there is
    // no synchronous setState in the effect body and only one code path.
    const duration = reduced ? 0 : durationMs;

    let frame = 0;
    const started = performance.now();

    const step = (now: number) => {
      const progress = duration <= 0 ? 1 : Math.min(1, (now - started) / duration);
      // Ease-out cubic: fast at the start, settling rather than stopping dead.
      const eased = 1 - Math.pow(1 - progress, 3);

      setValue(Math.round(target * eased));

      if (progress < 1) frame = requestAnimationFrame(step);
    };

    frame = requestAnimationFrame(step);

    return () => cancelAnimationFrame(frame);
  }, [target, active, durationMs]);

  return value;
}
