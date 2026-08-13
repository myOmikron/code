import { ArrowDownTrayIcon, ArrowUpOnSquareIcon, SquaresPlusIcon, XMarkIcon } from "@heroicons/react/24/outline";
import React from "react";
import { useTranslation } from "react-i18next";
import { Button, Dialog, DialogActions, DialogBody, DialogTitle } from "components";
import {
    clearInstallPrompt,
    dismissInstall,
    getInstallPrompt,
    isInstallDismissed,
    subscribeInstallPrompt,
} from "src/utils/install-prompt";

/**
 * Whether the app already runs from the home screen
 *
 * @returns whether the app is installed
 */
function isStandalone(): boolean {
    return (
        window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true
    );
}

/**
 * Whether this is an iOS device, iPadOS included
 *
 * iPadOS reports itself as a Mac, telling it apart needs the touch points.
 *
 * @returns whether the browser runs on iOS
 */
function isIos(): boolean {
    const ua = navigator.userAgent;
    return /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
}

/**
 * Banner offering to install the app on the home screen.
 *
 * Chromium hands out an install prompt the button can trigger. WebKit does
 * not — on iOS the install runs through the share sheet, so the button opens
 * instructions instead. Renders nothing where neither applies, where the app
 * is already installed, or once the customer dismissed it.
 *
 * @returns the banner, or nothing
 */
export function InstallBanner() {
    const [t] = useTranslation("shop");
    const event = React.useSyncExternalStore(subscribeInstallPrompt, getInstallPrompt);
    const [showHint, setShowHint] = React.useState(false);
    const [iosHint, setIosHint] = React.useState(false);
    const [dismissed, setDismissed] = React.useState(true);

    React.useEffect(() => {
        setIosHint(isIos() && !isStandalone());
        setDismissed(isInstallDismissed());
    }, []);

    if (dismissed || (!event && !iosHint)) return null;

    /**
     * Open the browser's install dialog, or the iOS instructions
     */
    async function install() {
        if (!event) {
            setShowHint(true);
            return;
        }
        try {
            await event.prompt();
            await event.userChoice;
        } finally {
            clearInstallPrompt();
        }
    }

    /**
     * Hide the banner for good
     */
    function dismiss() {
        dismissInstall();
        setDismissed(true);
    }

    return (
        <>
            <div
                className={
                    "flex flex-col gap-4 rounded-2xl border border-zinc-950/10 bg-[var(--surface-card)] p-4 sm:flex-row sm:items-center dark:border-white/10"
                }
            >
                <div
                    className={
                        "flex size-12 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400"
                    }
                >
                    <ArrowDownTrayIcon className={"size-6"} aria-hidden={true} />
                </div>
                <div className={"flex-1"}>
                    <p className={"font-semibold text-zinc-950 dark:text-white"}>{t("heading.install-app")}</p>
                    <p className={"text-sm text-zinc-500 dark:text-zinc-400"}>{t("description.install-app")}</p>
                </div>
                <div className={"flex items-center gap-2"}>
                    <Button color={"blue"} onClick={() => void install()} className={"flex-1 sm:flex-none"}>
                        {t("button.install-app")}
                    </Button>
                    <button
                        type={"button"}
                        onClick={dismiss}
                        aria-label={t("accessibility.dismiss-install")}
                        className={
                            "flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white"
                        }
                    >
                        <XMarkIcon className={"size-5"} />
                    </button>
                </div>
            </div>

            <Dialog open={showHint} onClose={() => setShowHint(false)} size={"sm"}>
                <DialogTitle>{t("heading.install-app")}</DialogTitle>
                <DialogBody>
                    <ol className={"flex flex-col gap-4 text-base/7 text-zinc-700 dark:text-zinc-200"}>
                        <li className={"flex items-center gap-3"}>
                            <ArrowUpOnSquareIcon className={"size-6 shrink-0"} aria-hidden={true} />
                            {t("description.install-ios-share")}
                        </li>
                        <li className={"flex items-center gap-3"}>
                            <SquaresPlusIcon className={"size-6 shrink-0"} aria-hidden={true} />
                            {t("description.install-ios-add")}
                        </li>
                    </ol>
                </DialogBody>
                <DialogActions>
                    <Button color={"blue"} onClick={() => setShowHint(false)}>
                        {t("button.close")}
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
}
