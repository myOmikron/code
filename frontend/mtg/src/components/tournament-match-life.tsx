import { Button, Strong, Text, notify } from "components";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import type { MatchPlayResponse, SetResultRequest, TournamentResponse } from "src/api/generated";
import { BestOf, RoundStage, RoundState, TournamentState } from "src/api/generated";
import { LifeCounter } from "src/components/life-counter";
import { MatchActions } from "src/components/tournament-rounds";
import { TournamentRoundClock } from "src/components/tournament-round-clock";
import { TournamentResultDialog } from "src/components/tournament-result-dialog";
import { TournamentWinnerDialog } from "src/components/tournament-winner-dialog";
import { useLiveVersion } from "src/context/tournament-live-context";
import { isFormError } from "src/utils/error";
import { loadLifeHistory } from "src/utils/life-history";
import type { LifeHistory } from "src/utils/life-history";
import { lifeResultDraft, matchLifeStorageKey, matchStartingLife } from "src/utils/match-life";
import { clockSkew } from "src/utils/round-clock";
import { formatResult } from "src/utils/tournament-rounds";

/** Counts an authorized Match locally while keeping its Round timer and explicit Result actions available. */
export function TournamentMatchLife({
    tournament,
    initialPlay,
    organizerView,
}: {
    tournament: TournamentResponse;
    initialPlay: MatchPlayResponse;
    organizerView: boolean;
}) {
    const [t] = useTranslation("tournament");
    const [play, setPlay] = useState(initialPlay);
    const [skewMs, setSkewMs] = useState(() => clockSkew(initialPlay.server_time, Date.now()));
    const [reporting, setReporting] = useState(false);
    const [busy, setBusy] = useState(false);
    const played = play.round.matches[0];
    const storageKey = matchLifeStorageKey(tournament.uuid, played.uuid);
    const [history, setHistory] = useState<LifeHistory | null>(() => loadLifeHistory(storageKey));
    const version = useLiveVersion("rounds");
    const refresh = useCallback(async () => {
        const next = await Api.tournaments.rounds.play(tournament.uuid, played.uuid);
        setSkewMs(clockSkew(next.server_time, Date.now()));
        setPlay(next);
    }, [tournament.uuid, played.uuid]);
    useEffect(() => {
        void refresh().catch(() => undefined);
    }, [refresh, version]);
    useEffect(() => {
        setPlay(initialPlay);
        setSkewMs(clockSkew(initialPlay.server_time, Date.now()));
    }, [initialPlay]);
    const mine = played.seats.some((seat) => seat.participant === play.participant);
    const organizer = tournament.organizer_role != null && (organizerView || !mine);
    const over = tournament.state === TournamentState.Finished || tournament.state === TournamentState.Cancelled;
    const canReport = mine && !over && !tournament.entered_afterwards && play.round.state === RoundState.Running;
    const bestOf =
        play.round.stage === RoundStage.TopCut
            ? (tournament.top_cut_best_of ?? tournament.best_of)
            : tournament.best_of;
    const draft = useMemo(
        () =>
            lifeResultDraft(
                history,
                played.seats.map((seat) => seat.participant),
            ),
        [history, played.seats],
    );
    const players = useMemo(
        () =>
            [...played.seats]
                .sort((a, b) => a.seat - b.seat)
                .map((seat) => ({ id: seat.participant, name: seat.name })),
        [played.seats],
    );
    const dialog = {
        played: reporting ? played : null,
        initialResult: draft,
        title: t(organizer ? "heading.set-result" : "heading.report-result", { table: played.table_number ?? "" }),
        description: t("description.review-life-result"),
        onClose: () => setReporting(false),
        save: (result: SetResultRequest) =>
            organizer
                ? Api.tournaments.rounds.setResult(tournament.uuid, played.uuid, result)
                : Api.tournaments.results.report(tournament.uuid, played.uuid, result),
        explain: (error: Record<string, boolean>) =>
            t(
                error.not_running
                    ? "error.round-not-running"
                    : error.not_started
                      ? "error.round-not-started"
                      : error.reported_by_other
                        ? "error.result-reported-by-other"
                        : error.confirmed
                          ? "error.result-confirmed"
                          : error.disputed
                            ? "error.result-disputed"
                            : error.dropped_winner
                              ? "error.dropped-winner"
                              : "error.invalid-score",
            ),
        onSaved: async () => {
            setReporting(false);
            await refresh();
        },
    };
    return (
        <>
            <LifeCounter
                participants={players}
                allowNextGame={
                    tournament.table_size === 2 &&
                    bestOf === BestOf.Three &&
                    !draft?.games_won.some((wins) => wins >= 2)
                }
                initialTotals={players.map(() => matchStartingLife(tournament.format, players.length))}
                storageKey={storageKey}
                onHistoryChange={setHistory}
                backHref={`/tournaments/${tournament.uuid}`}
                readOnly={play.round.state !== RoundState.Running || over}
                context={
                    <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
                        <Text>
                            <Strong>{tournament.name}</Strong>
                            {" · "}
                            {t("heading.my-match", { number: play.round.number })}
                            {" · "}
                            {t("label.table")} {played.table_number}
                        </Text>
                        {played.result && (
                            <Text>
                                {t("label.result")}: {formatResult(played.result)}
                            </Text>
                        )}
                        {play.round.timer && (
                            <TournamentRoundClock
                                timer={play.round.timer}
                                ruleset={tournament.ruleset}
                                skewMs={skewMs}
                            />
                        )}
                        {organizer ? (
                            <Button outline onClick={() => setReporting(true)}>
                                {t("button.set-match-result")}
                            </Button>
                        ) : (
                            canReport && (
                                <MatchActions
                                    played={played}
                                    me={play.participant ?? ""}
                                    busy={busy}
                                    onReport={() => setReporting(true)}
                                    onDispute={async () => {
                                        setBusy(true);
                                        try {
                                            const result = await Api.tournaments.results.dispute(
                                                tournament.uuid,
                                                played.uuid,
                                            );
                                            if (isFormError(result)) notify.error(t("error.round-changed"));
                                            await refresh();
                                        } finally {
                                            setBusy(false);
                                        }
                                    }}
                                />
                            )
                        )}
                    </div>
                }
            />
            {(organizer || canReport) &&
                (tournament.table_size > 2 ? (
                    <TournamentWinnerDialog {...dialog} />
                ) : (
                    bestOf != null && <TournamentResultDialog {...dialog} bestOf={bestOf} />
                ))}
        </>
    );
}
