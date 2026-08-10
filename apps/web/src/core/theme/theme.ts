export type Theme = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "drone-ops-theme";

/**
 * Applied to <html> before the first paint, and again whenever the choice
 * changes. "system" removes the attribute entirely rather than resolving it to
 * a value, so the CSS media query stays in charge — which means the page still
 * follows the OS if it changes while the tab is open, with no listener.
 */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;

  if (theme === "system") {
    root.removeAttribute("data-theme");
    return;
  }

  root.setAttribute("data-theme", theme);
}

/**
 * Runs before React, inlined in <head>, to stop the flash of the wrong theme.
 *
 * This has to be a blocking inline script: anything deferred — a component
 * effect, a module import — runs AFTER the browser has already painted, so a
 * dark-mode user would see a white page for a frame on every navigation. It is
 * stringified rather than imported for the same reason.
 *
 * Wrapped in try/catch because localStorage throws outright in Safari's
 * private mode, and a theme preference is never worth a blank page.
 */
export const THEME_SCRIPT = `
(function () {
  try {
    var t = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
    if (t === "light" || t === "dark") {
      document.documentElement.setAttribute("data-theme", t);
    }
  } catch (e) {}
})();
`;
