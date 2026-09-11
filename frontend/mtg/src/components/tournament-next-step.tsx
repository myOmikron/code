import { PlayIcon, TrophyIcon } from "@heroicons/react/20/solid";
import { ConfirmDialog, PrimaryButton, Text } from "components";
import type { ReactNode } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import type { TournamentStatus } from "src/api/generated";

/**
 * The one step forward a tournament can take from where it stands
 *
 * The lifecycle is a straight line — Registration, Running, Finished — with `Cancelled` as the
 * only branch off it, and that one lives in the settings tab where the rest of the irreversible
 * things are. So there is never a choice to offer here, only the next step or nothing.
 */
type NextStep = {
    /** The status the button moves the tournament to */
    to: TournamentStatus;
    /** The `tournament` namespace key naming the button */
    button: string;
    /** The dialog's title key — every remaining step is worth confirming */
    confirm: string;
    /** What the dialog says the step costs */
    confirmDescription: string;
    /** The icon on the button */
    icon: ReactNode;
};

/**
 * What a tournament's next step is, or `null` once it has none
 *
 * @param status where the tournament stands
 *
 * @returns the step, or `null` for a finished or cancelled event
 */
function nextStep(status: TournamentStatus): NextStep | null {
    switch (status) {
        case "Registration":
            return {
                to: "Running",
                button: "button.start-tournament",
                confirm: "heading.start-tournament",
                confirmDescription: "description.confirm-start-tournament",
                icon: <PlayIcon />,
            };
        case "Running":
            return {
                to: "Finished",
                button: "button.finish-tournament",
                confirm: "heading.finish-tournament",
                confirmDescription: "description.confirm-finish-tournament",
                icon: <TrophyIcon />,
            };
        case "Finished":
        case "Cancelled":
            return null;
    }
}

/** How many names are read out before the rest become a count */
const NAMES_SHOWN = 5;

/**
 * Names, read as a list, with a long tail folded into a count
 *
 * Ten people who never checked in is a paragraph nobody reads; five and "und 5 weitere" is a
 * sentence. The caller supplies the tail's wording so this stays free of the translator.
 *
 * @param names the names to read out
 * @param more renders the tail for the names that did not fit
 *
 * @returns the sentence
 */
function namesSentence(names: Array<string>, more: (count: number) => string): string {
    if (names.length <= NAMES_SHOWN) return names.join(" · ");
    const shown = names.slice(0, NAMES_SHOWN).join(" · ");
    return `${shown} · ${more(names.length - NAMES_SHOWN)}`;
}

/**
 * The properties for {@link TournamentNextStep}
 */
export type TournamentNextStepProps = {
    /** The tournament to move along */
    tournamentUuid: string;
    /** Where it stands right now */
    status: TournamentStatus;
    /** Whether the viewer may move it — a scorekeeper may not */
    mayManage: boolean;
    /** The names still waiting to be checked in, in roster order */
    awaiting: Array<string>;
    /** Called after the status changed, so the caller can reload */
    onChanged: () => void | Promise<void>;
};

/**
 * The button that moves a tournament to its next stage, floating at the bottom of the page.
 *
 * Sticky rather than parked at the end: an organizer works down the roster checking people in and
 * then starts the event, so the button has to still be there after a screen of scrolling. It
 * settles into the flow at the bottom of the page once there is nothing left to scroll.
 *
 * Renders nothing for a finished or cancelled event, and nothing for staff who may not manage —
 * an always-visible button that refuses is worse than no button.
 *
 * Deliberately silent on success. The app's toasts come up bottom-right, which is exactly where
 * this button sits, so a toast here would cover the one thing it is confirming — and there is
 * nothing left to confirm anyway: the status badge in the header changes and the button relabels
 * itself to the next step, or goes away.
 *
 * @returns the floating action, or nothing
 */
export function TournamentNextStep({
    tournamentUuid,
    status,
    mayManage,
    awaiting,
    onChanged,
}: TournamentNextStepProps) {
    const [t] = useTranslation("tournament");
    const [confirming, setConfirming] = useState(false);

    const step = nextStep(status);
    if (step === null || !mayManage) return null;

    /** Moves the tournament to the step's status */
    async function advance() {
        if (step === null) return;
        setConfirming(false);
        await Api.tournaments.setStatus(tournamentUuid, step.to);
        await onChanged();
    }

    return (
        <>
            {/* A scrim, not a bare floating button: the roster's own rows carry right-aligned
                controls, and a solid button parked on top of one reads as a mis-click waiting to
                happen. Content fades into the page's own ground under it instead. */}
            <div
                className={
                    "sticky bottom-0 z-10 -mx-2 flex justify-end bg-gradient-to-t from-(--surface-page) from-60% to-transparent px-2 pt-10 pb-4"
                }
            >
                <PrimaryButton className={"shadow-(--shadow-card-lg)"} onClick={() => setConfirming(true)}>
                    {step.icon}
                    {t(step.button)}
                </PrimaryButton>
            </div>

            <ConfirmDialog
                open={confirming}
                onClose={() => setConfirming(false)}
                onConfirm={advance}
                title={t(step.confirm)}
                description={t(step.confirmDescription)}
                confirmLabel={t(step.button)}
            >
                {/* Starting the event clears the check-in queue, so the people about to lose
                    their place are named before the click rather than counted after it. */}
                {step.to === "Running" && awaiting.length > 0 && (
                    <div className={"mt-4 flex flex-col gap-1"}>
                        <Text className={"text-sm"}>
                            {t("description.confirm-drop-awaiting", { count: awaiting.length })}
                        </Text>
                        <Text className={"text-sm font-medium text-zinc-950 dark:text-white"}>
                            {namesSentence(awaiting, (count) => t("label.and-more", { count }))}
                        </Text>
                    </div>
                )}
            </ConfirmDialog>
        </>
    );
}
