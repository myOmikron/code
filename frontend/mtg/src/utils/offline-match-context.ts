import { Api } from "src/api/api";
import { ResponseError } from "src/api/generated";
import { MatchLifeRecording } from "src/utils/match-life-recording";
import type { OfflineMatchContext } from "src/utils/match-life-recording";
import { isMatchTransportFailure, readOfflineMatchScope, setOfflineMatchAccount } from "src/utils/offline-match-scope";
import { clockSkew } from "src/utils/round-timer";

/**
 * Loads authorized Match context, falling back to this Account's recording only after transport failure.
 *
 * @param tournament Tournament identity
 * @param match Match identity
 * @returns fresh context or the last authorized writer context with its original clock offset
 */
export async function loadRecoverableMatch(
    tournament: string,
    match: string,
): Promise<OfflineMatchContext & { offline: boolean }> {
    try {
        const [loaded, play] = await Promise.allSettled([
            Api.tournaments.matchRecovery.tournament(tournament),
            Api.tournaments.matchRecovery.play(tournament, match),
        ]);
        if (loaded.status === "rejected" || play.status === "rejected") {
            const failures = [loaded, play].flatMap((response) =>
                response.status === "rejected" ? [response.reason] : [],
            );
            throw (
                failures.find((error) => error instanceof ResponseError && error.response.status === 401) ??
                failures.find((error) => !isMatchTransportFailure(error)) ??
                failures[0]
            );
        }
        return {
            tournament: loaded.value,
            play: play.value,
            skewMs: clockSkew(play.value.server_time, Date.now()),
            offline: false,
        };
    } catch (error) {
        if (error instanceof ResponseError && error.response.status === 401) setOfflineMatchAccount(null);
        if (!isMatchTransportFailure(error)) throw error;
        const scope = readOfflineMatchScope();
        if (!scope) throw error;
        const recording = new MatchLifeRecording({ account: scope.account, tournament, match });
        const stored = recording.snapshot();
        if (
            (!recording.writer() &&
                !(
                    stored.claimAccepted &&
                    (stored.transfer || stored.blocked === "conflict" || stored.blocked === "invalid")
                )) ||
            !stored.context ||
            !stored.local
        )
            throw error;
        return { ...stored.context, offline: true };
    }
}
