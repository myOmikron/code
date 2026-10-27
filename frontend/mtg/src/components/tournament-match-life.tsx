import { Button, Strong, Text, notify } from "components";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import type { MatchPlayResponse, SetResultRequest, TournamentResponse } from "src/api/generated";
import { BestOf, RoundStage, RoundState, TournamentState } from "src/api/generated";
import { MatchLifeHandover } from "src/components/match-life-handover";
import { LifeCounter } from "src/components/life-counter";
import { MatchActions } from "src/components/tournament-rounds";
import { TournamentRoundClock } from "src/components/tournament-round-clock";
import { TournamentResultDialog } from "src/components/tournament-result-dialog";
import { TournamentWinnerDialog } from "src/components/tournament-winner-dialog";
import { useLiveVersion } from "src/context/tournament-live-context";
import { isFormError } from "src/utils/error";
import { lifeResultDraft, matchLifeStorageKey, matchStartingLife } from "src/utils/match-life";
import { isMatchTransportFailure } from "src/utils/offline-match-scope";
import { clockSkew } from "src/utils/round-clock";
import { useDurableMatchLife } from "src/utils/use-durable-match-life";
import { formatResult } from "src/utils/tournament-rounds";

/** Counts an authorized Match locally while keeping its Round timer and explicit Result actions available. */
export function TournamentMatchLife({
    tournament: initialTournament,
    initialPlay,
    organizerView,
    initialSkewMs,
    offline = false,
}: {
    tournament: TournamentResponse;
    initialPlay: MatchPlayResponse;
    organizerView: boolean;
    initialSkewMs?: number;
    offline?: boolean;
}) {
    const [t] = useTranslation("tournament");
    const [play, setPlay] = useState(initialPlay);
    const [tournament, setTournament] = useState(initialTournament);
    const [offlineContext, setOfflineContext] = useState(offline);
    const [skewMs, setSkewMs] = useState(() => initialSkewMs ?? clockSkew(initialPlay.server_time, Date.now()));
    const [reporting, setReporting] = useState(false);
    const [busy, setBusy] = useState(false);
    const [showHandover, setShowHandover] = useState(false);
    const played = play.round.matches[0];
    const storageKey = matchLifeStorageKey(tournament.uuid, played.uuid);
    const context = useMemo(() => ({ tournament, play, skewMs }), [tournament, play, skewMs]);
    const durable = useDurableMatchLife(tournament.uuid, played.uuid, storageKey, context);
    const history = durable.history;
    const version = useLiveVersion("rounds");
    const refresh = useCallback(async () => {
        try {
            const [nextTournament, next] = await Promise.all([
                Api.tournaments.matchRecovery.tournament(tournament.uuid),
                Api.tournaments.matchRecovery.play(tournament.uuid, played.uuid),
            ]);
            setSkewMs(clockSkew(next.server_time, Date.now()));
            setPlay(next);
            setTournament(nextTournament);
            setOfflineContext(false);
        } catch (error) {
            if (isMatchTransportFailure(error)) setOfflineContext(true);
            throw error;
        }
    }, [tournament.uuid, played.uuid]);
    useEffect(() => {
        const reconnect = () => {
            void refresh().catch(() => undefined);
        };
        reconnect();
        const disconnected = () => setOfflineContext(true);
        window.addEventListener("online", reconnect);
        window.addEventListener("offline", disconnected);
        return () => {
            window.removeEventListener("online", reconnect);
            window.removeEventListener("offline", disconnected);
        };
    }, [refresh, version]);
    useEffect(() => {
        setPlay(initialPlay);
        setTournament(initialTournament);
        setOfflineContext(offline);
        setSkewMs(initialSkewMs ?? clockSkew(initialPlay.server_time, Date.now()));
    }, [initialPlay, initialSkewMs, initialTournament, offline]);
    const mine = played.seats.some((seat) => seat.participant === play.participant);
    const organizer = tournament.organizer_role != null && (organizerView || !mine);
    const over = tournament.state === TournamentState.Finished || tournament.state === TournamentState.Cancelled;
    const canReport =
        !offlineContext && mine && !over && !tournament.entered_afterwards && play.round.state === RoundState.Running;
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
    const controls = (
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
                <TournamentRoundClock timer={play.round.timer} ruleset={tournament.ruleset} skewMs={skewMs} />
            )}
            {organizer && !offlineContext ? (
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
                                const result = await Api.tournaments.results.dispute(tournament.uuid, played.uuid);
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
    );
    const showCounter =
        durable.identity !== null && durable.state !== "auth" && (durable.writer || durable.history !== null);
    const saveControls = (
        <div className={"flex flex-wrap items-center gap-3 p-3"}>
            {!showCounter && (
                <Button plain href={`/tournaments/${tournament.uuid}`}>
                    {t("button.back-to-tournament")}
                </Button>
            )}
            <Text role={"status"}>
                {t(
                    durable.state === "storage"
                        ? "error.life-history-storage"
                        : durable.state === "auth"
                          ? "error.life-history-auth"
                          : durable.state === "pending"
                            ? "label.life-history-pending"
                            : durable.state === "loading"
                              ? "label.life-history-loading"
                              : durable.state === "saving"
                                ? "label.life-history-saving"
                                : durable.state === "saved"
                                  ? "label.life-history-saved"
                                  : durable.state === "failed"
                                    ? "error.life-history-save"
                                    : durable.state === "invalid"
                                      ? "error.life-history-invalid"
                                      : durable.state === "conflict"
                                        ? "error.life-history-conflict"
                                        : history === null
                                          ? "label.life-history-not-recording"
                                          : "label.life-history-local",
                )}
            </Text>
            {durable.remote !== null && !durable.writer && <Text>{t("description.life-history-observer")}</Text>}
            {durable.remote?.writer == null &&
                durable.remote !== null &&
                !over &&
                play.round.state === RoundState.Running && (
                    <Button outline disabled={durable.state === "saving"} onClick={() => void durable.claim()}>
                        {t("button.record-match-life")}
                    </Button>
                )}
            {(durable.state === "failed" ||
                durable.state === "storage" ||
                durable.state === "pending" ||
                durable.state === "conflict") && (
                <Button outline onClick={durable.retry}>
                    {t("button.retry-life-history-save")}
                </Button>
            )}
            {durable.identity !== null && durable.state !== "auth" && (
                <Button plain onClick={() => setShowHandover(true)}>
                    {t("button.life-recording-devices")}
                </Button>
            )}
            {durable.remote !== null && !durable.writer && !durable.remote.history && (
                <Text>{t("description.life-history-empty")}</Text>
            )}
        </div>
    );
    return (
        <>
            {durable.identity !== null && durable.state !== "auth" && (
                <MatchLifeHandover
                    key={durable.identity}
                    open={showHandover}
                    onClose={() => setShowHandover(false)}
                    tournament={tournament.uuid}
                    played={played.uuid}
                    durable={durable}
                    playable={!over && play.round.state === RoundState.Running}
                />
            )}
            {!showCounter && (
                <>
                    {saveControls}
                    {controls}
                </>
            )}
            {showCounter && (
                <LifeCounter
                    key={
                        durable.writer ? "writer" : `observer-${durable.remote?.generation}-${durable.remote?.revision}`
                    }
                    initialHistory={history ?? undefined}
                    participants={players}
                    allowNextGame={
                        tournament.table_size === 2 &&
                        bestOf === BestOf.Three &&
                        !draft?.games_won.some((wins) => wins >= 2)
                    }
                    initialTotals={players.map(() => matchStartingLife(tournament.format, players.length))}
                    storageKey={durable.writer ? durable.storageKey : `${durable.storageKey}.observer`}
                    initialConfigured={durable.configured}
                    onHistoryChange={durable.changed}
                    backHref={`/tournaments/${tournament.uuid}`}
                    readOnly={!durable.writer || play.round.state !== RoundState.Running || over}
                    context={
                        <div className={"flex shrink-0 flex-col gap-2"}>
                            {saveControls}
                            {controls}
                        </div>
                    }
                />
            )}
            {((!offlineContext && organizer) || canReport) &&
                (tournament.table_size > 2 ? (
                    <TournamentWinnerDialog {...dialog} />
                ) : (
                    bestOf != null && <TournamentResultDialog {...dialog} bestOf={bestOf} />
                ))}
        </>
    );
}
