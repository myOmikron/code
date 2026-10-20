import {
    AdjustmentsHorizontalIcon,
    ArrowLeftIcon,
    ArrowPathIcon,
    ArrowsPointingInIcon,
    ArrowsPointingOutIcon,
} from "@heroicons/react/20/solid";
import { createFileRoute } from "@tanstack/react-router";
import clsx from "clsx";
import {
    Alert,
    AlertActions,
    AlertDescription,
    AlertTitle,
    Button,
    Description,
    Dialog,
    DialogActions,
    DialogBody,
    DialogTitle,
    Field,
    Heading,
    Input,
    Label,
    Listbox,
    ListboxLabel,
    ListboxOption,
    PrimaryButton,
    Switch,
    SwitchField,
} from "components";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { ResponseError } from "src/api/generated";
import { LifeTile } from "src/components/life-tile";
import { TournamentRoundClock } from "src/components/tournament-round-clock";
import i18n from "src/i18n";
import type { RoundClock } from "src/utils/round-clock";
import { clockSkew, roundClockOf } from "src/utils/round-clock";
import { startingLifeFor } from "src/utils/tournament-format";
import type { LifeTrackerSettings, Table } from "src/utils/life-tracker";
import { hapticConfirm } from "src/utils/haptics";
import { useFullscreen } from "src/utils/use-fullscreen";
import { useOrientationLock } from "src/utils/use-orientation-lock";
import { useTableOrientation } from "src/utils/use-table-orientation";
import { useWakeLock } from "src/utils/use-wake-lock";
import {
    CROSS_PLAYER_COUNT,
    PLAYER_COUNTS,
    SOLO_PLAYER_COUNT,
    STARTING_LIFE_RANGE,
    STARTING_LIFE_TOTALS,
    emptyCommanderDamage,
    freshTable,
    isStartingLife,
    loadLifeTrackerGame,
    loadLifeTrackerSettings,
    opponentOrder,
    resizeCommanderDamage,
    saveLifeTrackerGame,
    saveLifeTrackerSettings,
    seatFromBottom,
    seatingFor,
    trackHit,
    withHit,
} from "src/utils/life-tracker";

/** How long a run of taps stays readable after the last one */
const DELTA_LINGER = 3000;

/** What the address may say about this page */
type LifeTrackerSearch = {
    /** The tournament whose current table to seat */
    tournament?: string;
};

/** A tournament table the tracker was opened for */
type MatchTable = {
    /** The tournament, for the way back */
    tournamentUuid: string;
    /** The match, so its game is stored apart from any other */
    key: string;
    /** Everybody at the table, in seat order */
    names: Array<string>;
    /** Which of them holds this device */
    me: number;
    /** What the format starts everybody on */
    startingLife: number;
    /** The number on the table */
    tableNumber: number;
    /** The round's number, absent for an unscored round */
    roundNumber: number | null;
    /** The round clock, absent once the round is closed */
    clock: RoundClock | null;
    /** How far this device's clock is ahead of the server's */
    skewMs: number;
};

export const Route = createFileRoute("/_menu/game-utils/life-tracker")({
    validateSearch: (search: Record<string, unknown>): LifeTrackerSearch =>
        typeof search.tournament === "string" ? { tournament: search.tournament } : {},
    loaderDeps: ({ search }) => ({ tournament: search.tournament }),
    loader: async ({ deps }): Promise<MatchTable | null> => {
        if (deps.tournament === undefined) return null;
        // The round clock renders from the tournament namespace.
        await i18n.loadNamespaces("tournament");
        try {
            const [details, mine] = await Promise.all([
                Api.tournaments.get(deps.tournament),
                Api.tournaments.rounds.myMatch(deps.tournament),
            ]);
            const { table, round } = mine;
            if (table == null || table.is_bye || round == null) return null;
            return {
                tournamentUuid: deps.tournament,
                key: table.uuid,
                names: table.seats.map((seat) => seat.display_name),
                me: table.seats.findIndex((seat) => seat.participant === mine.participant),
                startingLife: startingLifeFor(details.tournament.format),
                tableNumber: table.table_number,
                roundNumber: round.number ?? null,
                clock: roundClockOf(round),
                skewMs: clockSkew(mine.server_time, Date.now()),
            };
        } catch (error) {
            if (error instanceof ResponseError) return null;
            throw error;
        }
    },
    component: RouteComponent,
});

/**
 * Everyone's life total on one screen, each tile turned towards its seat.
 *
 * @returns the life tracker
 */
function RouteComponent() {
    const [t] = useTranslation("game-utils");
    const [tg] = useTranslation();
    const match = Route.useLoaderData();
    // A tournament table brings its own pod and never overwrites the device's setup.
    const [settings, setSettings] = useState<LifeTrackerSettings>(() =>
        match === null
            ? loadLifeTrackerSettings()
            : { ...loadLifeTrackerSettings(), playerCount: match.names.length, startingLife: match.startingLife },
    );
    const [table, setTable] = useState<Table>(() => loadLifeTrackerGame(settings, match?.key) ?? freshTable(settings));
    const [typedLife, setTypedLife] = useState(() => String(settings.startingLife));
    const [configuring, setConfiguring] = useState(match === null);
    const [resetting, setResetting] = useState(false);
    const timers = useRef(new Map<number, number>());

    useEffect(() => () => timers.current.forEach((timer) => window.clearTimeout(timer)), []);

    // Saved on every change: service worker updates and tab discards reload without asking.
    useEffect(() => saveLifeTrackerGame(table, match?.key), [table, match?.key]);
    const fullscreen = useFullscreen(true);
    useWakeLock();
    useOrientationLock();
    const orientation = useTableOrientation();

    const seating = seatingFor(settings.playerCount, settings.arrangement, orientation);
    // Fixed once so names stay with their totals when the device turns.
    const [names] = useState(() => (match === null ? null : seatFromBottom(match.names, match.me, seating.seats)));

    /**
     * Records a change to the setup on this device
     *
     * @param next the fields that changed
     */
    function change(next: Partial<LifeTrackerSettings>) {
        setSettings((current) => {
            const changed = { ...current, ...next };
            if (match === null) saveLifeTrackerSettings(changed);
            return changed;
        });
    }

    /**
     * Seats a different number of players, leaving those already counting alone
     *
     * @param playerCount how many are playing now
     */
    function changePlayerCount(playerCount: number) {
        setTable((current) => ({
            life: Array.from({ length: playerCount }, (_, index) => current.life[index] ?? settings.startingLife),
            damage: resizeCommanderDamage(current.damage, playerCount),
            deltas: {},
            hits: {},
        }));
        change({ playerCount });
    }

    /**
     * Starts everyone over on a different total
     *
     * @param startingLife what everyone starts on
     */
    function changeStartingLife(startingLife: number) {
        setTable((current) => ({ ...current, life: current.life.map(() => startingLife) }));
        change({ startingLife });
    }

    /**
     * Takes a typed total, leaving the field alone until it reads as one
     *
     * @param typed what stands in the field
     */
    function editStartingLife(typed: string) {
        setTypedLife(typed);
        const total = Number(typed);
        if (typed.trim() !== "" && isStartingLife(total)) changeStartingLife(total);
    }

    /**
     * Takes one of the offered totals
     *
     * @param total the shortcut that was picked
     */
    function pickStartingLife(total: number) {
        setTypedLife(String(total));
        changeStartingLife(total);
    }

    /**
     * Lets one player's run of taps fade once they have stopped
     *
     * @param index which player was counting
     */
    function fadeDelta(index: number) {
        const running = timers.current.get(index);
        if (running !== undefined) window.clearTimeout(running);
        timers.current.set(
            index,
            window.setTimeout(() => {
                timers.current.delete(index);
                setTable((current) => {
                    const deltas = { ...current.deltas };
                    delete deltas[index];
                    return { ...current, deltas };
                });
            }, DELTA_LINGER),
        );
    }

    /**
     * Books a change against one player and keeps the run of taps on screen
     *
     * @param index which player took it
     * @param amount what to add to their total
     */
    function changeLife(index: number, amount: number) {
        const now = Date.now();
        setTable((current) => ({
            ...current,
            life: current.life.map((total, player) => (player === index ? total + amount : total)),
            deltas: { ...current.deltas, [index]: (current.deltas[index] ?? 0) + amount },
            hits: withHit(current.hits, index, trackHit(current.hits[index], amount, now)),
        }));
        fadeDelta(index);
    }

    /**
     * Books commander damage, which costs the player the same life; a tally never goes below zero
     *
     * @param index which player took it
     * @param opponent whose commander dealt it
     * @param amount how much to add to that commander's tally
     */
    function changeDamage(index: number, opponent: number, amount: number) {
        setTable((current) => {
            const taken = current.damage[index][opponent];
            const next = Math.max(0, taken + amount);
            if (next === taken) return current;

            const dealt = taken - next;
            return {
                life: current.life.map((total, player) => (player === index ? total + dealt : total)),
                damage: current.damage.map((row, player) =>
                    player === index ? row.map((value, other) => (other === opponent ? next : value)) : row,
                ),
                deltas: { ...current.deltas, [index]: (current.deltas[index] ?? 0) + dealt },
                hits: withHit(current.hits, index, undefined),
            };
        });
        fadeDelta(index);
    }

    /**
     * Charges a hit a player already took to one commander; the life is already gone
     *
     * @param index which player took it
     * @param opponent whose commander dealt it
     * @param amount how much of their life it cost
     */
    function rebookDamage(index: number, opponent: number, amount: number) {
        hapticConfirm();
        setTable((current) => ({
            ...current,
            damage: current.damage.map((row, player) =>
                player === index ? row.map((value, other) => (other === opponent ? value + amount : value)) : row,
            ),
            hits: withHit(current.hits, index, undefined),
        }));
    }

    /**
     * Closes the setup and hands the table the whole screen
     */
    function start() {
        setConfiguring(false);
        fullscreen.enter();
    }

    /**
     * Puts everyone back on the starting total for a fresh game, after confirmation
     */
    function reset() {
        hapticConfirm();
        setResetting(false);
        timers.current.forEach((timer) => window.clearTimeout(timer));
        timers.current.clear();
        setTable((current) => ({
            life: current.life.map(() => settings.startingLife),
            damage: emptyCommanderDamage(current.life.length),
            deltas: {},
            hits: {},
        }));
    }

    return (
        <div
            className={clsx(
                "flex min-h-0 flex-col gap-2 overflow-hidden",
                fullscreen.active ? "h-svh p-2" : "h-[calc(100svh-8.5rem)] sm:h-[calc(100svh-9.5rem)]",
            )}
        >
            <header className={"flex shrink-0 items-center justify-between gap-2"}>
                <div className={"flex min-w-0 items-center gap-2"}>
                    {match === null ? (
                        <Button plain={true} href={"/game-utils"} aria-label={t("button.back-to-tools")}>
                            <ArrowLeftIcon />
                        </Button>
                    ) : (
                        <Button
                            plain={true}
                            href={"/tournaments/$tournamentUuid"}
                            params={{ tournamentUuid: match.tournamentUuid }}
                            aria-label={t("button.back-to-tournament")}
                        >
                            <ArrowLeftIcon />
                        </Button>
                    )}
                    <Heading className={clsx("truncate", match?.clock != null && "max-sm:sr-only")}>
                        {match === null
                            ? t("heading.life-counter")
                            : match.roundNumber === null
                              ? t("heading.table", { table: match.tableNumber })
                              : t("heading.table-in-round", { table: match.tableNumber, round: match.roundNumber })}
                    </Heading>
                </div>
                <div className={"flex shrink-0 items-center gap-2"}>
                    {match?.clock != null && (
                        <TournamentRoundClock clock={match.clock} skewMs={match.skewMs} canControl={false} />
                    )}
                    {fullscreen.supported && (
                        <Button
                            outline={true}
                            onClick={fullscreen.toggle}
                            aria-label={fullscreen.active ? t("button.exit-fullscreen") : t("button.fullscreen")}
                        >
                            {fullscreen.active ? <ArrowsPointingInIcon /> : <ArrowsPointingOutIcon />}
                        </Button>
                    )}
                    <Button outline={true} onClick={() => setConfiguring(true)} aria-label={t("button.settings")}>
                        <AdjustmentsHorizontalIcon />
                        <span className={"max-sm:hidden"}>{t("button.settings")}</span>
                    </Button>
                    <Button
                        outline={true}
                        onClick={() => setResetting(true)}
                        aria-label={t("button.reset", { count: settings.playerCount })}
                    >
                        <ArrowPathIcon />
                        <span className={"max-sm:hidden"}>{t("button.reset", { count: settings.playerCount })}</span>
                    </Button>
                </div>
            </header>

            <section
                aria-label={t("heading.life-counter")}
                className={clsx(
                    "grid min-h-0 min-w-0 flex-1",
                    seating.grid,
                    seating.flush
                        ? "gap-0 overflow-hidden rounded-(--radius-card) shadow-(--shadow-card-md)"
                        : "gap-1.5 sm:gap-3",
                )}
            >
                {table.life.map((total, index) => (
                    <LifeTile
                        key={index}
                        number={index + 1}
                        name={names?.[index]}
                        life={total}
                        delta={table.deltas[index]}
                        damage={table.damage[index]}
                        opponents={opponentOrder(seating.seats, index)}
                        placement={seating.seats[index]}
                        flush={seating.flush}
                        onChange={(amount) => changeLife(index, amount)}
                        onDamage={(opponent, amount) => changeDamage(index, opponent, amount)}
                        hit={settings.rebook ? table.hits[index] : undefined}
                        onRebook={(opponent, amount) => rebookDamage(index, opponent, amount)}
                    />
                ))}
            </section>

            <Dialog open={configuring} onClose={() => setConfiguring(false)} size={"sm"}>
                <DialogTitle>{t("heading.settings")}</DialogTitle>
                <DialogBody>
                    <div className={"flex flex-col gap-5"}>
                        {match === null && (
                            <Field>
                                <Label>{t("label.players")}</Label>
                                <Listbox value={settings.playerCount} onChange={changePlayerCount}>
                                    {PLAYER_COUNTS.map((count) => (
                                        <ListboxOption key={count} value={count}>
                                            <ListboxLabel>{count}</ListboxLabel>
                                        </ListboxOption>
                                    ))}
                                </Listbox>
                            </Field>
                        )}
                        <div className={"flex flex-col gap-2"}>
                            <Field>
                                <Label>{t("label.starting-life")}</Label>
                                <Input
                                    type={"number"}
                                    inputMode={"numeric"}
                                    min={STARTING_LIFE_RANGE.min}
                                    max={STARTING_LIFE_RANGE.max}
                                    value={typedLife}
                                    onChange={(event) => editStartingLife(event.target.value)}
                                    onBlur={() => setTypedLife(String(settings.startingLife))}
                                />
                            </Field>
                            <div
                                role={"group"}
                                aria-label={t("accessibility.starting-life-presets")}
                                className={"flex flex-wrap gap-2"}
                            >
                                {STARTING_LIFE_TOTALS.map((total) => (
                                    <Button key={total} outline={true} onClick={() => pickStartingLife(total)}>
                                        {total}
                                    </Button>
                                ))}
                            </div>
                        </div>
                        {settings.playerCount === CROSS_PLAYER_COUNT && (
                            <Field>
                                <Label>{t("label.arrangement")}</Label>
                                <Listbox
                                    value={settings.arrangement}
                                    onChange={(arrangement) => change({ arrangement })}
                                >
                                    <ListboxOption value={"sides"}>
                                        <ListboxLabel>{t("label.arrangement-sides")}</ListboxLabel>
                                    </ListboxOption>
                                    <ListboxOption value={"cross"}>
                                        <ListboxLabel>{t("label.arrangement-cross")}</ListboxLabel>
                                    </ListboxOption>
                                </Listbox>
                            </Field>
                        )}
                        {settings.playerCount > SOLO_PLAYER_COUNT && (
                            <SwitchField>
                                <Label>{t("label.rebook")}</Label>
                                <Description>{t("description.rebook")}</Description>
                                <Switch
                                    color={"blue"}
                                    checked={settings.rebook}
                                    onChange={(rebook) => change({ rebook })}
                                />
                            </SwitchField>
                        )}
                    </div>
                </DialogBody>
                <DialogActions>
                    {/* Fullscreen needs a user gesture, so it is requested on this tap. */}
                    <PrimaryButton onClick={start}>{t("button.start")}</PrimaryButton>
                </DialogActions>
            </Dialog>

            <Alert open={resetting} onClose={() => setResetting(false)}>
                <AlertTitle>{t("heading.reset-game")}</AlertTitle>
                <AlertDescription>
                    {t("description.reset-game", { count: settings.playerCount, life: settings.startingLife })}
                </AlertDescription>
                <AlertActions>
                    <Button plain={true} onClick={() => setResetting(false)}>
                        {tg("button.cancel")}
                    </Button>
                    <Button color={"red"} onClick={reset}>
                        {t("button.confirm-reset")}
                    </Button>
                </AlertActions>
            </Alert>
        </div>
    );
}
