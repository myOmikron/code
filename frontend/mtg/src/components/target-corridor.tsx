import clsx from "clsx";

/**
 * The properties for {@link TargetCorridor}
 */
export type TargetCorridorProps = {
    /** The floor of the corridor, in cards */
    low: number;
    /** The ceiling of the corridor, in cards */
    high: number;
    /** The top of the track; the corridor cannot be dragged past it */
    scale: number;
    /** What the deck actually has, drawn as the filled bar */
    coverage: number;
    /**
     * The corridor the preset would have used, drawn behind as an outline
     * while it differs from the one in force — absent when nothing was moved.
     */
    preset?: { low: number; high: number };
    /**
     * How the deck's own bar reads against the corridor.
     *
     * Both `inside` and `over` are fine and say so in colour alone, which is
     * what lets the panels drop a line of prose from every row that had
     * nothing to ask for. `missing` is the one that still needs words beside
     * it, because a colour cannot say *how many* cards short.
     */
    tone?: "inside" | "over" | "missing";
    /** Accessible name for the floor handle, only read while there are handles */
    lowLabel?: string;
    /** Accessible name for the ceiling handle, only read while there are handles */
    highLabel?: string;
    /** Reads a handle's value out loud, in cards; only read while there are handles */
    valueText?: (value: number) => string;
    /**
     * Called with the new corridor as a handle moves.
     *
     * Without it no handles are drawn at all: the corridor becomes a
     * statement rather than a control, for targets that are not the
     * builder's to move — greyed-out handles would promise an edit that
     * cannot be given.
     */
    onChange?: (corridor: { low: number; high: number }) => void;
};

/**
 * The thumb, shared by both handles.
 *
 * Every part of the native control is painted out except the thumb, and that
 * is load-bearing rather than tidy: `appearance-none` on the input does *not*
 * silence `::-webkit-slider-runnable-track`, which keeps drawing its own grey
 * bar — and with two inputs stacked over the meter, those two bars covered the
 * corridor and the coverage fill completely. The panel looked like a column of
 * empty grey tracks.
 *
 * `pointer-events-none` on the input with `pointer-events-auto` on the thumb
 * is what lets the two ranges overlap: only the handles take the pointer, so
 * the lower one is still reachable where the upper one covers it. Both inputs
 * stay in the tab order and keep their native keyboard stepping.
 */
const THUMB = [
    "pointer-events-none absolute inset-x-0 top-1/2 h-6 w-full -translate-y-1/2 appearance-none",
    "bg-transparent accent-transparent focus-visible:outline-none",
    // The track, painted out on every engine.
    "[&::-webkit-slider-runnable-track]:h-0 [&::-webkit-slider-runnable-track]:appearance-none",
    "[&::-webkit-slider-runnable-track]:border-none [&::-webkit-slider-runnable-track]:bg-transparent",
    "[&::-moz-range-track]:h-0 [&::-moz-range-track]:border-none [&::-moz-range-track]:bg-transparent",
    "[&::-moz-range-progress]:h-0 [&::-moz-range-progress]:bg-transparent",
    // The thumb, which is the only thing left to see.
    "[&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:size-4",
    "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full",
    "[&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white",
    "[&::-webkit-slider-thumb]:bg-(--color-accent) [&::-webkit-slider-thumb]:shadow-(--shadow-card-md)",
    "[&::-webkit-slider-thumb]:transition-transform hover:[&::-webkit-slider-thumb]:scale-110",
    "active:[&::-webkit-slider-thumb]:scale-110 dark:[&::-webkit-slider-thumb]:border-zinc-900",
    "[&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:size-4",
    "[&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full",
    "[&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white",
    "[&::-moz-range-thumb]:bg-(--color-accent) dark:[&::-moz-range-thumb]:border-zinc-900",
    "focus-visible:[&::-webkit-slider-thumb]:ring-2 focus-visible:[&::-webkit-slider-thumb]:ring-(--color-accent)/60",
    "focus-visible:[&::-webkit-slider-thumb]:ring-offset-2",
    "focus-visible:[&::-moz-range-thumb]:ring-2 focus-visible:[&::-moz-range-thumb]:ring-(--color-accent)/60",
].join(" ");

/**
 * A target range with two handles, over a meter of what the deck has.
 *
 * The corridor is the *editable* thing and the coverage bar is the fact
 * underneath it, which is the whole point of the control: the advisor's
 * quotas are defaults, and a deck that runs eighteen pieces of interaction on
 * purpose should be able to say so rather than wear an amber badge forever.
 *
 * Two overlaid native ranges rather than a hand-rolled drag: they arrive with
 * keyboard stepping, touch targets and screen-reader semantics that a `div`
 * with pointer handlers would have to reimplement and would get subtly wrong.
 * The handles are clamped against each other on the way out, so a floor can
 * be pushed up to the ceiling and no further.
 *
 * @returns the control
 */
export function TargetCorridor({
    low,
    high,
    scale,
    coverage,
    preset,
    tone = "inside",
    lowLabel,
    highLabel,
    valueText,
    onChange,
}: TargetCorridorProps) {
    const percent = (value: number) => `${Math.min(100, Math.max(0, (value / scale) * 100))}%`;

    return (
        <div className={"relative h-6 w-full touch-none"}>
            {/* The track, and inside it the deck as it stands. Drawn thin and
                low-contrast against the corridor above it: the number the user
                can move belongs in front of the number they cannot. */}
            <div
                className={
                    "absolute inset-x-0 top-1/2 h-2.5 -translate-y-1/2 overflow-hidden rounded-full bg-zinc-950/5 dark:bg-white/10"
                }
            >
                <div
                    className={clsx(
                        "absolute inset-y-0 left-0 rounded-full transition-[width,background-color] duration-300 ease-out",
                        // Full strength for a deck inside its corridor, the
                        // same green faded for one that chose to run past it,
                        // amber for one that is missing it.
                        tone === "missing"
                            ? "bg-(--color-warning)"
                            : tone === "over"
                              ? "bg-(--color-success)/50"
                              : "bg-(--color-success)",
                    )}
                    style={{ width: percent(coverage) }}
                />
            </div>

            {/* What the bracket would have asked for, once the user has moved
                away from it — so the preset is never lost behind the edit. */}
            {preset !== undefined && (
                <div
                    className={
                        "absolute top-1/2 h-5 -translate-y-1/2 rounded-full border border-dashed border-zinc-950/25 dark:border-white/25"
                    }
                    style={{
                        left: percent(preset.low),
                        width: `calc(${percent(preset.high)} - ${percent(preset.low)})`,
                    }}
                    aria-hidden={"true"}
                />
            )}

            {/* The corridor in force. */}
            <div
                className={
                    "absolute top-1/2 h-5 -translate-y-1/2 rounded-full bg-(--color-accent)/10 ring-1 ring-(--color-accent)/35"
                }
                style={{ left: percent(low), width: `calc(${percent(high)} - ${percent(low)})` }}
                aria-hidden={"true"}
            />

            {onChange !== undefined && (
                <>
                    <input
                        type={"range"}
                        className={THUMB}
                        min={0}
                        max={scale}
                        step={1}
                        value={low}
                        aria-label={lowLabel}
                        aria-valuetext={valueText?.(low)}
                        onChange={(event) => onChange({ low: Math.min(Number(event.target.value), high), high })}
                    />
                    <input
                        type={"range"}
                        className={THUMB}
                        min={0}
                        max={scale}
                        step={1}
                        value={high}
                        aria-label={highLabel}
                        aria-valuetext={valueText?.(high)}
                        onChange={(event) => onChange({ low, high: Math.max(Number(event.target.value), low) })}
                    />
                </>
            )}
        </div>
    );
}
