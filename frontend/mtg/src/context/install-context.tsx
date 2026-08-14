import { ArrowUpOnSquareIcon, SquaresPlusIcon } from "@heroicons/react/24/outline";
import { Button, Dialog, DialogActions, DialogBody, DialogTitle } from "components";
import { createContext, useCallback, useContext, useMemo, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
    clearInstallPrompt,
    getInstallPrompt,
    isIos,
    isStandalone,
    subscribeInstallPrompt,
} from "src/utils/install-prompt";

/**
 * Installing the app, offered by the menu entry.
 */
type InstallValue = {
    /** Whether the app can be installed from here at all */
    canInstall: boolean;
    /** Open the browser's install dialog, or the iOS instructions */
    install: () => void;
};

const InstallContext = createContext<InstallValue | null>(null);

/**
 * Offers the app install to the whole app
 */
export function InstallProvider({ children }: { children: ReactNode }) {
    const [tg] = useTranslation();
    const prompt = useSyncExternalStore(subscribeInstallPrompt, getInstallPrompt);
    const [iosHint, setIosHint] = useState(false);
    // Neither changes while the app runs — an installed app is opened from the
    // home screen, which is a fresh load.
    const [{ standalone, ios }] = useState(() => ({ standalone: isStandalone(), ios: isIos() }));

    // Chromium hands out a prompt, WebKit never does — there the install runs
    // through the share sheet, which only instructions can point at.
    const canInstall = !standalone && (!!prompt || ios);

    const install = useCallback(() => {
        const event = getInstallPrompt();
        if (!event) {
            setIosHint(true);
            return;
        }
        void (async () => {
            try {
                await event.prompt();
                await event.userChoice;
            } finally {
                clearInstallPrompt();
            }
        })();
    }, []);

    const value = useMemo(() => ({ canInstall, install }), [canInstall, install]);

    return (
        <InstallContext value={value}>
            {children}
            <Dialog open={iosHint} onClose={() => setIosHint(false)} size={"sm"}>
                <DialogTitle>{tg("heading.install-app")}</DialogTitle>
                <DialogBody>
                    <ol className={"flex flex-col gap-4 text-base/7 text-zinc-700 dark:text-zinc-200"}>
                        <li className={"flex items-center gap-3"}>
                            <ArrowUpOnSquareIcon className={"size-6 shrink-0"} aria-hidden={true} />
                            {tg("description.install-ios-share")}
                        </li>
                        <li className={"flex items-center gap-3"}>
                            <SquaresPlusIcon className={"size-6 shrink-0"} aria-hidden={true} />
                            {tg("description.install-ios-add")}
                        </li>
                    </ol>
                </DialogBody>
                <DialogActions>
                    <Button color={"blue"} onClick={() => setIosHint(false)}>
                        {tg("button.close")}
                    </Button>
                </DialogActions>
            </Dialog>
        </InstallContext>
    );
}

/**
 * Access the app install
 *
 * @returns whether the app can be installed, and how to start it
 */
export function useInstall(): InstallValue {
    const value = useContext(InstallContext);
    if (!value) throw new Error("useInstall must be used inside an InstallProvider");
    return value;
}
