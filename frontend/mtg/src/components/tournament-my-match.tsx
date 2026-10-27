import { ArrowPathIcon } from "@heroicons/react/20/solid";
import { Badge, Button, Strong, Subheading, Text, notify } from "components";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import type { MyMatchResponse, TournamentResponse, RoundResponse, SetResultRequest } from "src/api/generated";
import { ResultState, RoundStage, RoundState, TournamentState } from "src/api/generated";
import { MatchActions } from "src/components/tournament-rounds";
import { TournamentResultDialog } from "src/components/tournament-result-dialog";
import { TournamentWinnerDialog } from "src/components/tournament-winner-dialog";
import { isFormError } from "src/utils/error";
import { formatResult, winnerSeat, resultErrorKey } from "src/utils/tournament-rounds";
import { TournamentRoundClock } from "src/components/tournament-round-clock";
import { useLiveVersion } from "src/context/tournament-live-context";
import { clockSkew } from "src/utils/round-clock";

/**
 * The properties for {@link TournamentMyMatch}
 */
export type TournamentMyMatchProps = {
    /** The Tournament as the reader sees it */
    tournament: TournamentResponse;
};

/** What the service answered and how far this device's clock is ahead of the server's */
type Loaded = {
    /** The reader's Match in the running Round */
    response: MyMatchResponse;
    /** Milliseconds this device's clock is ahead */
    skewMs: number;
    /** Latest visible Round, including its Result between Rounds */
    latest: RoundResponse | null;
};

/**
 * The reader's own Match in the running Round: table, Seat and opponents, and the round timer.
 *
 * Keeps the latest Result available between Rounds and offers the existing Result actions.
 *
 * @returns participation state and the personal Match card
 */
export function TournamentMyMatch({ tournament }: TournamentMyMatchProps) {
    const [t] = useTranslation("tournament");
    const [loaded, setLoaded] = useState<Loaded | null>(null);
    const [busy, setBusy] = useState(false);
    const [reporting, setReporting] = useState(false);
    const [failed, setFailed] = useState(false);
    const version = useLiveVersion("rounds");

    const load = useCallback(async () => {
        const response = await Api.tournaments.rounds.myMatch(tournament.uuid);
        const rounds = await Api.tournaments.rounds.list(tournament.uuid);
        return {
            response,
            skewMs: clockSkew(rounds.server_time, Date.now()),
            latest: rounds.rounds.findLast((round) => round.state !== RoundState.Previewed) ?? null,
        };
    }, [tournament.uuid, version]);

    useEffect(() => {
        let gone = false;
        load()
            .then((next) => {
                if (!gone) {
                    setLoaded(next);
                    setFailed(false);
                }
            })
            .catch(() => {
                if (!gone) setFailed(true);
            });
        return () => {
            gone = true;
        };
    }, [load]);

    const round = loaded?.latest ?? null;
    if (loaded === null)
        return (
            <div className={"flex flex-col gap-3"}>
                <Text>{t(failed ? "error.load-participation" : "description.loading-participation")}</Text>
                {failed && (
                    <Button
                        outline
                        disabled={busy}
                        onClick={() => {
                            setBusy(true);
                            load()
                                .then((next) => {
                                    setLoaded(next);
                                    setFailed(false);
                                })
                                .catch(() => setFailed(true))
                                .finally(() => setBusy(false));
                        }}
                    >
                        {t("button.retry-participation")}
                    </Button>
                )}
            </div>
        );
    if (round === null)
        return (
            <Text>
                {t(
                    tournament.state === TournamentState.Registration
                        ? "description.preparing-to-play"
                        : tournament.state === TournamentState.Cancelled
                          ? "description.participation-cancelled"
                          : tournament.state === TournamentState.Finished
                            ? "description.participation-finished"
                            : "description.waiting-for-match",
                )}
            </Text>
        );
    const me = loaded.response.participant ?? null;
    const played = round.matches.find((match) => match.seats.some((seat) => seat.participant === me)) ?? null;
    const mine = played?.seats.find((seat) => seat.participant === me) ?? null;
    const opponents = played?.seats.filter((seat) => seat.participant !== me) ?? [];

    const over = tournament.state === TournamentState.Finished || tournament.state === TournamentState.Cancelled;
    const canReport =
        !over &&
        !tournament.entered_afterwards &&
        round.state === RoundState.Running &&
        played?.table_number != null &&
        me !== null;
    const multiplayer = tournament.table_size > 2;
    const bestOf =
        round.stage === RoundStage.TopCut ? (tournament.top_cut_best_of ?? tournament.best_of) : tournament.best_of;
    const refresh = async () => {
        setReporting(false);
        setLoaded(await load());
    };
    const explain = (error: Record<string, boolean>) => t(resultErrorKey(error));

    const dialog = {
        played: reporting ? played : null,
        title: t("heading.report-result", { table: played?.table_number ?? "" }),
        description: t(multiplayer ? "description.report-winner" : "description.report-result"),
        onClose: () => setReporting(false),
        save: (result: SetResultRequest) => Api.tournaments.results.report(tournament.uuid, played?.uuid ?? "", result),
        explain,
        onSaved: refresh,
    };
    return (
        <section
            aria-label={t("heading.my-match", { number: round.number })}
            className={"flex flex-col gap-4 rounded-lg p-4 ring-1 ring-zinc-950/10 dark:ring-white/10"}
        >
            <div className={"flex flex-wrap items-center justify-between gap-3"}>
                <Subheading>{t("heading.my-match", { number: round.number })}</Subheading>
                <Button
                    plain
                    disabled={busy}
                    aria-label={t("accessibility.refresh-my-match")}
                    onClick={() => {
                        setBusy(true);
                        load()
                            .then(setLoaded)
                            .catch(() => undefined)
                            .finally(() => setBusy(false));
                    }}
                >
                    <ArrowPathIcon />
                </Button>
            </div>

            {played !== null && played.table_number == null && <Text>{t("description.my-bye")}</Text>}

            {played !== null && played.table_number != null && (
                <div className={"flex flex-wrap items-baseline gap-x-8 gap-y-2"}>
                    <div className={"flex flex-col"}>
                        <Text>{t("label.table")}</Text>
                        <span className={"text-4xl/none font-semibold text-zinc-950 tabular-nums dark:text-white"}>
                            {played.table_number}
                        </span>
                    </div>
                    {mine !== null && (
                        <div className={"flex flex-col"}>
                            <Text>{t("label.my-seat")}</Text>
                            <span className={"text-4xl/none font-semibold text-zinc-950 tabular-nums dark:text-white"}>
                                {mine.seat}
                            </span>
                        </div>
                    )}
                </div>
            )}

            {opponents.length > 0 && (
                <div className={"flex flex-col gap-1"}>
                    <Text>{t("label.opponents", { count: opponents.length })}</Text>
                    <ul className={"flex flex-col gap-1"}>
                        {opponents.map((seat) => (
                            <li key={seat.participant} className={"flex items-center gap-2"}>
                                <Strong>{seat.name}</Strong>
                                <Badge color={"zinc"}>{t("label.seat-number", { number: seat.seat })}</Badge>
                                {seat.guest && <Badge color={"zinc"}>{t("label.guest")}</Badge>}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {played?.result != null && (
                <div className={"flex flex-wrap items-center gap-2"}>
                    <Text>
                        {t("label.result")}:{" "}
                        {multiplayer
                            ? winnerSeat(played.result) === null
                                ? t("label.draw")
                                : t("label.won-by", { name: played.seats[winnerSeat(played.result) ?? 0]?.name })
                            : formatResult(played.result)}
                    </Text>
                    {played.result.state === ResultState.Disputed && (
                        <Badge color={"red"}>{t("label.result-disputed")}</Badge>
                    )}
                </div>
            )}
            <Text>
                {t(
                    over
                        ? tournament.state === TournamentState.Cancelled
                            ? "description.participation-cancelled"
                            : "description.participation-finished"
                        : round.state === RoundState.Ended
                          ? "description.waiting-for-round"
                          : played === null
                            ? "description.waiting-for-match"
                            : played.result != null || played.table_number == null
                              ? "description.waiting-for-round"
                              : "description.play-and-report",
                )}
            </Text>
            {played !== null && played.table_number != null && round.state !== RoundState.Previewed && (
                <Button outline href={`/tournaments/${tournament.uuid}/matches/${played.uuid}/life`}>
                    {t(canReport ? "button.count-match-life" : "button.view-match-life-history")}
                </Button>
            )}
            {canReport && played !== null && (
                <MatchActions
                    played={played}
                    me={me ?? ""}
                    busy={busy}
                    onReport={() => setReporting(true)}
                    onDispute={async () => {
                        setBusy(true);
                        try {
                            const result = await Api.tournaments.results.dispute(tournament.uuid, played.uuid);
                            if (isFormError(result)) notify.error(t("error.round-changed"));
                            await refresh();
                        } finally {
                            setBusy(false);
                        }
                    }}
                />
            )}
            {canReport &&
                (multiplayer ? (
                    <TournamentWinnerDialog {...dialog} />
                ) : (
                    bestOf != null && <TournamentResultDialog {...dialog} bestOf={bestOf} />
                ))}
            {round.timer != null && (
                <TournamentRoundClock timer={round.timer} ruleset={tournament.ruleset} skewMs={loaded.skewMs} />
            )}
        </section>
    );
}
