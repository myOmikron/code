import { ExclamationTriangleIcon, XMarkIcon } from "@heroicons/react/20/solid";
import { useState } from "react";
import { useTranslation } from "react-i18next";

/** The browser-local dismissal marker */
const STORAGE_KEY = "version-warning-dismissed";

/**
 * Whether this browser has already put the warning away
 *
 * @returns `true` when the warning was dismissed
 */
function wasDismissed(): boolean {
    try {
        return localStorage.getItem(STORAGE_KEY) === "true";
    } catch {
        return false;
    }
}

/**
 * The banner warning that this is still a 0.x build.
 *
 * Rendered above everything else so no page can be mistaken for a finished
 * product while the data model may still change under it. Keyed off the baked
 * in version rather than a flag someone has to remember: the day a `mtg/v1.0.0`
 * tag is pushed the banner is gone without anyone touching this file.
 *
 * The version comes from that tag — see the `APP_VERSION` build arg in
 * `vite.config.ts` — so what it names is the release the user is looking at.
 *
 * Dismissal belongs to the browser rather than the account, so it is kept in
 * `localStorage`. If storage is unavailable, the banner still stays dismissed
 * until the page is reloaded.
 *
 * @returns the banner, or nothing from 1.0 on
 */
export function VersionWarning() {
    const [tg] = useTranslation();
    const [dismissed, setDismissed] = useState(wasDismissed);

    if (!__APP_VERSION__.startsWith("0.") || dismissed) {
        return null;
    }

    /** Remembers the choice and immediately puts the banner away */
    const dismiss = () => {
        setDismissed(true);
        try {
            localStorage.setItem(STORAGE_KEY, "true");
        } catch {
            // Storage unavailable (private mode), so the choice lasts this session.
        }
    };

    return (
        <div
            className={
                "relative flex items-center justify-center gap-2 bg-amber-500/15 px-10 py-1.5 text-xs font-medium text-amber-800 dark:bg-amber-400/10 dark:text-amber-300"
            }
        >
            <ExclamationTriangleIcon className={"size-4 shrink-0"} />
            <span className={"text-center"}>{tg("label.version-warning", { version: __APP_VERSION__ })}</span>
            <button
                type={"button"}
                onClick={dismiss}
                title={tg("button.close")}
                aria-label={tg("button.close")}
                className={
                    "absolute right-2 rounded p-0.5 transition hover:bg-amber-950/10 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-current dark:hover:bg-white/10"
                }
            >
                <XMarkIcon className={"size-4"} />
            </button>
        </div>
    );
}
