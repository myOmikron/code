import {
    AdjustmentsHorizontalIcon,
    ArrowLeftIcon,
    ArrowPathIcon,
    ClockIcon,
    ArrowsPointingInIcon,
    ArrowsPointingOutIcon,
} from "@heroicons/react/20/solid";

import clsx from "clsx";
import {
    Alert,
    AlertActions,
    AlertDescription,
    AlertTitle,
    Button,
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
    Text,
} from "components";
import { PrimaryButton } from "src/components/primary-button";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { LifeHistoryView } from "src/components/life-history-view";
import type { LifeHistory, LifePlayer } from "src/utils/life-history";
import {
    createLifeHistory,
    changeLifeHistory,
    changeCommanderHistory,
    endLifeGame,
    nextLifeGame,
    loadLifeHistory,
    saveLifeHistory,
    correctLifeEvent,
} from "src/utils/life-history";
import { useTranslation } from "react-i18next";
import type { TileBooking } from "src/components/life-tile";
import { LifeTile } from "src/components/life-tile";
import type { LifeTrackerSettings, Table } from "src/utils/life-tracker";
import { hapticConfirm } from "src/utils/haptics";
import { useImmersive } from "src/utils/use-immersive";
import { useOrientationLock } from "src/utils/use-orientation-lock";
import { useTableOrientation } from "src/utils/use-table-orientation";
import { useWakeLock } from "src/utils/use-wake-lock";
import {
    BOOKING_LINGER,
    CROSS_PLAYER_COUNT,
    PLAYER_COUNTS,
    REBOOK_LINGER,
    STARTING_LIFE_RANGE,
    STARTING_LIFE_TOTALS,
    isStartingLife,
    loadLifeTrackerGame,
    loadLifeTrackerSettings,
    opponentOrder,
    rebookableHit,
    saveLifeTrackerSettings,
    seatingFor,
    trackHit,
    withHit,
} from "src/utils/life-tracker";

/** How long a run of taps stays readable after the last one */
const DELTA_LINGER = 3000;

/** Commander damage being booked at the table */
type Booking = {
    /** Which player took it, counted from zero */
    player: number;
    /**
     * What they lost to a hit no commander has been charged for, when the
     * booking was opened right after one. Snapshotted then rather than read as
     * it renders: the offer is a statement about the moment the shield was
     * tapped, and it has to stand still while it is being read, even though
     * the hit behind it goes stale a heartbeat later.
     */
    offer: number | undefined;
};

/**
 * Everyone's life total on one screen, each tile turned towards its seat.
 *
 * @returns the life tracker
 */
export function LifeCounter({
    participants,
    backHref = "/game-utils",
    initialTotals,
    context,
    storageKey = "cardlens.life-history.v1",
    initialHistory,
    onHistoryChange,
    readOnly = false,
}: {
    participants?: LifePlayer[];
    backHref?: string;
    initialTotals?: number[];
    context?: ReactNode;
    storageKey?: string;
    initialHistory?: LifeHistory;
    onHistoryChange?: (history: LifeHistory) => void;
    readOnly?: boolean;
}) {
    const historyChange = useRef(onHistoryChange);
    historyChange.current = onHistoryChange;
    const [t] = useTranslation("game-utils");
    const [tg] = useTranslation();
    const [settings, setSettings] = useState(() => ({
        ...loadLifeTrackerSettings(),
        ...(participants ? { playerCount: participants.length, startingLife: initialTotals?.[0] ?? 40 } : {}),
    }));
    const [history, setHistory] = useState(
        () =>
            initialHistory ??
            loadLifeHistory(storageKey) ??
            (() => {
                const players =
                    participants ??
                    Array.from({ length: settings.playerCount }, (_, index) => ({
                        id: String(index + 1),
                        name: t("label.player", { number: index + 1 }),
                    }));
                const legacy = participants ? null : loadLifeTrackerGame(settings);
                const created = createLifeHistory(
                    players,
                    initialTotals ?? legacy?.life ?? Array(settings.playerCount).fill(settings.startingLife),
                );
                if (legacy) created.games[0].damage = legacy.damage;
                return created;
            })(),
    );
    const game = history.games.at(-1)!;
    const [feedback, setFeedback] = useState<Pick<Table, "deltas" | "hits">>({ deltas: {}, hits: {} });
    const table: Table = { life: game.life, damage: game.damage, ...feedback };
    const [showHistory, setShowHistory] = useState(false);
    const [outcome, setOutcome] = useState<string>("draw");
    const [editedTotals, setEditedTotals] = useState(false);
    const [typedLife, setTypedLife] = useState(() => String(settings.startingLife));
    const [configuring, setConfiguring] = useState(!initialHistory && !loadLifeHistory(storageKey));
    const [resetting, setResetting] = useState(false);

    const [booking, setBooking] = useState<Booking | undefined>(undefined);
    const timers = useRef(new Map<number, number>());
    const bookingTimers = useRef<{ offer?: number; idle?: number }>({});

    useEffect(
        () => () => {
            timers.current.forEach((timer) => window.clearTimeout(timer));
            window.clearTimeout(bookingTimers.current.offer);
            window.clearTimeout(bookingTimers.current.idle);
        },
        [],
    );

    useEffect(() => {
        saveLifeHistory(storageKey, history);
        historyChange.current?.(history);
    }, [history, storageKey]);

    const immersive = useImmersive(true);

    useWakeLock();
    useOrientationLock();

    const orientation = useTableOrientation();

    const seating = seatingFor(game.players.length, settings.arrangement, orientation);

    /**
     * Records a change to the setup on this device
     *
     * @param next the fields that changed
     */
    function change(next: Partial<LifeTrackerSettings>) {
        setSettings((current) => {
            const changed = { ...current, ...next };
            saveLifeTrackerSettings(changed);
            return changed;
        });
    }

    /**
     * Seats a different number of players, leaving those already counting alone
     *
     * @param playerCount how many are playing now
     */
    function changePlayerCount(playerCount: number) {
        closeBooking();
        change({ playerCount });
    }

    /**
     * Starts everyone over on a different total
     *
     * @param startingLife what everyone starts on
     */
    function changeStartingLife(startingLife: number) {
        setEditedTotals(true);
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
                setFeedback((current) => {
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
        if (readOnly || game.outcome) return;
        const now = Date.now();
        setHistory((current) => changeLifeHistory(current, index, amount, now));
        setFeedback((current) => ({
            deltas: { ...current.deltas, [index]: (current.deltas[index] ?? 0) + amount },
            hits: withHit(current.hits, index, trackHit(current.hits[index], amount, now)),
        }));
        fadeDelta(index);
    }

    /**
     * Books commander damage, which costs the player the same life.
     *
     * Nothing goes below nothing: taking a hit back off a player at zero damage
     * leaves both the damage and their total alone.
     *
     * @param index which player took it
     * @param opponent whose commander dealt it
     * @param amount how much to add to that commander's tally
     */
    function changeDamage(index: number, opponent: number, amount: number) {
        if (readOnly || game.outcome) return;
        setHistory((current) => changeCommanderHistory(current, index, opponent, amount));
        setFeedback((current) => ({ ...current, hits: withHit(current.hits, index, undefined) }));
        fadeDelta(index);
    }

    /**
     * Charges a hit a player already took to one commander after the fact.
     *
     * The life went the moment they tapped their tile; all that is missing is
     * whose commander it came off. So this only writes the tally, and writing
     * it a second time is what booking it on the opponent's tile normally does.
     *
     * @param index which player took it
     * @param opponent whose commander dealt it
     * @param amount how much of their life it cost
     */
    function rebookDamage(index: number, opponent: number, amount: number) {
        if (readOnly || game.outcome) return;
        hapticConfirm();
        setHistory((current) => changeCommanderHistory(current, index, opponent, amount, true));
        setFeedback((current) => ({ ...current, hits: withHit(current.hits, index, undefined) }));
    }

    /**
     * Hands every tile back to its own player
     */
    function closeBooking() {
        window.clearTimeout(bookingTimers.current.offer);
        window.clearTimeout(bookingTimers.current.idle);
        bookingTimers.current = {};
        setBooking(undefined);
    }

    /**
     * Keeps the booking open for another while.
     *
     * Every tap while booking starts the clock over, so the table only takes
     * the tiles back from a player who has stopped using them.
     */
    function keepBooking() {
        window.clearTimeout(bookingTimers.current.idle);
        bookingTimers.current.idle = window.setTimeout(closeBooking, BOOKING_LINGER);
    }

    /**
     * Takes the offer off the booking, however it ended
     */
    function dropOffer() {
        window.clearTimeout(bookingTimers.current.offer);
        bookingTimers.current.offer = undefined;
        setBooking((current) =>
            current === undefined || current.offer === undefined ? current : { ...current, offer: undefined },
        );
    }

    /**
     * Opens booking commander damage for one player, arming the offer on the
     * way in.
     *
     * Only the way in arms it: a booking that is already open was not opened
     * on the back of anything.
     *
     * @param index which player took the hit
     */
    function openBooking(index: number) {
        closeBooking();
        const offer = rebookableHit(table.hits[index], Date.now());
        setBooking({ player: index, offer });
        if (offer !== undefined) bookingTimers.current.offer = window.setTimeout(dropOffer, REBOOK_LINGER);
        keepBooking();
    }

    /**
     * Opens booking for a player, or closes the one they have open
     *
     * @param index which player tapped their strip
     */
    function toggleBooking(index: number) {
        if (booking?.player === index) closeBooking();
        else openBooking(index);
    }

    /**
     * Books commander damage from an opponent's tile against the player booking
     *
     * @param opponent whose commander dealt it
     * @param amount how much to add to that commander's tally
     */
    function bookDamage(opponent: number, amount: number) {
        if (booking === undefined) return;

        dropOffer();
        changeDamage(booking.player, opponent, amount);
        keepBooking();
    }

    /**
     * Charges the offered hit to an opponent's commander
     *
     * @param opponent whose commander dealt it
     */
    function rebook(opponent: number) {
        if (booking?.offer === undefined) return;
        dropOffer();
        rebookDamage(booking.player, opponent, booking.offer);
        keepBooking();
    }

    /**
     * What part one tile plays in the booking that is open
     *
     * @param index whose tile
     *
     * @returns the part, or `undefined` when nobody is booking
     */
    function bookingFor(index: number): TileBooking | undefined {
        if (booking === undefined) return undefined;
        if (booking.player === index)
            return {
                role: "booking",
                taken: table.damage[index][index],
                offer: booking.offer,
                onDismiss: dropOffer,
                onChange: (amount) => bookDamage(index, amount),
                onRebook: () => rebook(index),
            };
        return {
            role: "target",
            player: booking.player + 1,
            reader: seating.seats[booking.player].seat,
            taken: table.damage[booking.player][index],
            offer: booking.offer,
            onChange: (amount) => bookDamage(index, amount),
            onRebook: () => rebook(index),
        };
    }

    /**
     * Closes the setup and hands the table the whole screen
     */
    function start() {
        if (!readOnly && (game.outcome || (history.games.length === 1 && game.events.length === 1))) {
            const players =
                participants ??
                Array.from({ length: settings.playerCount }, (_, index) => ({
                    id: String(index + 1),
                    name: t("label.player", { number: index + 1 }),
                }));
            const totals = players.map(
                (_, index) => (!editedTotals ? initialTotals?.[index] : undefined) ?? settings.startingLife,
            );
            setHistory((current) =>
                current.games.at(-1)!.outcome
                    ? nextLifeGame(current, players, totals)
                    : createLifeHistory(players, totals),
            );
            setFeedback({ deltas: {}, hits: {} });
        }
        setConfiguring(false);
        immersive.enter();
    }

    /** Records the explicit Game outcome and keeps earlier Games. */
    function reset() {
        hapticConfirm();
        setResetting(false);
        closeBooking();
        timers.current.forEach((timer) => window.clearTimeout(timer));
        timers.current.clear();
        setHistory((current) => endLifeGame(current, outcome === "draw" ? { draw: true } : { winner: outcome }));
        setFeedback({ deltas: {}, hits: {} });
    }

    return (
        <div
            className={clsx(
                "flex min-h-0 flex-col gap-2 overflow-hidden",

                immersive.active
                    ? "h-svh pt-[max(0.5rem,env(safe-area-inset-top))] pr-[max(0.5rem,env(safe-area-inset-right))] pb-[max(0.5rem,env(safe-area-inset-bottom))] pl-[max(0.5rem,env(safe-area-inset-left))]"
                    : "h-[calc(100svh-8.5rem)] sm:h-[calc(100svh-9.5rem)]",
            )}
        >
            <header className={"flex shrink-0 flex-wrap items-center justify-between gap-2"}>
                <div className={"flex min-w-0 items-center gap-2"}>
                    <Button plain={true} href={backHref} aria-label={t("button.back-to-tools")}>
                        <ArrowLeftIcon />
                    </Button>
                    <Heading className={"truncate"}>{t("heading.life-counter")}</Heading>
                </div>
                <div className={"flex shrink-0 items-center gap-2"}>
                    <Button
                        outline={true}
                        onClick={() => {
                            closeBooking();
                            setShowHistory(true);
                        }}
                        aria-label={t("button.life-history")}
                    >
                        <ClockIcon />
                    </Button>
                    <Button
                        outline={true}
                        onClick={immersive.toggle}
                        aria-label={immersive.active ? t("button.exit-fullscreen") : t("button.fullscreen")}
                    >
                        {immersive.active ? <ArrowsPointingInIcon /> : <ArrowsPointingOutIcon />}
                    </Button>
                    <Button
                        outline={true}
                        disabled={readOnly}
                        onClick={() => setConfiguring(true)}
                        aria-label={t("button.settings")}
                    >
                        <AdjustmentsHorizontalIcon />
                        <span className={"max-sm:hidden"}>{t("button.settings")}</span>
                    </Button>
                    <Button
                        outline={true}
                        disabled={readOnly}
                        onClick={() => (game.outcome ? setConfiguring(true) : setResetting(true))}
                        aria-label={t(game.outcome ? "button.next-game" : "button.end-game")}
                    >
                        <ArrowPathIcon />
                        <span className={"max-sm:hidden"}>
                            {t(game.outcome ? "button.next-game" : "button.end-game")}
                        </span>
                    </Button>
                </div>
            </header>

            {context}
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
                        name={game.players[index].name}
                        life={total}
                        delta={table.deltas[index]}
                        damage={table.damage[index]}
                        dealt={table.damage.map((row) => row[index])}
                        opponents={opponentOrder(seating.seats, index)}
                        placement={seating.seats[index]}
                        flush={seating.flush}
                        onChange={(amount) => changeLife(index, amount)}
                        booking={bookingFor(index)}
                        onToggleBooking={() => {
                            if (!readOnly && !game.outcome) toggleBooking(index);
                        }}
                    />
                ))}
            </section>

            <Dialog open={configuring} onClose={() => setConfiguring(false)} size={"sm"}>
                <DialogTitle>{t("heading.settings")}</DialogTitle>
                <DialogBody>
                    <div className={"flex flex-col gap-5"}>
                        {!game.outcome && game.events.length > 1 && <Text>{t("description.next-game-settings")}</Text>}
                        <Field>
                            <Label>{t("label.players")}</Label>
                            <Listbox
                                disabled={Boolean(participants) || (!game.outcome && game.events.length > 1)}
                                value={settings.playerCount}
                                onChange={changePlayerCount}
                            >
                                {PLAYER_COUNTS.map((count) => (
                                    <ListboxOption key={count} value={count}>
                                        <ListboxLabel>{count}</ListboxLabel>
                                    </ListboxOption>
                                ))}
                            </Listbox>
                        </Field>
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
                    </div>
                </DialogBody>
                <DialogActions>
                    <PrimaryButton onClick={start}>{t("button.start")}</PrimaryButton>
                </DialogActions>
            </Dialog>

            <Dialog open={showHistory} onClose={() => setShowHistory(false)} size="lg">
                <DialogTitle>{t("button.life-history")}</DialogTitle>
                <DialogBody>
                    <LifeHistoryView
                        history={history}
                        onCorrect={
                            readOnly
                                ? undefined
                                : (ids) => {
                                      setHistory((current) =>
                                          ids.reduce((changed, id) => correctLifeEvent(changed, id), current),
                                      );
                                      setFeedback({ deltas: {}, hits: {} });
                                  }
                        }
                    />
                </DialogBody>
                <DialogActions>
                    <Button onClick={() => setShowHistory(false)}>{t("button.back-to-life")}</Button>
                </DialogActions>
            </Dialog>
            <Alert open={resetting} onClose={() => setResetting(false)}>
                <AlertTitle>{t("heading.end-game")}</AlertTitle>
                <AlertDescription>{t("description.end-game")}</AlertDescription>
                <Field>
                    <Label>{t("label.game-outcome")}</Label>
                    <Listbox value={outcome} onChange={setOutcome}>
                        <ListboxOption value="draw">
                            <ListboxLabel>{t("label.draw")}</ListboxLabel>
                        </ListboxOption>
                        {game.players.map((player) => (
                            <ListboxOption key={player.id} value={player.id}>
                                <ListboxLabel>{player.name}</ListboxLabel>
                            </ListboxOption>
                        ))}
                    </Listbox>
                </Field>
                <AlertActions>
                    <Button plain={true} onClick={() => setResetting(false)}>
                        {tg("button.cancel")}
                    </Button>
                    <Button color={"red"} onClick={reset}>
                        {t("button.end-game")}
                    </Button>
                </AlertActions>
            </Alert>
        </div>
    );
}
