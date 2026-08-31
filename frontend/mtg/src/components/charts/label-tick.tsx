/**
 * An axis tick that reports which label the pointer is over.
 *
 * The chart has no floating tooltip for axis labels — there is no generic
 * tooltip component in this app — so a caller uses this to swap an
 * explanation slot that is already on screen instead. Positioning stays
 * recharts' own; this only adds the hover/tap wiring.
 */

/**
 * The vertical baseline offset recharts' own `Text` uses per anchor, for a
 * single line.
 *
 * Reproduced rather than imported — recharts does not export it — so that
 * swapping the axis' default tick for this one moves no label: a polar axis
 * hands every tick its anchors, and rendering them the same way is what
 * keeps the hover affordance invisible until it is used.
 */
const BASELINE = { start: "0.71em", middle: "0.355em", end: "0" } as const;

/**
 * The properties recharts passes to a custom tick, plus the hover callback
 */
export type LabelTickProps = {
    /** Horizontal position handed over by recharts */
    x?: number;
    /** Vertical position handed over by recharts */
    y?: number;
    /** Which side of the point the text hangs off, handed over by recharts */
    textAnchor?: "start" | "middle" | "end";
    /** Where the text sits vertically to the point, handed over by recharts */
    verticalAnchor?: "start" | "middle" | "end";
    /** Carries the axis value in `payload.value` */
    payload?: { value?: string | number };
    /** The size the label is drawn at, matching recharts' own default */
    size?: number;
    /** Called with the label under the pointer, or `null` once it isn't */
    onHover: (label: string | null) => void;
};

/**
 * An axis tick, rendered where and how recharts' default would render it,
 * with hover and tap reporting the label to the caller.
 *
 * The click handler exists for touch, which has no hover to leave — the
 * caller decides what a second tap on the same label does.
 *
 * @returns the tick
 */
export function LabelTick({
    x = 0,
    y = 0,
    textAnchor = "middle",
    verticalAnchor = "end",
    payload,
    size = 12,
    onHover,
}: LabelTickProps) {
    const label = String(payload?.value ?? "");

    return (
        <text
            x={x}
            y={y}
            dy={BASELINE[verticalAnchor]}
            textAnchor={textAnchor}
            fill={"currentColor"}
            fontSize={size}
            className={"cursor-help"}
            onMouseEnter={() => onHover(label)}
            onMouseLeave={() => onHover(null)}
            onClick={() => onHover(label)}
        >
            {label}
        </text>
    );
}
