import { ArrowPathIcon, PencilSquareIcon, PlayIcon, StopIcon } from "@heroicons/react/20/solid";
import {
    Badge,
    Button,
    Description,
    ErrorMessage,
    Field,
    Input,
    Label,
    Subheading,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
    Text,
    notify,
} from "components";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { RoundState, TournamentState } from "src/api/generated";
import type { MatchResponse, RoundErrors, RoundResponse, RoundsResponse, TournamentResponse } from "src/api/generated";
import { PrimaryButton } from "src/components/primary-button";
import { useTournamentLabels } from "src/components/tournament-labels";
import { TournamentResultDialog } from "src/components/tournament-result-dialog";
import { isFormError } from "src/utils/error";
import { formatResult } from "src/utils/tournament-rounds";

/**
 * The properties for {@link TournamentRounds}
 */
export type TournamentRoundsProps = {
    /** The Tournament as the reader sees it */
    tournament: TournamentResponse;
    /** Reads the Rounds, by id or by share link */
    load: () => Promise<RoundsResponse>;
    /** Called after an Organizer changed something the Tournament itself shows, like its state */
    onTournamentChanged?: () => void;
};

/**
 * The Rounds of a Tournament with their Matches and Results, and for its
 * Organizers pairing, starting and ending them and setting Results.
 *
 * A paired Round is a preview only Organizers see until they start it.
 *
 * @returns the Rounds with their actions
 */
export function TournamentRounds({ tournament, load, onTournamentChanged }: TournamentRoundsProps) {
    const [t] = useTranslation("tournament");
    const [list, setList] = useState<RoundsResponse | null>(null);
    const [busy, setBusy] = useState(false);
    const [editing, setEditing] = useState<MatchResponse | null>(null);

    const organizer = tournament.organizer_role != null;
    const over = tournament.state === TournamentState.Finished || tournament.state === TournamentState.Cancelled;
    const rounds = list?.rounds ?? [];
    const open = rounds.find((round) => round.state !== RoundState.Ended) ?? null;

    const reload = useCallback(async () => {
        setList(await load());
    }, [load]);

    useEffect(() => {
        let gone = false;
        load()
            .then((loaded) => {
                if (!gone) setList(loaded);
            })
            .catch(() => undefined);
        return () => {
            gone = true;
        };
    }, [load]);

    /**
     * Says why a Round action was refused
     *
     * @param error what the service refused
     */
    function refused(error: RoundErrors) {
        if (error.results_missing) notify.error(t("error.results-missing"));
        else if (error.too_few_participants) notify.error(t("error.too-few-participants"));
        else if (error.ruleset_not_paired) notify.error(t("error.ruleset-not-paired"));
        else if (error.all_rounds_paired) notify.error(t("error.all-rounds-paired"));
        else if (error.tournament_over) notify.error(t("error.tournament-over"));
        else notify.error(t("error.round-changed"));
    }

    /**
     * Runs a Round action, then reads the Rounds and the Tournament again
     *
     * @param action the call to the service
     */
    async function act(action: () => Promise<unknown>) {
        setBusy(true);
        try {
            const result = await action();
            if (isFormError<unknown, { result: "Err"; error: RoundErrors }>(result)) {
                refused(result.error);
            }
            await reload();
            onTournamentChanged?.();
        } finally {
            setBusy(false);
        }
    }

    const nextNumber = rounds.length + 1;

    return (
        <div className={"flex flex-col gap-8"}>
            {list !== null && (
                <RoundPlan
                    tournament={tournament}
                    rounds={list}
                    editable={organizer && !over}
                    onChanged={async () => {
                        await reload();
                        onTournamentChanged?.();
                    }}
                />
            )}

            {organizer && !over && list !== null && (
                <div className={"flex flex-wrap items-center gap-3"}>
                    {open === null && (
                        <PrimaryButton
                            disabled={busy}
                            onClick={() => void act(() => Api.tournaments.rounds.pair(tournament.uuid))}
                        >
                            <ArrowPathIcon />
                            {t("button.pair-round", { number: nextNumber })}
                        </PrimaryButton>
                    )}
                    {open?.state === RoundState.Previewed && (
                        <>
                            <PrimaryButton
                                disabled={busy}
                                onClick={() =>
                                    void act(() => Api.tournaments.rounds.start(tournament.uuid, open.number))
                                }
                            >
                                <PlayIcon />
                                {t("button.start-round", { number: open.number })}
                            </PrimaryButton>
                            <Button
                                outline
                                disabled={busy}
                                onClick={() =>
                                    void act(async () => {
                                        await Api.tournaments.rounds.discard(tournament.uuid, open.number);
                                        return Api.tournaments.rounds.pair(tournament.uuid);
                                    })
                                }
                            >
                                <ArrowPathIcon />
                                {t("button.pair-again")}
                            </Button>
                        </>
                    )}
                    {open?.state === RoundState.Running && (
                        <PrimaryButton
                            disabled={busy}
                            onClick={() => void act(() => Api.tournaments.rounds.end(tournament.uuid, open.number))}
                        >
                            <StopIcon />
                            {t("button.end-round", { number: open.number })}
                        </PrimaryButton>
                    )}
                </div>
            )}

            {list !== null && rounds.length === 0 && <Text>{t("description.no-rounds")}</Text>}

            {[...rounds].reverse().map((round) => (
                <RoundTable
                    key={round.number}
                    round={round}
                    editable={organizer && round.state !== RoundState.Previewed}
                    onEdit={setEditing}
                />
            ))}

            {organizer && tournament.best_of != null && (
                <TournamentResultDialog
                    played={editing}
                    bestOf={tournament.best_of}
                    onClose={() => setEditing(null)}
                    save={(result) => Api.tournaments.rounds.setResult(tournament.uuid, editing?.uuid ?? "", result)}
                    onSaved={async () => {
                        setEditing(null);
                        notify.success(t("toast.result-saved"));
                        await reload();
                    }}
                />
            )}
        </div>
    );
}

/**
 * The properties for {@link RoundPlan}
 */
type RoundPlanProps = {
    /** The Tournament the Rounds belong to */
    tournament: TournamentResponse;
    /** The Rounds with how many are planned */
    rounds: RoundsResponse;
    /** Whether the reader may change the number of Swiss Rounds */
    editable: boolean;
    /** Called after the number changed */
    onChanged: () => Promise<void>;
};

/**
 * How many Swiss Rounds are played, what mtg suggests, and for Organizers a
 * field to change it.
 *
 * @returns the plan
 */
function RoundPlan({ tournament, rounds, editable, onChanged }: RoundPlanProps) {
    const [t] = useTranslation("tournament");
    const planned = rounds.swiss_rounds ?? rounds.suggested_swiss_rounds ?? null;
    const [value, setValue] = useState(planned === null ? "" : String(planned));
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        setValue(planned === null ? "" : String(planned));
    }, [planned]);

    /**
     * Saves the number in the field
     */
    async function save() {
        setBusy(true);
        try {
            const result = await Api.tournaments.rounds.setSwissRounds(tournament.uuid, Number(value));
            if (isFormError(result)) {
                setError(t("error.swiss-rounds-out-of-range"));
                return;
            }
            setError(null);
            notify.success(t("toast.swiss-rounds-saved"));
            await onChanged();
        } finally {
            setBusy(false);
        }
    }

    const suggestion =
        rounds.suggested_swiss_rounds == null
            ? null
            : t("label.swiss-rounds-suggested", { count: rounds.suggested_swiss_rounds });

    if (!editable) {
        return (
            <Text>
                {planned === null
                    ? t("description.swiss-rounds-unknown")
                    : t("label.swiss-rounds-played", { count: planned, played: rounds.rounds.length })}
            </Text>
        );
    }

    return (
        <Field className={"max-w-sm"}>
            <Label>{t("label.swiss-rounds")}</Label>
            <form
                className={"flex items-start gap-2"}
                onSubmit={(event) => {
                    event.preventDefault();
                    void save();
                }}
            >
                <Input
                    type={"number"}
                    min={Math.max(1, rounds.rounds.length)}
                    max={30}
                    step={1}
                    inputMode={"numeric"}
                    className={"min-w-0 flex-1"}
                    value={value}
                    invalid={error !== null}
                    onChange={(event) => {
                        setValue(event.target.value);
                        setError(null);
                    }}
                />
                <Button type={"submit"} outline disabled={busy || value === ""} className={"shrink-0"}>
                    {t("button.save-swiss-rounds")}
                </Button>
            </form>
            {error !== null ? (
                <ErrorMessage>{error}</ErrorMessage>
            ) : (
                <Description>
                    {rounds.swiss_rounds == null ? t("description.swiss-rounds-follow-suggestion") : suggestion}
                </Description>
            )}
        </Field>
    );
}

/**
 * The properties for {@link RoundTable}
 */
type RoundTableProps = {
    /** The Round */
    round: RoundResponse;
    /** Whether the reader may set Results */
    editable: boolean;
    /** Called with the Match whose Result the reader wants to set */
    onEdit: (played: MatchResponse) => void;
};

/**
 * One Round: its Matches by table, their Results, and its Byes.
 *
 * @returns the Round's heading and table
 */
function RoundTable({ round, editable, onEdit }: RoundTableProps) {
    const [t] = useTranslation("tournament");
    const labels = useTournamentLabels();

    return (
        <section className={"flex flex-col gap-3"}>
            <div className={"flex flex-wrap items-center gap-3"}>
                <Subheading>{t("heading.round", { number: round.number })}</Subheading>
                <Badge color={round.state === RoundState.Previewed ? "amber" : "sky"}>
                    {labels.roundState(round.state)}
                </Badge>
            </div>
            {round.state === RoundState.Previewed && <Text>{t("description.round-preview")}</Text>}
            <Table striped={true}>
                <TableHead>
                    <TableRow>
                        <TableHeader>{t("label.table")}</TableHeader>
                        <TableHeader>{t("label.seat-one")}</TableHeader>
                        <TableHeader>{t("label.seat-two")}</TableHeader>
                        <TableHeader>{t("label.result")}</TableHeader>
                        {editable && <TableHeader />}
                    </TableRow>
                </TableHead>
                <TableBody>
                    {round.matches.map((played) => (
                        <TableRow key={played.uuid}>
                            <TableCell>{played.table_number ?? t("label.bye")}</TableCell>
                            <TableCell>{played.seats[0]?.name ?? ""}</TableCell>
                            <TableCell>{played.table_number == null ? "" : (played.seats[1]?.name ?? "")}</TableCell>
                            <TableCell>
                                {played.table_number == null
                                    ? t("label.bye-result")
                                    : played.result == null
                                      ? t("label.no-result")
                                      : formatResult(played.result)}
                            </TableCell>
                            {editable && (
                                <TableCell>
                                    {played.table_number != null && (
                                        <Button
                                            plain
                                            aria-label={t("accessibility.set-result", {
                                                table: played.table_number,
                                            })}
                                            onClick={() => onEdit(played)}
                                        >
                                            <PencilSquareIcon />
                                        </Button>
                                    )}
                                </TableCell>
                            )}
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </section>
    );
}
