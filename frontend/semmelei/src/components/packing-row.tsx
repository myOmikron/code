import { CheckIcon } from "@heroicons/react/24/solid";
import React from "react";
import { FullOrderPosition } from "src/api/generated";
import { formatPrice } from "src/utils/price";

/**
 * The properties for {@link PackingRow}
 */
export type PackingRowProps = {
    /** The order position to render */
    position: FullOrderPosition;
    /** Whether the row can still be toggled */
    disabled: boolean;
    /** Toggle the packed state */
    onToggle: (packed: boolean) => void;
};

/**
 * A large, full-row tappable packing-list entry.
 *
 * Designed for touch use by non-technical staff: the whole row toggles,
 * with a big check indicator and large type. A packed row is clearly
 * marked (green, checkmark, struck through).
 *
 * @param props {@link PackingRowProps}
 *
 * @returns the row
 */
export function PackingRow(props: PackingRowProps) {
    const { position, disabled, onToggle } = props;
    return (
        <button
            type={"button"}
            disabled={disabled}
            onClick={() => onToggle(!position.packed)}
            className={[
                "flex w-full items-center gap-4 rounded-[var(--radius-card)] border p-4 text-left transition-colors",
                position.packed
                    ? "border-green-600/30 bg-green-50 dark:border-green-500/30 dark:bg-green-500/10"
                    : "border-zinc-950/10 bg-[var(--surface-card)] dark:border-white/10",
                disabled ? "opacity-60" : "cursor-pointer active:scale-[0.99]",
            ].join(" ")}
        >
            <span
                className={[
                    "flex size-9 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                    position.packed
                        ? "border-green-600 bg-green-600 text-white dark:border-green-500 dark:bg-green-500"
                        : "border-zinc-300 dark:border-zinc-600",
                ].join(" ")}
            >
                {position.packed && <CheckIcon className={"size-6"} />}
            </span>
            <span
                className={[
                    "flex-1 text-lg font-medium",
                    position.packed
                        ? "text-green-800 line-through dark:text-green-300"
                        : "text-zinc-950 dark:text-white",
                ].join(" ")}
            >
                {position.quantity} × {position.name}
            </span>
            <span
                className={[
                    "shrink-0 text-base",
                    position.packed ? "text-green-800/70 dark:text-green-300/70" : "text-zinc-500 dark:text-zinc-400",
                ].join(" ")}
            >
                {formatPrice(position.price_cents * position.quantity)}
            </span>
        </button>
    );
}
