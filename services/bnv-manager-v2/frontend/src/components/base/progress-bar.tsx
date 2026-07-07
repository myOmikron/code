import React from "react";
import { AnimatePresence, motion } from "framer-motion";

/**
 * The properties for {@link ProgressBar}
 */
export type ProgressBarProps = {
    /** The progress between 0 and 100 */
    progress: number;
};

/**
 * A horizontal progressbar
 */
export default function ProgressBar(props: ProgressBarProps) {
    const { progress } = props;

    return (
        <div className={"flex h-1 w-full justify-start rounded-lg border dark:border-zinc-700"}>
            <AnimatePresence>
                <motion.div
                    className={"progress-shadow h-full rounded-lg bg-white shadow-blue-700 dark:shadow-blue-400"}
                    initial={{ width: 0 }}
                    animate={{ width: `${10 + progress * 0.9}%` }}
                />
            </AnimatePresence>
        </div>
    );
}
