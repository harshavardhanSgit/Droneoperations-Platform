"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

import { applyTheme, THEME_STORAGE_KEY, type Theme } from "./theme";

/**
 * The theme lives in localStorage, not in React state. localStorage is an external system, so
 * it is read through useSyncExternalStore rather than mirrored into state inside an effect.
 */
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Fired by OTHER tabs only — the tab that wrote the value notifies itself through the
  // listener set below.
  window.addEventListener("storage", listener);

  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/** Must return a primitive, or a value stable across calls. */
function getSnapshot(): Theme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    // Safari's private mode throws outright.
    return "system";
  }
}

/** The server cannot know; "system" is also what the CSS does by default. */
const getServerSnapshot = (): Theme => "system";

/** Keeps <html data-theme> in step with the stored choice. */
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

    // No applyTheme() here: ThemeProvider's effect is the single owner of the attribute.
    listeners.forEach((listener) => listener());
  }, []);

  return { theme, setTheme };
}
