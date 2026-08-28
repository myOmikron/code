import { useTranslation } from "react-i18next";

/**
 * The line along the bottom of the app, naming the build it is running.
 *
 * Worth a permanent strip because a bug report that does not say which version
 * it came from costs a round trip to find out, and the answer is not something
 * a user can look up: an installed app has no address bar and no about page,
 * and the service worker may be serving a build older than the last deploy.
 *
 * The version is the one baked in at build time — see the `APP_VERSION` build
 * arg in `vite.config.ts` — so what it names is the release on screen, not
 * whatever `package.json` said when the tag was cut.
 *
 * Its height is fixed rather than left to the type, because the pages that size
 * themselves against the viewport subtract it — see the table counter.
 *
 * @returns the footer line
 */
export function AppFooter() {
    const [tg] = useTranslation();

    return (
        <div
            className={
                "flex h-6 items-center justify-center px-4 text-[0.7rem] text-zinc-500 tabular-nums dark:text-zinc-400"
            }
        >
            {tg("label.version", { version: __APP_VERSION__ })}
        </div>
    );
}
