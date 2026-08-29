import clsx from "clsx";
import { ManaCost } from "src/components/mana-cost";
import { MULTICOLOR_PIP, colorPip } from "src/components/charts/pip-tick";

/**
 * The properties for {@link ColorPip}
 */
export type ColorPipProps = {
    /** The bucket the statistics counted under, e.g. `W` or `multicolor` */
    bucket: string;
    /** What the bucket is called, which stays the accessible name */
    label: string;
    /** How big the symbol is drawn, as a tailwind size class */
    size?: string;
};

/**
 * The symbol a colour bucket is drawn with, outside of an svg.
 *
 * The five colours and the colourless heap are Scryfall symbols and come
 * through {@link ManaCost}. Multicoloured is not a symbol Wizards prints, so it
 * is the gold dot the bars beside it wear — the same answer {@link PipTick}
 * gives inside a chart.
 *
 * A bucket that names no colour at all falls back to its label, which is what a
 * legend would have shown anyway.
 *
 * @returns the symbol
 */
export function ColorPip({ bucket, label, size = "size-3" }: ColorPipProps) {
    const pip = colorPip(bucket);

    if (pip === MULTICOLOR_PIP) {
        return (
            <span
                role={"img"}
                aria-label={label}
                title={label}
                className={clsx("inline-block rounded-full bg-[#c8a02c] ring-1 ring-black/10", size)}
            />
        );
    }

    if (pip === undefined) return <span>{label}</span>;

    return <ManaCost value={`{${pip}}`} symbolClassName={size} />;
}
