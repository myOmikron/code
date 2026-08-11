import { ExclamationTriangleIcon } from "@heroicons/react/20/solid";
import { useTranslation } from "react-i18next";

/**
 * The banner warning that this is still a 0.x build.
 *
 * Rendered above everything else so no page can be mistaken for a finished
 * product while the data model may still change under it. Keyed off the baked
 * in version rather than a flag someone has to remember: the day the version
 * turns 1.0.0 the banner is gone without anyone touching this file.
 *
 * Deliberately not dismissible — it is one slim line, and a warning that can
 * be clicked away once and never seen again does not warn the second user of
 * the same browser.
 *
 * @returns the banner, or nothing from 1.0 on
 */
export function VersionWarning() {
    const [tg] = useTranslation();

    if (!__APP_VERSION__.startsWith("0.")) {
        return null;
    }

    return (
        <div
            className={
                "flex items-center justify-center gap-2 bg-amber-500/15 px-4 py-1.5 text-xs font-medium text-amber-800 dark:bg-amber-400/10 dark:text-amber-300"
            }
        >
            <ExclamationTriangleIcon className={"size-4 shrink-0"} />
            <span>{tg("label.version-warning", { version: __APP_VERSION__ })}</span>
        </div>
    );
}
