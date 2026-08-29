/**
 * Drawing pips where a chart would otherwise print a colour's name.
 *
 * Recharts paints into an svg, so an axis tick cannot be an `<img>` — it has to
 * be an svg `<image>` placed at the coordinates recharts hands over. The pips
 * come from Scryfall's svg host, the same origin the artwork does, which they
 * exempt from their rate limits.
 */

/** The gold a multicoloured heap is drawn in, as the charts colour it */
const MULTICOLOR = "#c8a02c";

/**
 * The Scryfall symbol a colour bucket is drawn with
 *
 * The five colours are already spelled the way Scryfall names its symbols. The
 * two heaps beside them are not: "colourless" is Scryfall's `C`, and
 * "multicoloured" is no symbol at all — Scryfall has none for it, so it is
 * drawn here as the gold dot the charts already colour those bars with.
 *
 * @param key the bucket the statistics counted under
 *
 * @returns what to draw, or `undefined` for a bucket that is not a colour
 */
export function colorPip(key: string): string | undefined {
    if (["W", "U", "B", "R", "G", "C"].includes(key)) return key;
    if (key === "colorless") return "C";
    if (key === "multicolor") return MULTICOLOR_PIP;
    return undefined;
}

/** What {@link colorPip} answers for the heap that has no symbol of its own */
export const MULTICOLOR_PIP = "multicolor";

/** Side length of a pip on an axis, in pixels */
export const PIP_SIZE = 18;

/** Gap between the plot and the pip below it */
const PIP_GAP = 4;

/**
 * Height an axis has to reserve to show a pip whole.
 *
 * A text tick fits in recharts' default 30; an image is taller than the line of
 * text it replaces, so an axis that keeps the default clips it.
 */
export const PIP_AXIS_HEIGHT = PIP_SIZE + PIP_GAP * 2 + 4;

/**
 * The properties recharts passes to a custom tick, plus what to draw
 */
export type PipTickProps = {
    /** Horizontal position handed over by recharts */
    x?: number;
    /** Vertical position handed over by recharts */
    y?: number;
    /** Carries the axis value in `payload.value` */
    payload?: { value?: string | number };
    /** Which pip belongs to an axis value, e.g. `"Weiß"` to `"W"` */
    pipOf: (label: string) => string | undefined;
    /** Where the tick sits relative to the plot, which decides how it is centred */
    anchor?: "bottom" | "angle";
};

/**
 * An axis tick showing a pip, falling back to the plain label
 *
 * The label is what the value is called in the reader's language; it stays the
 * accessible name of the pip, and it is what the tooltip shows. Only the
 * drawing changes.
 *
 * @returns the tick
 */
export function PipTick({ x = 0, y = 0, payload, pipOf, anchor = "bottom" }: PipTickProps) {
    const label = String(payload?.value ?? "");
    const pip = pipOf(label);

    if (pip === undefined) {
        return (
            <text x={x} y={y} dy={12} textAnchor={"middle"} fill={"currentColor"} fontSize={12}>
                {label}
            </text>
        );
    }

    // On a polar axis recharts already places the tick outside the shape, so
    // the pip is centred on the point. Below a bar it has to be pushed down
    // clear of the plot instead.
    const top = anchor === "angle" ? y - PIP_SIZE / 2 : y + PIP_GAP;

    // Scryfall serves a symbol for every pip but the multicoloured heap, which
    // is a category rather than a symbol printed on a card. It gets the gold
    // dot the bars beside it already wear.
    if (pip === MULTICOLOR_PIP) {
        return (
            <circle cx={x} cy={top + PIP_SIZE / 2} r={PIP_SIZE / 2} fill={MULTICOLOR} role={"img"} aria-label={label} />
        );
    }

    return (
        <image
            href={`https://svgs.scryfall.io/card-symbols/${encodeURIComponent(pip)}.svg`}
            x={x - PIP_SIZE / 2}
            y={top}
            width={PIP_SIZE}
            height={PIP_SIZE}
            // Read out instead of the picture, so the axis still says "white"
            // to a screen reader and to anyone whose pips failed to load.
            role={"img"}
            aria-label={label}
        />
    );
}
