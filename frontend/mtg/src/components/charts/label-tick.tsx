/**
 * An axis tick that reports which label the pointer is over.
 *
 * The chart has no floating tooltip for axis labels — there is no generic
 * tooltip component in this app — so a caller uses this to swap an
 * explanation slot that is already on screen instead. Positioning stays
 * recharts' own; this only adds the hover/tap wiring.
 */

/**
 * The properties recharts passes to a custom tick, plus the hover callback
 */
export type LabelTickProps = {
    /** Horizontal position handed over by recharts */
    x?: number;
    /** Vertical position handed over by recharts */
    y?: number;
    /** Carries the axis value in `payload.value` */
    payload?: { value?: string | number };
    /** Called with the label under the pointer, or `null` once it isn't */
    onHover: (label: string | null) => void;
};

/**
 * An axis tick, styled exactly like `PipTick`'s plain-text fallback, with
 * hover and tap reporting the label to the caller.
 *
 * The click handler exists for touch, which has no hover to leave — the
 * caller decides what a second tap on the same label does.
 *
 * @returns the tick
 */
export function LabelTick({ x = 0, y = 0, payload, onHover }: LabelTickProps) {
    const label = String(payload?.value ?? "");

    return (
        <text
            x={x}
            y={y}
            dy={12}
            textAnchor={"middle"}
            fill={"currentColor"}
            fontSize={12}
            className={"cursor-help"}
            onMouseEnter={() => onHover(label)}
            onMouseLeave={() => onHover(null)}
            onClick={() => onHover(label)}
        >
            {label}
        </text>
    );
}
