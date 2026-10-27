import {
    ArrowPathIcon,
    ArrowUturnLeftIcon,
    FlagIcon,
    PencilSquareIcon,
    PlayIcon,
    StopIcon,
} from "@heroicons/react/20/solid";
import {
    Badge,
    Button,
    ConfirmDialog,
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
import { ResultState, RoundStage, RoundState, TournamentState } from "src/api/generated";
import type {
    DisputeResultErrors,
    MatchResponse,
    RoundErrors,
    RoundResponse,
    RoundsResponse,
    TournamentResponse,
} from "src/api/generated";
import { PrimaryButton } from "src/components/primary-button";
import { useTournamentLabels } from "src/components/tournament-labels";
import { TournamentPairingsEditor } from "src/components/tournament-pairings-editor";
import { TournamentResultDialog } from "src/components/tournament-result-dialog";
import { TournamentRoundClock } from "src/components/tournament-round-clock";
import { TournamentWinnerDialog } from "src/components/tournament-winner-dialog";
import { isFormError } from "src/utils/error";
import { clockSkew } from "src/utils/round-clock";
import { cutRoundSize } from "src/utils/top-cut";
import { formatResult, winnerSeat } from "src/utils/tournament-rounds";

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
    /** The reader's own Participant, so it reports and disputes its Matches; `null` if it is none */
    me?: string | null;
};

/**
 * The Rounds of a Tournament with their Matches and Results, and for its
 * Organizers pairing, starting and ending them and setting Results.
 *
 * A paired Round is a preview only Organizers see until they start it.
 * Participants report the Results of their own Matches while the Round runs,
 * or dispute one the other Participant reported. In a Tournament entered
 * afterwards the Organizers set every pairing themselves, its Top cut too:
 * the size stays the settings', who plays is theirs.
 *
 * @returns the Rounds with their actions
 */
export function TournamentRounds({ tournament, load, onTournamentChanged, me = null }: TournamentRoundsProps) {
    const [t] = useTranslation("tournament");
    const [list, setList] = useState<RoundsResponse | null>(null);
    const [skewMs, setSkewMs] = useState(0);
    const [busy, setBusy] = useState(false);
    const [editing, setEditing] = useState<MatchResponse | null>(null);
    const [reporting, setReporting] = useState<MatchResponse | null>(null);
    const [arranging, setArranging] = useState(false);
    const [takingBack, setTakingBack] = useState(false);
    const [bench, setBench] = useState<Array<{ participant: string; name: string }>>([]);

    const organizer = tournament.organizer_role != null;
    const over = tournament.state === TournamentState.Finished || tournament.state === TournamentState.Cancelled;
    const rounds = list?.rounds ?? [];
    const multiplayer = tournament.table_size > 2;
    const open = rounds.find((round) => round.state !== RoundState.Ended) ?? null;
    const disputed =
        open?.state === RoundState.Running
            ? open.matches.filter((played) => played.result?.state === ResultState.Disputed).length
            : 0;
    const lastEnded = rounds.findLast((round) => round.state === RoundState.Ended) ?? null;
    const takeBack =
        organizer &&
        tournament.state !== TournamentState.Cancelled &&
        lastEnded !== null &&
        !rounds.some((round) => round.number > lastEnded.number && round.state !== RoundState.Previewed)
            ? lastEnded
            : null;

    /**
     * The best-of a Match is played to: a Top cut Match to the Top cut's own
     *
     * @param played the Match
     *
     * @returns its best-of
     */
    const bestOfFor = (played: MatchResponse | null) => {
        const stage = rounds.find((round) => round.matches.some((other) => other.uuid === played?.uuid))?.stage;
        return stage === RoundStage.TopCut ? (tournament.top_cut_best_of ?? tournament.best_of) : tournament.best_of;
    };
    const editingBestOf = bestOfFor(editing);
    const reportingBestOf = bestOfFor(reporting);

    /**
     * Says why an Organizer's Result was refused
     *
     * @param error the form errors of the refusal
     *
     * @returns the message
     */
    const explainSet = (error: Record<string, boolean>): string => {
        if (error.not_started) return t("error.round-not-started");
        if (error.dropped_winner) return t("error.dropped-winner");
        return t("error.invalid-score");
    };

    /**
     * Says why a Participant's report was refused
     *
     * @param error the form errors of the refusal
     *
     * @returns the message
     */
    const explainReport = (error: Record<string, boolean>): string => {
        if (error.not_running) return t("error.round-not-running");
        if (error.reported_by_other) return t("error.result-reported-by-other");
        if (error.disputed) return t("error.result-disputed");
        if (error.confirmed) return t("error.result-confirmed");
        if (error.dropped_winner) return t("error.dropped-winner");
        return t("error.invalid-score");
    };

    const reload = useCallback(async () => {
        const loaded = await load();
        setSkewMs(clockSkew(loaded.server_time, Date.now()));
        setList(loaded);
    }, [load]);

    useEffect(() => {
        let gone = false;
        load()
            .then((loaded) => {
                if (gone) return;
                setSkewMs(clockSkew(loaded.server_time, Date.now()));
                setList(loaded);
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
        if (error.results_disputed) notify.error(t("error.results-disputed"));
        else if (error.results_missing) notify.error(t("error.results-missing"));
        else if (error.later_round_started) notify.error(t("error.later-round-started"));
        else if (error.too_few_participants) notify.error(t("error.too-few-participants"));
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

    /**
     * Disputes the Result of the reader's Match
     *
     * @param played the Match
     */
    async function dispute(played: MatchResponse) {
        setBusy(true);
        try {
            const result = await Api.tournaments.results.dispute(tournament.uuid, played.uuid);
            if (isFormError<unknown, { result: "Err"; error: DisputeResultErrors }>(result)) {
                const error = result.error;
                if (error.not_running) notify.error(t("error.round-not-running"));
                else if (error.confirmed) notify.error(t("error.result-confirmed"));
                else if (error.own_report) notify.error(t("error.result-own-report"));
                else notify.error(t("error.result-missing"));
            } else {
                notify.success(t("toast.result-disputed"));
            }
            await reload();
        } finally {
            setBusy(false);
        }
    }

    const nextNumber = rounds.length + 1;
    const entering = tournament.entered_afterwards;
    const cutPreview =
        entering && open?.state === RoundState.Previewed && open.stage === RoundStage.TopCut ? open : null;

    useEffect(() => {
        if (!arranging || cutPreview === null) {
            setBench([]);
            return;
        }
        let gone = false;
        const firstCut = rounds.find((round) => round.stage === RoundStage.TopCut);
        const firstPlayers =
            firstCut !== undefined && firstCut.number !== cutPreview.number
                ? new Set(firstCut.matches.flatMap((played) => played.seats.map((seat) => seat.participant)))
                : null;
        const seated = new Set(cutPreview.matches.flatMap((played) => played.seats.map((seat) => seat.participant)));
        Api.tournaments.participants
            .list(tournament.uuid)
            .then((roster) => {
                if (gone) return;
                setBench(
                    roster.participants
                        .filter(
                            (participant) =>
                                participant.dropped_after_round == null &&
                                participant.unpaid !== true &&
                                !seated.has(participant.uuid) &&
                                (firstPlayers === null || firstPlayers.has(participant.uuid)),
                        )
                        .map((participant) => ({ participant: participant.uuid, name: participant.name })),
                );
            })
            .catch(() => undefined);
        return () => {
            gone = true;
        };
    }, [arranging, cutPreview, rounds, tournament.uuid]);

    return (
        <div className={"flex flex-col gap-8"}>
            {list !== null && (
                <RoundPlan
                    tournament={tournament}
                    rounds={list}
                    editable={
                        organizer &&
                        (tournament.state === TournamentState.Registration ||
                            tournament.state === TournamentState.Swiss)
                    }
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
                            onClick={() =>
                                void act(() => Api.tournaments.rounds.pair(tournament.uuid)).then(() => {
                                    if (entering) setArranging(true);
                                })
                            }
                        >
                            <ArrowPathIcon />
                            {entering
                                ? t("button.enter-round", { number: nextNumber })
                                : t("button.pair-round", { number: nextNumber })}
                        </PrimaryButton>
                    )}
                    {open?.state === RoundState.Previewed && (
                        <>
                            <PrimaryButton
                                disabled={busy || arranging}
                                onClick={() =>
                                    void act(() => Api.tournaments.rounds.start(tournament.uuid, open.number))
                                }
                            >
                                <PlayIcon />
                                {t("button.start-round", { number: open.number })}
                            </PrimaryButton>
                            {(open.stage === RoundStage.Swiss || entering) && (
                                <Button outline disabled={busy || arranging} onClick={() => setArranging(true)}>
                                    <PencilSquareIcon />
                                    {t("button.edit-pairing")}
                                </Button>
                            )}
                            {!entering && (
                                <Button
                                    outline
                                    disabled={busy}
                                    onClick={() =>
                                        void act(async () => {
                                            setArranging(false);
                                            await Api.tournaments.rounds.discard(tournament.uuid, open.number);
                                            return Api.tournaments.rounds.pair(tournament.uuid);
                                        })
                                    }
                                >
                                    <ArrowPathIcon />
                                    {t("button.pair-again")}
                                </Button>
                            )}
                        </>
                    )}
                    {disputed > 0 && <Badge color={"red"}>{t("label.results-disputed", { count: disputed })}</Badge>}
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

            {organizer && !over && entering && <Text>{t("description.enter-rounds")}</Text>}

            {list !== null && rounds.length === 0 && <Text>{t("description.no-rounds")}</Text>}

            {[...rounds].reverse().map((round) =>
                arranging && round.state === RoundState.Previewed ? (
                    <section key={round.number} className={"flex flex-col gap-3"}>
                        <Subheading>{t("heading.edit-pairing", { number: round.number })}</Subheading>
                        <TournamentPairingsEditor
                            tournamentUuid={tournament.uuid}
                            round={round}
                            rounds={rounds}
                            bench={bench}
                            onDone={async (saved) => {
                                setArranging(false);
                                if (saved) await reload();
                            }}
                        />
                    </section>
                ) : (
                    <RoundTable
                        key={round.number}
                        round={round}
                        tournament={tournament}
                        skewMs={skewMs}
                        multiplayer={multiplayer}
                        editable={organizer && round.state !== RoundState.Previewed}
                        me={over || tournament.entered_afterwards || round.state !== RoundState.Running ? null : me}
                        busy={busy}
                        onEdit={setEditing}
                        onReport={setReporting}
                        onDispute={(played) => void dispute(played)}
                        onTakeBack={takeBack?.number === round.number ? () => setTakingBack(true) : undefined}
                    />
                ),
            )}

            {takeBack !== null && (
                <ConfirmDialog
                    open={takingBack}
                    onClose={() => setTakingBack(false)}
                    onConfirm={async () => {
                        setTakingBack(false);
                        await act(() => Api.tournaments.rounds.takeBack(tournament.uuid, takeBack.number));
                    }}
                    title={t("heading.take-back-round", { number: takeBack.number })}
                    description={t("description.take-back-round")}
                    confirmLabel={t("button.take-back-round", { number: takeBack.number })}
                />
            )}

            {organizer && multiplayer && (
                <TournamentWinnerDialog
                    played={editing}
                    title={t("heading.set-result", { table: editing?.table_number ?? "" })}
                    description={t("description.set-winner")}
                    onClose={() => setEditing(null)}
                    save={(result) => Api.tournaments.rounds.setResult(tournament.uuid, editing?.uuid ?? "", result)}
                    explain={explainSet}
                    onSaved={async () => {
                        setEditing(null);
                        notify.success(t("toast.result-saved"));
                        await reload();
                    }}
                />
            )}

            {organizer && !multiplayer && editingBestOf != null && (
                <TournamentResultDialog
                    played={editing}
                    bestOf={editingBestOf}
                    title={t("heading.set-result", { table: editing?.table_number ?? "" })}
                    description={t("description.set-result")}
                    onClose={() => setEditing(null)}
                    save={(result) => Api.tournaments.rounds.setResult(tournament.uuid, editing?.uuid ?? "", result)}
                    explain={explainSet}
                    onSaved={async () => {
                        setEditing(null);
                        notify.success(t("toast.result-saved"));
                        await reload();
                    }}
                />
            )}

            {me !== null && multiplayer && (
                <TournamentWinnerDialog
                    played={reporting}
                    title={t("heading.report-result", { table: reporting?.table_number ?? "" })}
                    description={t("description.report-winner")}
                    onClose={() => setReporting(null)}
                    save={(result) => Api.tournaments.results.report(tournament.uuid, reporting?.uuid ?? "", result)}
                    explain={explainReport}
                    onSaved={async () => {
                        setReporting(null);
                        notify.success(t("toast.result-reported"));
                        await reload();
                    }}
                />
            )}

            {me !== null && !multiplayer && reportingBestOf != null && (
                <TournamentResultDialog
                    played={reporting}
                    bestOf={reportingBestOf}
                    title={t("heading.report-result", { table: reporting?.table_number ?? "" })}
                    description={t("description.report-result")}
                    onClose={() => setReporting(null)}
                    save={(result) => Api.tournaments.results.report(tournament.uuid, reporting?.uuid ?? "", result)}
                    explain={explainReport}
                    onSaved={async () => {
                        setReporting(null);
                        notify.success(t("toast.result-reported"));
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
    const played = rounds.rounds.filter((round) => round.stage === RoundStage.Swiss).length;
    const topCut =
        rounds.top_cut_size == null ? null : (
            <Text>{t("description.top-cut-size", { count: rounds.top_cut_size })}</Text>
        );
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
            <div className={"flex flex-col gap-1"}>
                <Text>
                    {planned === null
                        ? t("description.swiss-rounds-unknown")
                        : t("label.swiss-rounds-played", { count: planned, played })}
                </Text>
                {topCut}
            </div>
        );
    }

    return (
        <div className={"flex flex-col gap-1"}>
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
            {topCut}
        </div>
    );
}

/**
 * The properties for {@link RoundTable}
 */
type RoundTableProps = {
    /** The Round */
    round: RoundResponse;
    /** The Tournament it belongs to */
    tournament: TournamentResponse;
    /** How far this device's clock is ahead of the server's, in milliseconds */
    skewMs: number;
    /** Whether its Matches seat more than two, with a winner or a draw as Result */
    multiplayer: boolean;
    /** Whether the reader may set Results, as an Organizer */
    editable: boolean;
    /** The reader's Participant while it may report and dispute in this Round, else `null` */
    me: string | null;
    /** Whether an action is under way */
    busy: boolean;
    /** Called with the Match whose Result the reader wants to set */
    onEdit: (played: MatchResponse) => void;
    /** Called with the reader's Match whose Result it wants to report */
    onReport: (played: MatchResponse) => void;
    /** Called with the reader's Match whose Result it disputes */
    onDispute: (played: MatchResponse) => void;
    /** Called when the reader wants the Round taken back; only for a Round that can be */
    onTakeBack?: () => void;
};

/**
 * One Round: its Matches by table, their Results, and its Byes; while it runs, its round timer.
 *
 * @returns the Round's heading and table
 */
function RoundTable({
    round,
    tournament,
    skewMs,
    multiplayer,
    editable,
    me,
    busy,
    onEdit,
    onReport,
    onDispute,
    onTakeBack,
}: RoundTableProps) {
    const [t] = useTranslation("tournament");
    const labels = useTournamentLabels();
    const mine = (played: MatchResponse) =>
        me !== null && played.table_number != null && played.seats.some((seat) => seat.participant === me);
    const actions = editable || round.matches.some(mine);

    /**
     * The Result of a multiplayer Match in words: who won, or a draw
     *
     * @param played the Match, with its Result
     *
     * @returns the winner's line or the draw
     */
    const multiplayerResult = (played: MatchResponse): string => {
        const winner = played.result == null ? null : winnerSeat(played.result);
        const name = winner == null ? undefined : played.seats[winner]?.name;
        return name === undefined ? t("label.draw") : t("label.won-by", { name });
    };

    return (
        <section className={"flex flex-col gap-3"}>
            <div className={"flex flex-wrap items-center gap-3"}>
                <Subheading>
                    {round.stage === RoundStage.TopCut
                        ? t("heading.cut-round", {
                              name: labels.cutRound(cutRoundSize(round)),
                              number: round.number,
                          })
                        : t("heading.round", { number: round.number })}
                </Subheading>
                <Badge color={round.state === RoundState.Previewed ? "amber" : "sky"}>
                    {labels.roundState(round.state)}
                </Badge>
                {onTakeBack !== undefined && (
                    <Button plain className={"ms-auto"} onClick={onTakeBack}>
                        <ArrowUturnLeftIcon />
                        {t("button.take-back-round", { number: round.number })}
                    </Button>
                )}
            </div>
            {round.state === RoundState.Previewed && <Text>{t("description.round-preview")}</Text>}
            {round.timer != null && (
                <TournamentRoundClock timer={round.timer} ruleset={tournament.ruleset} skewMs={skewMs} />
            )}
            <Table striped={true}>
                <TableHead>
                    <TableRow>
                        <TableHeader>{t("label.table")}</TableHeader>
                        {multiplayer ? (
                            <TableHeader>{t("label.seats")}</TableHeader>
                        ) : (
                            <>
                                <TableHeader>{t("label.seat-one")}</TableHeader>
                                <TableHeader>{t("label.seat-two")}</TableHeader>
                            </>
                        )}
                        <TableHeader>{t("label.result")}</TableHeader>
                        {actions && <TableHeader />}
                    </TableRow>
                </TableHead>
                <TableBody>
                    {round.matches.map((played) => (
                        <TableRow key={played.uuid}>
                            <TableCell>
                                <span className={"flex items-center gap-2"}>
                                    {played.table_number ?? t("label.bye")}
                                    {played.rematch && <Badge color={"amber"}>{t("label.rematch")}</Badge>}
                                </span>
                            </TableCell>
                            {multiplayer ? (
                                <TableCell>
                                    <ol className={"list-inside list-decimal"}>
                                        {played.seats.map((seat) => (
                                            <li key={seat.participant}>{seat.name}</li>
                                        ))}
                                    </ol>
                                </TableCell>
                            ) : (
                                <>
                                    <TableCell>{played.seats[0]?.name ?? ""}</TableCell>
                                    <TableCell>
                                        {played.table_number == null ? "" : (played.seats[1]?.name ?? "")}
                                    </TableCell>
                                </>
                            )}
                            <TableCell>
                                <div className={"flex flex-wrap items-center gap-2"}>
                                    {played.table_number == null
                                        ? t("label.bye-result")
                                        : played.result == null
                                          ? t("label.no-result")
                                          : multiplayer
                                            ? multiplayerResult(played)
                                            : formatResult(played.result)}
                                    {played.result?.state === ResultState.Disputed && (
                                        <Badge color={"red"}>{t("label.result-disputed")}</Badge>
                                    )}
                                </div>
                            </TableCell>
                            {actions && (
                                <TableCell>
                                    <div className={"flex flex-wrap items-center gap-2"}>
                                        {editable && played.table_number != null && (
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
                                        {mine(played) && (
                                            <MatchActions
                                                played={played}
                                                me={me ?? ""}
                                                busy={busy}
                                                onReport={onReport}
                                                onDispute={onDispute}
                                            />
                                        )}
                                    </div>
                                </TableCell>
                            )}
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </section>
    );
}

/**
 * The properties for {@link MatchActions}
 */
type MatchActionsProps = {
    /** The reader's Match */
    played: MatchResponse;
    /** The reader's Participant */
    me: string;
    /** Whether an action is under way */
    busy: boolean;
    /** Called when the reader wants to report the Result */
    onReport: (played: MatchResponse) => void;
    /** Called when the reader disputes the Result */
    onDispute: (played: MatchResponse) => void;
};

/**
 * What a Participant can do about its own Match's Result while the Round
 * runs: report it, correct its own report, or dispute another's.
 *
 * @returns the button, or a note why there is none
 */
export function MatchActions({ played, me, busy, onReport, onDispute }: MatchActionsProps) {
    const [t] = useTranslation("tournament");
    const result = played.result;

    if (result?.state === ResultState.Disputed) {
        return <Text>{t("label.waiting-for-organizer")}</Text>;
    }
    if (result?.state === ResultState.Confirmed) {
        return null;
    }
    if (result != null && result.reported_by !== me) {
        return (
            <Button outline disabled={busy} onClick={() => onDispute(played)}>
                <FlagIcon />
                {t("button.dispute-result")}
            </Button>
        );
    }
    return (
        <Button outline disabled={busy} onClick={() => onReport(played)}>
            <PencilSquareIcon />
            {t("button.report-result")}
        </Button>
    );
}
