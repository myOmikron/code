/**
 * Light or dark, and remembering which.
 *
 * Tailwind is configured with `@custom-variant dark (&:where(.dark, .dark *))`,
 * so every `dark:` style in the app hangs off a class on `<html>` rather than
 * off the media query. Something has to put that class there — this is it,
 * together with the inline script in `index.html` that does the same thing
 * before the first paint so the page never flashes white on the way to dark.
 *
 * The choice lives in `localStorage` and nowhere else: it is a property of this
 * browser, not of the account, and syncing it through the backend would mean a
 * round trip before the app knows what colour it is.
 */

/** What the user picked */
export type Theme = "system" | "light" | "dark";

/** The `localStorage` key — shared with the bootstrap script in `index.html` */
const STORAGE_KEY = "theme";

/**
 * The stored choice, `system` when there is none
 *
 * @returns the theme
 */
export function currentTheme(): Theme {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
}

/**
 * Whether the page should be dark right now
 *
 * @param theme the choice to evaluate
 *
 * @returns `true` for dark
 */
function isDark(theme: Theme): boolean {
    if (theme !== "system") return theme === "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/**
 * Stores a choice and applies it to the document.
 *
 * `system` is stored as the *absence* of a key rather than as a value, which is
 * what lets the bootstrap script decide with one `in` check and no parsing.
 *
 * @param theme the choice
 */
export function applyTheme(theme: Theme) {
    if (theme === "system") localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, theme);

    document.documentElement.classList.toggle("dark", isDark(theme));
}

/**
 * Follows the operating system while the choice is `system`.
 *
 * Without this, "system" would mean "whatever the system was when the tab was
 * opened" — a tab left open past sunset would stay light through the switch.
 *
 * @returns a function removing the listener again
 */
export function watchSystemTheme(): () => void {
    const query = window.matchMedia("(prefers-color-scheme: dark)");

    /** Re-applies the choice, which only changes anything while it is `system` */
    const onChange = () => {
        if (currentTheme() === "system") applyTheme("system");
    };

    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
}
