import type { ErrorComponentProps } from "@tanstack/react-router";
import { Button, Heading, PrimaryButton, Text } from "components";
import { useTranslation } from "react-i18next";

/**
 * Last-resort screen for an error that escaped a route.
 *
 * Offers a retry rather than a dead end, because the most likely cause is a failed index load
 * rather than broken code.
 *
 * @param props error info provided by the router
 *
 * @returns the error card
 */
export function RouteError(props: ErrorComponentProps) {
    const [tg] = useTranslation();

    return (
        <main className={"grid min-h-svh place-items-center px-5"}>
            <div
                className={
                    "flex w-full max-w-sm flex-col gap-4 rounded-lg border border-zinc-300 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-900"
                }
            >
                <Heading level={1}>{tg("heading.something-went-wrong")}</Heading>
                <Text>{props.error.message}</Text>
                <PrimaryButton onClick={() => props.reset()}>{tg("button.try-again")}</PrimaryButton>
                <Button plain href={"/scan"}>
                    {tg("button.to-scanner")}
                </Button>
            </div>
        </main>
    );
}
