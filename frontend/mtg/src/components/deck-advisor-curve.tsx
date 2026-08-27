import { ArrowUturnLeftIcon } from "@heroicons/react/16/solid";
import clsx from "clsx";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CurveBucket } from "src/api/graph-generated";
import { QuietButton } from "src/components/quiet-button";

/**
 * The properties for {@link DeckAdvisorCurve}
 */
export type DeckAdvisorCurveProps = {
    /** The curve as the advisor reports it, counts and targets per mana value */
    curve: Array<CurveBucket>;
    /** The target counts in force, or null while the bracket's own shape stands */
    targets: Array<number> | null;
    /** How many non-land cards the deck holds — the slots the shape divides up */
    spells: number;
    /** Sets the whole shape, in cards per mana value */
    onSet: (counts: Array<number>) => void;
    /** Puts the shape back on the bracket's */
    onReset: () => void;
};

/** The shortest scale the chart uses, so a nearly-empty deck is not all spikes */
const MIN_SCALE = 8;

/**
 * The deck's mana curve against a target curve the builder can move.
 *
 * Drawn rather than charted, because the target is the interactive part: each
 * mana value carries a handle that drags, arrows and pages like any other
 * slider, and what it sets is graded — the shape rides every diagnostics,
 * swap and fill request the advisor makes.
 *
 * The targets are a *shape over the deck's non-land slots*, not seven
 * independent numbers: sixty-six slots stay sixty-six however they are
 * arranged, so raising one column lowers the others a little. Said in the
 * footer rather than left for the reader to discover, and it is the same
 * arithmetic the service does, so the picture never disagrees with the advice.
 *
 * @returns the chart
 */
export function DeckAdvisorCurve({ curve, targets, spells, onSet, onReset }: DeckAdvisorCurveProps) {
    const [t] = useTranslation("advisor");
    const [drag, setDrag] = useState<{ mv: number; value: number } | null>(null);
    // Frozen for the length of a gesture: a scale that grew as a handle was
    // pushed up would move the track under the pointer and the handle would
    // never reach the top.
    const held = useRef<number | null>(null);

    const last = curve.length - 1;
    const target = (index: number) => targets?.[index] ?? curve[index].target;
    const shown = (index: number) => (drag?.mv === index ? drag.value : target(index));
    const custom = targets !== null;

    const loose = Math.max(
        MIN_SCALE,
        ...curve.map((bucket) => bucket.count),
        ...curve.map((bucket, index) => Math.max(target(index), bucket.default_target ?? bucket.target)),
    );
    const scale = held.current ?? Math.ceil(loose * 1.15);

    /**
     * Reads a pointer position as a card count for one column
     *
     * @param event the pointer event
     * @param element the column's track, which the value is measured against
     *
     * @returns the count under the pointer, held inside the chart
     */
    function valueAt(event: React.PointerEvent, element: HTMLElement): number {
        const box = element.getBoundingClientRect();
        const share = (box.bottom - event.clientY) / box.height;
        return Math.max(0, Math.min(scale, Math.round(share * scale)));
    }

    /**
     * Writes one column's new count into the whole shape.
     *
     * The other columns give up exactly what this one took, in proportion to
     * what they had. Without that they would each shrink a little on the way
     * back through the normalisation — including the column that was just
     * dragged, which would settle a card or two below where it was let go and
     * read as a control that does not hold.
     *
     * @param mv the mana value that moved
     * @param value its new target count
     */
    function commit(mv: number, value: number) {
        const rest = curve.reduce((sum, _, index) => (index === mv ? sum : sum + target(index)), 0);
        const room = Math.max(0, spells - value);
        onSet(
            curve.map((_, index) => {
                if (index === mv) return value;
                // A shape with nothing left in it splits the remainder evenly
                // rather than dividing by zero and losing the curve entirely.
                return rest > 0 ? target(index) * (room / rest) : room / (curve.length - 1);
            }),
        );
    }

    /**
     * Steps one column by the keyboard
     *
     * @param event the key event
     * @param mv the mana value the handle belongs to
     */
    function step(event: React.KeyboardEvent, mv: number) {
        const by = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: 3, PageDown: -3 }[event.key];
        const to = event.key === "Home" ? 0 : event.key === "End" ? scale : undefined;
        if (by === undefined && to === undefined) return;
        event.preventDefault();
        commit(mv, Math.max(0, Math.min(scale, to ?? Math.round(target(mv)) + (by ?? 0))));
    }

    return (
        <div className={"flex flex-col"}>
            <div className={"flex h-40 max-h-[45dvh] items-end gap-1 sm:h-52 sm:gap-2"}>
                {curve.map((bucket, index) => {
                    const value = shown(index);
                    const preset = bucket.default_target ?? bucket.target;
                    const short = bucket.count + 0.5 < value;
                    return (
                        <div key={bucket.mv} className={"relative h-full flex-1"}>
                            <div
                                className={
                                    "absolute inset-0 rounded-(--radius-control) bg-zinc-950/[0.03] dark:bg-white/[0.04]"
                                }
                            />
                            {/* What the deck holds. Amber only where the deck is
                                under the target the builder set — a column over
                                its target is a choice, not a fault. */}
                            <div
                                className={clsx(
                                    "absolute inset-x-0 bottom-0 rounded-t-(--radius-control) transition-[height] duration-300 ease-out",
                                    short ? "bg-(--color-warning)/70" : "bg-(--color-accent)",
                                )}
                                style={{ height: `${Math.min(100, (bucket.count / scale) * 100)}%` }}
                            />
                            <span
                                className={
                                    "absolute inset-x-0 -top-0.5 text-center text-[11px]/4 font-medium text-zinc-500 tabular-nums dark:text-zinc-400"
                                }
                            >
                                {bucket.count}
                            </span>
                            {/* The bracket's own target, kept in view once the
                                builder has moved away from it. */}
                            {custom && Math.abs(preset - value) > 0.5 && (
                                <div
                                    className={
                                        "absolute inset-x-0 border-t border-dashed border-zinc-950/30 dark:border-white/30"
                                    }
                                    style={{ bottom: `${Math.min(100, (preset / scale) * 100)}%` }}
                                    aria-hidden={"true"}
                                />
                            )}
                            <div
                                role={"slider"}
                                tabIndex={0}
                                aria-label={t("accessibility.curve-target", {
                                    mv: index === last ? `${bucket.mv}+` : bucket.mv,
                                })}
                                aria-valuemin={0}
                                aria-valuemax={scale}
                                aria-valuenow={Math.round(value)}
                                aria-valuetext={t("label.quota-cards", { count: Math.round(value) })}
                                onKeyDown={(event) => step(event, index)}
                                onPointerDown={(event) => {
                                    const column = event.currentTarget.parentElement;
                                    if (column === null) return;
                                    held.current = scale;
                                    event.currentTarget.setPointerCapture(event.pointerId);
                                    setDrag({ mv: index, value: valueAt(event, column) });
                                }}
                                onPointerMove={(event) => {
                                    const column = event.currentTarget.parentElement;
                                    if (drag?.mv !== index || column === null) return;
                                    setDrag({ mv: index, value: valueAt(event, column) });
                                }}
                                onPointerUp={() => {
                                    if (drag?.mv === index) commit(index, drag.value);
                                    held.current = null;
                                    setDrag(null);
                                }}
                                onPointerCancel={() => {
                                    held.current = null;
                                    setDrag(null);
                                }}
                                className={
                                    "group absolute inset-x-0 flex h-6 translate-y-1/2 cursor-ns-resize touch-none items-center justify-center focus-visible:outline-none"
                                }
                                style={{ bottom: `${Math.min(100, (value / scale) * 100)}%` }}
                            >
                                <span
                                    className={clsx(
                                        "h-1 w-full rounded-full bg-zinc-950/70 transition group-hover:h-1.5 dark:bg-white/70",
                                        "group-focus-visible:h-1.5 group-focus-visible:bg-(--color-accent)",
                                        drag?.mv === index && "h-1.5 bg-(--color-accent)",
                                    )}
                                />
                                <span
                                    className={clsx(
                                        "absolute -top-5 rounded-(--radius-pill) bg-zinc-950 px-1.5 py-0.5 text-[11px]/4 font-medium text-white tabular-nums transition-opacity dark:bg-white dark:text-zinc-950",
                                        drag?.mv === index
                                            ? "opacity-100"
                                            : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100",
                                    )}
                                >
                                    {Math.round(value)}
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>
            <div className={"mt-2 flex gap-1 sm:gap-2"}>
                {curve.map((bucket, index) => (
                    <span
                        key={bucket.mv}
                        className={"flex-1 text-center text-xs/5 text-zinc-500 tabular-nums dark:text-zinc-400"}
                    >
                        {index === last ? `${bucket.mv}+` : bucket.mv}
                    </span>
                ))}
            </div>
            <div className={"mt-3 flex flex-wrap items-center justify-between gap-2"}>
                <p className={"text-xs/5 text-zinc-500 dark:text-zinc-400"}>{t("description.curve-shape")}</p>
                {custom && (
                    <QuietButton onClick={onReset}>
                        <ArrowUturnLeftIcon className={"size-3.5"} />
                        {t("button.reset-curve")}
                    </QuietButton>
                )}
            </div>
        </div>
    );
}
