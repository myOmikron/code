import { EyeIcon } from "@heroicons/react/20/solid";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { useAccount } from "src/context/account";
import { formatTime } from "src/utils/format";

/** Slack past the expiry before the session is read again, so the backend has surely let go */
const EXPIRY_SLACK_MS = 1_000;

/**
 * The banner of an Admin's Impersonation: whose Account the session acts as, until when,
 * and a button to end it.
 *
 * Rendered above every layout, also on pages that took the whole screen, and it has no
 * way to put it away: an Admin must never forget they are not acting as themselves.
 *
 * Ending, and the expiry passing, load the app afresh, so no page or cache keeps showing
 * the Account's data to the Admin.
 *
 * @returns the banner, or nothing outside an Impersonation
 */
export function ImpersonationBanner() {
    const [tg] = useTranslation();
    const { account, refresh } = useAccount();
    const [ending, setEnding] = useState(false);

    const impersonation = account?.impersonation ?? null;
    const expiresAt = impersonation?.expires_at ?? null;

    useEffect(() => {
        if (expiresAt === null) return;
        const delay = Math.max(Date.parse(expiresAt) - Date.now(), 0) + EXPIRY_SLACK_MS;
        const timer = window.setTimeout(async () => {
            // Reloads only once the backend agrees, so a clock running ahead cannot loop
            const current = await refresh();
            if (current?.impersonation === null || current?.impersonation === undefined) window.location.reload();
        }, delay);
        return () => window.clearTimeout(timer);
    }, [expiresAt, refresh]);

    if (account === null || impersonation === null) return null;

    /**
     * Ends the Impersonation and returns to the impersonated Account's admin page as the Admin
     */
    async function end() {
        if (account === null) return;
        const impersonated = account.uuid;
        setEnding(true);
        try {
            // An Impersonation that is already over answers `not_impersonating`; either way
            // the session is the Admin's own now.
            await Api.accounts.endImpersonation();
            window.location.assign(`/admin/accounts/${impersonated}`);
        } catch {
            setEnding(false);
        }
    }

    return (
        <div
            role={"status"}
            className={
                "flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-purple-600 px-4 py-1.5 text-sm font-medium text-white dark:bg-purple-500/30 dark:text-purple-100"
            }
        >
            <span className={"flex items-center gap-2 text-center"}>
                <EyeIcon className={"size-4 shrink-0"} />
                {tg("label.impersonation", {
                    username: impersonation.username,
                    time: formatTime(impersonation.expires_at),
                })}
            </span>
            <button
                type={"button"}
                onClick={end}
                disabled={ending}
                className={
                    "rounded-md bg-white px-2.5 py-0.5 text-sm font-semibold text-purple-700 transition hover:bg-purple-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-60 dark:bg-purple-100 dark:text-purple-900 dark:hover:bg-white"
                }
            >
                {tg("button.end-impersonation")}
            </button>
        </div>
    );
}
