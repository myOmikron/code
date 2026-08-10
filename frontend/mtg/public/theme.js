/*
 * Puts the dark class on <html> before the first paint, so a dark page never
 * flashes white on its way in.
 *
 * Its own file rather than an inline script: inline would force the content
 * security policy to allow `unsafe-inline` for scripts, or to carry a hash that
 * has to be regenerated on every edit. Referenced from index.html as a plain
 * blocking script in the head — `type="module"` would defer it until after the
 * document is parsed, which is exactly the flash this avoids.
 *
 * Kept in step with src/utils/theme.ts, which owns the same rule at runtime.
 * Duplicated on purpose: the bundle is not loaded yet at this point.
 */
if (
    localStorage.theme === "dark" ||
    (!("theme" in localStorage) && window.matchMedia("(prefers-color-scheme: dark)").matches)
) {
    document.documentElement.classList.add("dark");
}
