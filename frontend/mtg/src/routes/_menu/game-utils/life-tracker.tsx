import { AdjustmentsHorizontalIcon, ArrowLeftIcon, ArrowPathIcon } from "@heroicons/react/20/solid";
import { createFileRoute } from "@tanstack/react-router";
import clsx from "clsx";
import {
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
import { LifeTile } from "src/components/life-tile";
import type { LifeTrackerSettings } from "src/utils/life-tracker";
import { useWakeLock } from "src/utils/use-wake-lock";
import {
    CROSS_PLAYER_COUNT,
    PLAYER_COUNTS,
    STARTING_LIFE_RANGE,
    STARTING_LIFE_TOTALS,
    emptyCommanderDamage,
    isStartingLife,
    loadLifeTrackerSettings,
    resizeCommanderDamage,
    saveLifeTrackerSettings,
    seatingFor,
} from "src/utils/life-tracker";

/** How long a run of taps stays readable after the last one */
const DELTA_LINGER = 3000;

/** Everything the pod has counted, kept together so one tap settles it at once */
type Table = {
    /** Everyone's total, in seat order */
    life: Array<number>;
    /** What every seat's commander has put on every player */
    damage: Array<Array<number>>;
    /** What the last run of taps came to, per player */
    deltas: Record<number, number>;
};

export const Route = createFileRoute("/_menu/game-utils/life-tracker")({
    component: RouteComponent,
});

/**
 * Everyone's life total on one screen, each tile turned towards its seat.
 *
 * @returns the life tracker
 */
function RouteComponent() {
    const [t] = useTranslation("game-utils");
    const [settings, setSettings] = useState(loadLifeTrackerSettings);
    const [table, setTable] = useState<Table>(() => ({
        life: Array<number>(settings.playerCount).fill(settings.startingLife),
        damage: emptyCommanderDamage(settings.playerCount),
        deltas: {},
    }));
    const [typedLife, setTypedLife] = useState(() => String(settings.startingLife));
    const [configuring, setConfiguring] = useState(true);
    const timers = useRef(new Map<number, number>());

    useEffect(() => () => timers.current.forEach((timer) => window.clearTimeout(timer)), []);
    useWakeLock(settings.keepAwake);

    const seating = seatingFor(settings.playerCount, settings.arrangement);

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
        setTable((current) => ({
            life: Array.from({ length: playerCount }, (_, index) => current.life[index] ?? settings.startingLife),
            damage: resizeCommanderDamage(current.damage, playerCount),
            deltas: {},
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
        setTable((current) => ({
            ...current,
            life: current.life.map((total, player) => (player === index ? total + amount : total)),
            deltas: { ...current.deltas, [index]: (current.deltas[index] ?? 0) + amount },
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
            };
        });
        fadeDelta(index);
    }

    /** Puts everyone back on the starting total for a fresh game */
    function reset() {
        timers.current.forEach((timer) => window.clearTimeout(timer));
        timers.current.clear();
        setTable((current) => ({
            life: current.life.map(() => settings.startingLife),
            damage: emptyCommanderDamage(current.life.length),
            deltas: {},
        }));
    }

    return (
        <div className={"flex h-[calc(100svh-7rem)] min-h-0 flex-col gap-2 overflow-hidden sm:h-[calc(100svh-8rem)]"}>
            <header className={"flex shrink-0 items-center justify-between gap-2"}>
                <div className={"flex min-w-0 items-center gap-2"}>
                    <Button plain={true} href={"/game-utils"} aria-label={t("button.back-to-tools")}>
                        <ArrowLeftIcon />
                    </Button>
                    <Heading className={"truncate"}>{t("heading.life-counter")}</Heading>
                </div>
                <div className={"flex shrink-0 items-center gap-2"}>
                    <Button outline={true} onClick={() => setConfiguring(true)} aria-label={t("button.settings")}>
                        <AdjustmentsHorizontalIcon />
                        <span className={"max-sm:hidden"}>{t("button.settings")}</span>
                    </Button>
                    <Button outline={true} onClick={reset} aria-label={t("button.reset")}>
                        <ArrowPathIcon />
                        <span className={"max-sm:hidden"}>{t("button.reset")}</span>
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
                        life={total}
                        delta={table.deltas[index]}
                        damage={table.damage[index]}
                        placement={seating.seats[index]}
                        flush={seating.flush}
                        onChange={(amount) => changeLife(index, amount)}
                        onDamage={(opponent, amount) => changeDamage(index, opponent, amount)}
                    />
                ))}
            </section>

            <Dialog open={configuring} onClose={() => setConfiguring(false)} size={"sm"}>
                <DialogTitle>{t("heading.settings")}</DialogTitle>
                <DialogBody>
                    <div className={"flex flex-col gap-5"}>
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
                        <SwitchField>
                            <Label>{t("label.keep-awake")}</Label>
                            <Description>{t("description.keep-awake")}</Description>
                            <Switch checked={settings.keepAwake} onChange={(keepAwake) => change({ keepAwake })} />
                        </SwitchField>
                    </div>
                </DialogBody>
                <DialogActions>
                    <PrimaryButton onClick={() => setConfiguring(false)}>{t("button.start")}</PrimaryButton>
                </DialogActions>
            </Dialog>
        </div>
    );
}
