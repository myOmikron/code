import { TextLink } from "components";
import { useTranslation } from "react-i18next";
import { FOOTER_MARKER } from "src/utils/use-footer-dodge";

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
 * It also carries the two legal pages, which is the one place every screen of
 * the app has in common: they have to be reachable from anywhere, signed in or
 * not, and an installed app has no other permanent chrome to put them in.
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
            {...{ [FOOTER_MARKER]: true }}
            className={"flex h-6 items-center justify-center gap-2 px-4 text-[0.7rem] text-zinc-500 dark:text-zinc-400"}
        >
            <span>{tg("label.version", { version: __APP_VERSION__ })}</span>
            <span aria-hidden={true}>·</span>
            <TextLink href={"/legal"} className={"decoration-current/40"}>
                {tg("button.imprint")}
            </TextLink>
            <span aria-hidden={true}>·</span>
            <TextLink href={"/privacy"} className={"decoration-current/40"}>
                {tg("button.privacy")}
            </TextLink>
        </div>
    );
}
