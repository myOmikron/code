import { ArrowDownIcon, ArrowUpIcon, ArrowsRightLeftIcon } from "@heroicons/react/20/solid";
import { Badge, Button, Text, notify } from "components";
import clsx from "clsx";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import type { RoundResponse } from "src/api/generated";
import { PrimaryButton } from "src/components/primary-button";
import { isFormError } from "src/utils/error";
import type { EditLayout } from "src/utils/pairing-edit";
import { isChanged, isRematch, layoutFrom, meetingsBefore, moveTable, swap, toRequest } from "src/utils/pairing-edit";

/** The properties for {@link TournamentPairingsEditor} */
export type TournamentPairingsEditorProps = {
    /** The Tournament the Round belongs to */
    tournamentUuid: string;
    /** The previewed Round */
    round: RoundResponse;
    /** Every Round, to tell rematches */
    rounds: Array<RoundResponse>;
    /** Called when the Organizer is done, with whether the layout was saved */
    onDone: (saved: boolean) => void | Promise<void>;
};

/**
 * An Organizer's edit of a previewed Round: tap two Participants to trade
 * their places (also to hand on the Bye), move Matches between tables with
 * the arrows. What is saved is what starts.
 *
 * @returns the editor
 */
export function TournamentPairingsEditor({ tournamentUuid, round, rounds, onDone }: TournamentPairingsEditorProps) {
    const [t] = useTranslation("tournament");
    const base = useMemo(() => layoutFrom(round), [round]);
    const met = useMemo(() => meetingsBefore(rounds, round.number), [rounds, round.number]);
    const names = useMemo(
        () => new Map(round.matches.flatMap((played) => played.seats.map((seat) => [seat.participant, seat.name]))),
        [round],
    );
    const [layout, setLayout] = useState<EditLayout>(base);
    const [picked, setPicked] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const changed = isChanged(base, layout);
    const tables = layout.filter((entry) => !entry.bye).length;

    /**
     * Picks a Participant up, puts it down again, or trades places with the one picked
     *
     * @param participant who was tapped
     */
    function tap(participant: string) {
        if (picked === null) setPicked(participant);
        else if (picked === participant) setPicked(null);
        else {
            setLayout((current) => swap(current, picked, participant));
            setPicked(null);
        }
    }

    /**
     * Sends the layout
     */
    async function save() {
        setSaving(true);
        try {
            const response = await Api.tournaments.rounds.arrange(tournamentUuid, round.number, toRequest(layout));
            if (isFormError(response)) {
                notify.error(response.error.not_previewed ? t("error.round-changed") : t("error.invalid-layout"));
                return;
            }
            notify.success(t("toast.pairing-saved"));
            await onDone(true);
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className={"flex flex-col gap-3"}>
            <Text className={"flex items-center gap-2"}>
                <ArrowsRightLeftIcon className={"size-4 shrink-0"} aria-hidden={true} />
                {picked === null
                    ? t("description.pairing-swap-hint")
                    : t("description.pairing-swap-with", { name: names.get(picked) ?? "" })}
            </Text>

            <ul
                className={
                    "divide-y divide-zinc-950/5 rounded-lg ring-1 ring-zinc-950/10 dark:divide-white/10 dark:ring-white/10"
                }
            >
                {layout.map((entry, index) => (
                    <li key={entry.key} className={"flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2"}>
                        <span
                            className={"w-12 shrink-0 text-sm font-semibold text-zinc-950 tabular-nums dark:text-white"}
                        >
                            {entry.bye ? t("label.bye") : index + 1}
                        </span>
                        <div className={"flex min-w-0 flex-1 flex-wrap items-center gap-1.5"}>
                            {entry.seats.map((participant) => (
                                <button
                                    key={participant}
                                    type={"button"}
                                    aria-pressed={picked === participant}
                                    aria-label={t("accessibility.pick-participant", {
                                        name: names.get(participant) ?? "",
                                    })}
                                    onClick={() => tap(participant)}
                                    className={clsx(
                                        "rounded-lg px-2.5 py-1 text-left text-sm/6 font-medium text-zinc-950 ring-1 ring-zinc-950/15 hover:ring-blue-500 dark:text-white dark:ring-white/20 dark:hover:ring-blue-400",
                                        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500",
                                        picked === participant &&
                                            "bg-blue-500/10 ring-2 ring-blue-500! dark:bg-blue-400/10 dark:ring-blue-400!",
                                    )}
                                >
                                    {names.get(participant) ?? ""}
                                </button>
                            ))}
                            {!entry.bye && isRematch(entry.seats, met) && (
                                <Badge color={"amber"}>{t("label.rematch")}</Badge>
                            )}
                        </div>
                        {!entry.bye && (
                            <div className={"flex shrink-0 gap-1"}>
                                <Button
                                    plain
                                    disabled={index === 0}
                                    aria-label={t("accessibility.table-up", { table: index + 1 })}
                                    onClick={() => setLayout((current) => moveTable(current, index, -1))}
                                >
                                    <ArrowUpIcon />
                                </Button>
                                <Button
                                    plain
                                    disabled={index === tables - 1}
                                    aria-label={t("accessibility.table-down", { table: index + 1 })}
                                    onClick={() => setLayout((current) => moveTable(current, index, 1))}
                                >
                                    <ArrowDownIcon />
                                </Button>
                            </div>
                        )}
                    </li>
                ))}
            </ul>

            <div className={"flex flex-wrap items-center justify-end gap-2"}>
                <Button plain onClick={() => void onDone(false)}>
                    {t("button.discard-pairing-changes")}
                </Button>
                <PrimaryButton disabled={saving || !changed} onClick={() => void save()}>
                    {t("button.save-pairing")}
                </PrimaryButton>
            </div>
        </div>
    );
}
