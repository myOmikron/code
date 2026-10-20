import { PlayIcon, TrophyIcon } from "@heroicons/react/20/solid";
import { ConfirmDialog, PrimaryButton, Text } from "components";
import type { ReactNode } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import type { TournamentStatus } from "src/api/generated";

/**
 * The one step forward a tournament can take (cancelling lives on the settings tab)
 */
type NextStep = {
    /** The status the button moves the tournament to */
    to: TournamentStatus;
    /** The `tournament` namespace key naming the button */
    button: string;
    /** The confirmation dialog's title key */
    confirm: string;
    /** The confirmation dialog's description key */
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
 * Joins names into one line, folding everything past {@link NAMES_SHOWN} into a count
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
    /** Whether the viewer may move it */
    mayManage: boolean;
    /** The names still waiting to be checked in, in roster order */
    awaiting: Array<string>;
    /** Called after the status changed, so the caller can reload */
    onChanged: () => void | Promise<void>;
};

/**
 * Sticky button at the bottom of the page that moves a tournament to its next stage
 *
 * No success toast: toasts appear bottom-right, right on top of this button.
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
                {/* Starting drops everyone not checked in, so name them. */}
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
