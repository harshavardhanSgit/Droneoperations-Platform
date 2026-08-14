export type Theme = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "drone-ops-theme";

/** Applied to <html> before the first paint, and again whenever the choice changes. */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;

  if (theme === "system") {
    root.removeAttribute("data-theme");
    return;
  }

  root.setAttribute("data-theme", theme);
}

/** Runs before React, inlined in <head>, to stop the flash of the wrong theme. */
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
