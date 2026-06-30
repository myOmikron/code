import { AnimatePresence, motion } from "motion/react";

/**
 * The properties for {@link ProgressBar}
 */
export type ProgressBarProps = {
    /** The progress between 0 and 100 */
    progress: number;
    /**
     * Minimum visual width in percentage points added to the filled bar so a
     * sliver is always visible even at low progress values. Defaults to `0`.
     * The rendered width is clamped to 100%.
     *
     * @example
     * // Always show at least a 10% sliver, scale the rest across the remaining 90%
     * <ProgressBar progress={progress} offset={10} />
     */
    offset?: number;
};

/**
 * A horizontal progressbar
 */
export default function ProgressBar(props: ProgressBarProps) {
    const { progress, offset = 0 } = props;
    const width = Math.min(offset + progress * ((100 - offset) / 100), 100);

    return (
        <div className={"flex h-1 w-full justify-start overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700"}>
            <AnimatePresence>
                <motion.div
                    className={"h-full rounded-full bg-(--color-brand-600)"}
                    initial={{ width: 0 }}
                    animate={{ width: `${width}%` }}
                />
            </AnimatePresence>
        </div>
    );
}
