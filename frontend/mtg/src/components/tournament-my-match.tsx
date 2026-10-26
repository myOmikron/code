import { ArrowPathIcon } from "@heroicons/react/20/solid";
import { Badge, Button, Strong, Subheading, Text } from "components";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import type { MyMatchResponse, TournamentResponse } from "src/api/generated";
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
};

/**
 * The reader's own Match in the running Round: table, Seat and opponents, and the round timer.
 *
 * Shows nothing while no Round runs; an Account playing in none sees the timer only.
 *
 * @returns the Match card, or nothing
 */
export function TournamentMyMatch({ tournament }: TournamentMyMatchProps) {
    const [t] = useTranslation("tournament");
    const [loaded, setLoaded] = useState<Loaded | null>(null);
    const [busy, setBusy] = useState(false);
    const version = useLiveVersion("rounds");

    const load = useCallback(async () => {
        const response = await Api.tournaments.rounds.myMatch(tournament.uuid);
        return { response, skewMs: clockSkew(response.server_time, Date.now()) };
    }, [tournament.uuid, version]);

    useEffect(() => {
        let gone = false;
        load()
            .then((next) => {
                if (!gone) setLoaded(next);
            })
            .catch(() => undefined);
        return () => {
            gone = true;
        };
    }, [load]);

    const round = loaded?.response.round ?? null;
    if (loaded === null || round === null) return null;
    const me = loaded.response.participant ?? null;
    const played = round.my_match ?? null;
    if (played === null && (round.timer ?? null) === null) return null;
    const mine = played?.seats.find((seat) => seat.participant === me) ?? null;
    const opponents = played?.seats.filter((seat) => seat.participant !== me) ?? [];

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

            {round.timer != null && (
                <TournamentRoundClock timer={round.timer} ruleset={tournament.ruleset} skewMs={loaded.skewMs} />
            )}
        </section>
    );
}
