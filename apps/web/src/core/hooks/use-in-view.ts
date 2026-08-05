"use client";

import { useEffect, useRef, useState } from "react";

/**
 * True once the element has been scrolled into view, and true forever after.
 *
 * Deliberately one-way: a section that fades out again when you scroll back up
 * is a distraction, not an effect. Unobserving on the first hit also means the
 * observer stops doing work for the rest of the session.
 *
 * Falls back to visible when IntersectionObserver is missing, so a browser
 * without it shows the content rather than a permanently blank page — the
 * failure mode of a reveal animation must never be "no content".
 */
export function useInView<T extends HTMLElement>(rootMargin = "-12% 0px") {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const element = ref.current;

    if (!element) return;

    if (typeof IntersectionObserver === "undefined") {
      // Scheduled rather than set inline: a synchronous setState in an effect
      // body forces a second render pass before paint. One frame is invisible
      // and keeps the fallback honest.
      const frame = requestAnimationFrame(() => setInView(true));
      return () => cancelAnimationFrame(frame);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setInView(true);
            observer.unobserve(entry.target);
          }
        }
      },
      { rootMargin },
    );

    observer.observe(element);

    return () => observer.disconnect();
  }, [rootMargin]);

  return { ref, inView };
}
