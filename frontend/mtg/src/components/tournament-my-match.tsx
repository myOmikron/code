import { CheckIcon, FlagIcon, HeartIcon, PencilIcon } from "@heroicons/react/20/solid";
import { Button, notify } from "components";
import clsx from "clsx";
import { useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { RoundKind } from "src/api/generated";
import type { MatchReportResponse, MatchTableResponse, MyMatchResponse, TournamentResponse } from "src/api/generated";
import { TournamentReportDialog } from "src/components/tournament-report-dialog";
import { roundTitle } from "src/components/tournament-round-panel";
import { TournamentRoundClock } from "src/components/tournament-round-clock";
import { isFormError } from "src/utils/error";
import type { RoundClock } from "src/utils/round-clock";

/**
 * The properties for {@link TournamentMyMatch}
 */
export type TournamentMyMatchProps = {
    /** The tournament being played */
    tournamentUuid: string;
    /** The tournament itself, for its match length and bye points */
    tournament: TournamentResponse;
    /** The viewer's own table */
    match: MyMatchResponse;
    /** How far this device's clock is ahead of the server's */
    skewMs: number;
    /** Whether to show the round clock; the desk has its own right below */
    showClock?: boolean;
    /** Called after the viewer reported or confirmed */
    onChanged: () => void | Promise<void>;
};

/**
 * The viewer's own table in the current round: where to sit, against whom, the clock, and the way
 * to report.
 *
 * @returns the card, or nothing for a viewer who is not playing this round
 */
export function TournamentMyMatch({
    tournamentUuid,
    tournament,
    match,
    skewMs,
    showClock = true,
    onChanged,
}: TournamentMyMatchProps) {
    const [t] = useTranslation("tournament");
    const [reporting, setReporting] = useState(false);
    const [confirming, setConfirming] = useState(false);

    const { round, table, participant: me } = match;
    if (me == null || round == null || round.kind === RoundKind.Deckbuilding) return null;

    if (table == null) {
        if (round.status === "Complete") return null;
        return (
            <Card>
                <Eyebrow>{roundTitle(round, t)}</Eyebrow>
                <span className={"text-base font-semibold text-zinc-950 dark:text-white"}>
                    {t("label.no-pairing-yet")}
                </span>
            </Card>
        );
    }

    if (table.is_bye) {
        return (
            <Card>
                <Eyebrow>{roundTitle(round, t)}</Eyebrow>
                <span className={"text-4xl font-bold text-zinc-950 dark:text-white"}>{t("label.bye")}</span>
                <span className={"text-zinc-600 dark:text-zinc-300"}>
                    {t("label.bye-points", { count: tournament.points_bye })}
                </span>
            </Card>
        );
    }

    const duel = table.seats.length === 2;
    const opponent = duel ? table.seats.find((seat) => seat.participant !== me) : undefined;
    const nameOf = (participant: string | null | undefined) =>
        table.seats.find((seat) => seat.participant === participant)?.display_name ?? "";
    const mine = match.reports.find((report) => report.reporter === me);
    const theirs = match.reports.find((report) => report.reporter !== me);
    const open = round.status !== "Complete";
    const clock: RoundClock | null = open
        ? {
              endsAt: round.timer.ends_at ?? null,
              pausedAt: round.timer.paused_at ?? null,
              lengthSeconds: round.timer.length_seconds,
          }
        : null;

    /**
     * Says what a report claims, from the viewer's side of the table
     *
     * @param report the claim
     *
     * @returns the phrase
     */
    function describe(report: Pick<MatchReportResponse, "winner" | "draw" | "winner_games" | "loser_games">) {
        if (report.draw) return t("label.draw");
        if (duel) {
            const score = `${report.winner_games}:${report.loser_games}`;
            return report.winner === me
                ? t("label.score-for-you", { score })
                : t("label.score-for", { score, name: nameOf(report.winner) });
        }
        return report.winner === me ? t("label.you-won") : t("label.player-won", { name: nameOf(report.winner) });
    }

    /**
     * Agrees with what somebody else at the table reported
     */
    async function confirm() {
        if (theirs === undefined || table == null) return;
        setConfirming(true);
        try {
            const response = await Api.tournaments.matches.report(tournamentUuid, table.uuid, {
                winner: theirs.winner ?? undefined,
                draw: theirs.draw,
                winner_games: theirs.winner_games,
                loser_games: theirs.loser_games,
                games_drawn: theirs.games_drawn,
                client_key: crypto.randomUUID(),
            });
            if (isFormError(response)) {
                notify.error(response.error.round_closed ? t("error.result-not-editable") : t("error.invalid-outcome"));
                return;
            }
            await onChanged();
        } finally {
            setConfirming(false);
        }
    }

    const change = (
        <Button plain={true} onClick={() => setReporting(true)}>
            <PencilIcon />
            {t("button.change-report")}
        </Button>
    );

    let status: ReactNode = null;
    if (round.status === "Pairing") {
        status = <Status tone={"info"} title={t("label.round-starts-soon")} />;
    } else if (table.status === "Confirmed") {
        status = (
            <Status
                tone={"ok"}
                title={t("label.result-confirmed", {
                    result: describe({
                        winner: table.winner,
                        draw: table.is_draw,
                        winner_games: Math.max(...table.seats.map((seat) => seat.games_won)),
                        loser_games: Math.min(...table.seats.map((seat) => seat.games_won)),
                    }),
                })}
            />
        );
    } else if (table.status === "Disputed") {
        status = <Status tone={"bad"} title={t("label.result-disputed")} actions={open && change} />;
    } else if (mine !== undefined) {
        status = (
            <Status
                tone={"info"}
                title={t("label.you-reported", { result: describe(mine) })}
                detail={
                    opponent !== undefined
                        ? t("label.waiting-for", { name: opponent.display_name })
                        : t("label.waiting-for-confirmation")
                }
                actions={open && change}
            />
        );
    } else if (theirs !== undefined) {
        status = (
            <Status
                tone={"warn"}
                title={t("label.someone-reported", { name: nameOf(theirs.reporter), result: describe(theirs) })}
                actions={
                    open && (
                        <>
                            <Button color={"emerald"} disabled={confirming} onClick={() => void confirm()}>
                                <CheckIcon />
                                {t("button.confirm-result")}
                            </Button>
                            <Button outline={true} onClick={() => setReporting(true)}>
                                {t("button.report-other")}
                            </Button>
                        </>
                    )
                }
            />
        );
    }

    const canReport = round.status === "Running" && table.status === "Unreported";

    return (
        <Card>
            <div className={"flex items-end justify-between gap-3"}>
                <div className={"flex flex-col gap-1"}>
                    <Eyebrow>
                        {t("heading.your-table")} · {roundTitle(round, t)}
                    </Eyebrow>
                    <span
                        className={
                            "font-mono text-6xl/none font-bold tracking-tight text-zinc-950 tabular-nums dark:text-white"
                        }
                    >
                        {table.table_number}
                    </span>
                </div>
                {showClock && clock !== null && (
                    <TournamentRoundClock clock={clock} skewMs={skewMs} canControl={false} />
                )}
            </div>

            {duel ? <Duel table={table} me={me} /> : <Pod table={table} me={me} />}

            <div className={"flex flex-wrap gap-2"}>
                <Button
                    color={"blue"}
                    className={"flex-1 whitespace-nowrap"}
                    href={"/game-utils/life-tracker"}
                    search={{ tournament: tournamentUuid }}
                >
                    <HeartIcon />
                    {t("button.count-life")}
                </Button>
                <Button
                    outline={true}
                    className={"flex-1 whitespace-nowrap"}
                    disabled={!canReport}
                    onClick={() => setReporting(true)}
                >
                    <FlagIcon />
                    {t("button.report-result")}
                </Button>
            </div>

            {status}

            <TournamentReportDialog
                tournamentUuid={tournamentUuid}
                table={reporting ? table : null}
                me={me}
                gamesPerMatch={tournament.games_per_match}
                previous={mine}
                onClose={() => setReporting(false)}
                onSaved={onChanged}
            />
        </Card>
    );
}

/**
 * The card's frame
 *
 * @returns the card
 */
function Card({ children }: { children: ReactNode }) {
    return (
        <section
            className={
                "flex flex-col gap-4 rounded-(--radius-card) bg-(--surface-card) p-4 shadow-(--shadow-card-sm) ring-1 ring-zinc-950/5 sm:p-5 dark:ring-white/10"
            }
        >
            {children}
        </section>
    );
}

/**
 * A small uppercase label over a value
 *
 * @returns the label
 */
function Eyebrow({ children }: { children: ReactNode }) {
    return (
        <span className={"text-xs font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"}>
            {children}
        </span>
    );
}

/** How a status line reads */
type Tone = "info" | "ok" | "warn" | "bad";

/**
 * One line about where the result stands, with what can be done about it
 *
 * @returns the line
 */
function Status({ tone, title, detail, actions }: { tone: Tone; title: string; detail?: string; actions?: ReactNode }) {
    return (
        <div
            className={clsx(
                "flex flex-col gap-2 rounded-lg px-3 py-2.5 text-sm/6",
                tone === "info" && "bg-blue-500/10",
                tone === "ok" && "bg-emerald-500/10",
                tone === "warn" && "bg-amber-500/15",
                tone === "bad" && "bg-red-500/10",
            )}
        >
            <div className={"text-zinc-950 dark:text-white"}>
                <span className={"font-semibold"}>{title}</span>
                {detail !== undefined && <span className={"block text-zinc-600 dark:text-zinc-300"}>{detail}</span>}
            </div>
            {actions && <div className={"flex flex-wrap gap-2"}>{actions}</div>}
        </div>
    );
}

/**
 * Two players facing each other, the score between them once it stands
 *
 * @returns the line-up
 */
function Duel({ table, me }: { table: MatchTableResponse; me: string }) {
    const [t] = useTranslation("tournament");
    const own = table.seats.find((seat) => seat.participant === me);
    const other = table.seats.find((seat) => seat.participant !== me);
    const settled = table.status === "Confirmed";

    return (
        <div className={"grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center"}>
            <span className={"text-base font-semibold text-zinc-950 dark:text-white"}>{t("label.you")}</span>
            <span
                className={clsx(
                    "font-mono text-2xl font-bold tabular-nums",
                    settled ? "text-zinc-950 dark:text-white" : "text-zinc-400 dark:text-zinc-500",
                )}
            >
                {settled ? `${own?.games_won ?? 0}:${other?.games_won ?? 0}` : "–:–"}
            </span>
            <span className={"min-w-0 text-base font-semibold break-words text-zinc-950 dark:text-white"}>
                {other?.display_name}
            </span>
        </div>
    );
}

/**
 * Everybody at a pod in turn order, the viewer highlighted
 *
 * @returns the seat list
 */
function Pod({ table, me }: { table: MatchTableResponse; me: string }) {
    const [t] = useTranslation("tournament");

    return (
        <ol className={"flex flex-col gap-0.5"}>
            {table.seats.map((seat) => (
                <li
                    key={seat.participant}
                    className={clsx(
                        "flex items-center gap-3 rounded-lg px-2 py-1.5",
                        seat.participant === me && "bg-blue-500/10",
                    )}
                >
                    <span
                        className={
                            "grid size-6 shrink-0 place-items-center rounded-full bg-zinc-950/5 font-mono text-xs font-semibold text-zinc-600 dark:bg-white/10 dark:text-zinc-300"
                        }
                    >
                        {seat.seat}
                    </span>
                    <span className={"min-w-0 flex-1 truncate font-medium text-zinc-950 dark:text-white"}>
                        {seat.participant === me ? t("label.you") : seat.display_name}
                    </span>
                    {seat.seat === 1 && (
                        <span className={"text-xs text-zinc-500 dark:text-zinc-400"}>{t("label.goes-first")}</span>
                    )}
                </li>
            ))}
        </ol>
    );
}
