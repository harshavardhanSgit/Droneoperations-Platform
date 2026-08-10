"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

import { applyTheme, THEME_STORAGE_KEY, type Theme } from "./theme";

/**
 * The theme lives in localStorage, not in React state.
 *
 * localStorage is an external system, so it is read through
 * useSyncExternalStore rather than mirrored into state inside an effect. Three
 * things fall out of that for free:
 *
 *   - no setState-in-an-effect cascade;
 *   - hydration is handled by React, which uses the server snapshot for the
 *     first render and re-renders once with the real value;
 *   - changing the theme in one tab updates every other open tab, because the
 *     browser's own `storage` event is part of the subscription.
 *
 * The same pattern the map uses for "am I on the client yet" (useMapMounted).
 */
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Fired by OTHER tabs only — the tab that wrote the value notifies itself
  // through the listener set below.
  window.addEventListener("storage", listener);

  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/**
 * Must return a primitive, or a value stable across calls. A fresh object here
 * would compare unequal every time and spin React forever.
 */
function getSnapshot(): Theme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    // Safari's private mode throws outright. Following the OS is a perfectly
    // good fallback, and a theme preference is never worth a blank page.
    return "system";
  }
}

/** The server cannot know; "system" is also what the CSS does by default. */
const getServerSnapshot = (): Theme => "system";

/**
 * Keeps <html data-theme> in step with the stored choice.
 *
 * This is the ONE place the attribute is written after first paint, so a
 * change made in another tab lands here too — the `storage` subscription
 * re-renders this component, and the effect follows. (The inline script in
 * <head> owns the very first paint; this owns everything after it.)
 *
 * A legitimate effect: it pushes React's value into an external system, the
 * DOM. It sets no state.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  return <>{children}</>;
}

export function useTheme(): { theme: Theme; setTheme: (theme: Theme) => void } {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setTheme = useCallback((next: Theme) => {
    try {
      if (next === "system") {
        localStorage.removeItem(THEME_STORAGE_KEY);
      } else {
        localStorage.setItem(THEME_STORAGE_KEY, next);
      }
    } catch {
      // Still applies for this session; it just will not persist.
    }

    // No applyTheme() here: ThemeProvider's effect is the single owner of the
    // attribute, and it runs as soon as this notification lands.
    // localStorage does not fire `storage` in the tab that wrote it, so this
    // tab is notified explicitly.
    listeners.forEach((listener) => listener());
  }, []);

  return { theme, setTheme };
}
