import clsx from "clsx";
import type { ButtonHTMLAttributes } from "react";

/** How a button on the table stands out */
const TONES = {
    lime: "bg-lime-400 font-bold text-zinc-950 hover:bg-lime-300",
    outline: "font-semibold text-white ring-1 ring-white/40 hover:bg-white/10",
};

/**
 * A pill over a tile of the life counter, sized by the caller to the tile
 *
 * @returns the button
 */
export function TableButton({
    tone,
    className,
    ...props
}: { tone: keyof typeof TONES } & ButtonHTMLAttributes<HTMLButtonElement>) {
    return (
        <button
            type={"button"}
            {...props}
            className={clsx("rounded-(--radius-pill) transition", TONES[tone], className)}
        />
    );
}
