import type { ErrorComponentProps } from "@tanstack/react-router";
import { Button, Heading, Text } from "components";
import { useEffect, useMemo, useState } from "react";
import { PrimaryButton } from "src/components/primary-button";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { BugReportDialog } from "src/components/bug-report-dialog";
import type { ReportStart } from "src/utils/diagnostics";

/**
 * Last-resort screen for an error that escaped a route.
 *
 * Offers a retry rather than a dead end, because the most likely cause is a failed index load
 * rather than broken code. A signed-in player can report the error from here.
 *
 * @param props error info provided by the router
 *
 * @returns the error card
 */
export function RouteError(props: ErrorComponentProps) {
    const [tg] = useTranslation();
    const [signedIn, setSignedIn] = useState(false);
    const [reporting, setReporting] = useState(false);
    const start = useMemo<ReportStart>(() => ({ kind: "error-screen", error: props.error }), [props.error]);
    // the router passes on whatever was thrown, not only Errors
    const message = props.error instanceof Error ? props.error.message : String(props.error);

    useEffect(() => {
        let cancelled = false;
        Api.accounts
            .me()
            .then((account) => {
                if (!cancelled) setSignedIn(account !== null);
            })
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, []);

    return (
        <main className={"grid min-h-svh place-items-center px-5"}>
            <div
                className={
                    "flex w-full max-w-sm flex-col gap-4 rounded-lg border border-zinc-300 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-900"
                }
            >
                <Heading level={1}>{tg("heading.something-went-wrong")}</Heading>
                <Text>{message}</Text>
                <PrimaryButton onClick={() => props.reset()}>{tg("button.try-again")}</PrimaryButton>
                {signedIn ? (
                    <Button outline={true} onClick={() => setReporting(true)}>
                        {tg("button.report-bug")}
                    </Button>
                ) : null}
                <Button plain href={"/scan"}>
                    {tg("button.to-scanner")}
                </Button>
            </div>
            {signedIn ? (
                <BugReportDialog
                    open={reporting}
                    onClose={() => setReporting(false)}
                    start={start}
                    initialText={tg("description.bug-report-error-text", { message })}
                />
            ) : null}
        </main>
    );
}
