import clsx from "clsx";

/**
 * The properties for {@link RadarGlyph}
 */
export type RadarGlyphProps = {
    /** One value per axis, 0 to 1, in an order the caller keeps stable */
    values: Array<number>;
    /** What the shape says, for anyone who cannot see it */
    label: string;
    /** How wide the glyph is drawn, in pixels */
    size?: number;
    /** Classes for the wrapper — colour comes from here */
    className?: string;
};

/** Where the first axis points: straight up, so a shape is compared the same way twice */
const START = -Math.PI / 2;

/**
 * A suggestion's profile at thumbnail size, drawn as one small polygon.
 *
 * Hand-drawn rather than charted, and that is a decision about weight, not
 * about taste: this appears once per suggested card — forty-five of them on a
 * full page — and a charting library's container, tooltip and resize observer
 * per tile would cost more than the rest of the page put together. Everything
 * a glyph this size can carry is a silhouette, which is exactly what the
 * question "one channel shouting, or several agreeing?" needs.
 *
 * No labels, no numbers: at 56 pixels they would be unreadable, and the full
 * chart with its axes and points is one click away on the card itself. The
 * accessible name carries the reading for anyone not looking at the shape.
 *
 * @returns the glyph
 */
export function RadarGlyph({ values, label, size = 56, className }: RadarGlyphProps) {
    const axes = values.length;
    if (axes < 3) return null;

    const centre = size / 2;
    // Room for the stroke, so a full-radius vertex is not clipped by the box.
    const radius = centre - 2;

    const point = (index: number, magnitude: number) => {
        const angle = START + (index / axes) * Math.PI * 2;
        const reach = radius * Math.min(1, Math.max(0, magnitude));
        return `${(centre + Math.cos(angle) * reach).toFixed(2)},${(centre + Math.sin(angle) * reach).toFixed(2)}`;
    };

    const ring = (magnitude: number) => Array.from({ length: axes }, (_, index) => point(index, magnitude)).join(" ");
    const shape = values.map((value, index) => point(index, value)).join(" ");

    return (
        <svg
            viewBox={`0 0 ${size} ${size}`}
            width={size}
            height={size}
            role={"img"}
            aria-label={label}
            className={clsx("shrink-0 text-zinc-300 dark:text-zinc-600", className)}
        >
            {/* Two rings, not a full web: the outer one is the frame the shape
                is read against, the inner one gives it a sense of scale. */}
            <polygon points={ring(1)} fill={"none"} stroke={"currentColor"} strokeWidth={1} />
            <polygon points={ring(0.5)} fill={"none"} stroke={"currentColor"} strokeWidth={0.5} opacity={0.6} />
            <polygon
                points={shape}
                fill={"var(--color-accent)"}
                fillOpacity={0.3}
                stroke={"var(--color-accent)"}
                strokeWidth={1.5}
                strokeLinejoin={"round"}
            />
        </svg>
    );
}
