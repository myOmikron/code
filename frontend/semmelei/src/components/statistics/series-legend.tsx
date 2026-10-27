import React from "react";
import { Text } from "components";

/** One entry of a {@link SeriesLegend} */
export type LegendEntry = {
    /** The label */
    name: string;
    /** The colour */
    color: string;
    /** Drawn as a line rather than a bar */
    line?: boolean;
};

/** The properties of {@link SeriesLegend} */
export type SeriesLegendProps = {
    /** The entries */
    entries: LegendEntry[];
    /** A note below the entries */
    note?: string;
};

/**
 * Legend below a statistics chart
 *
 * @returns the legend
 */
export function SeriesLegend(props: SeriesLegendProps) {
    return (
        <div className={"flex flex-col gap-2"}>
            <ul className={"flex flex-wrap gap-x-4 gap-y-1"}>
                {props.entries.map((entry) => (
                    <li key={entry.name} className={"flex items-center gap-1.5"}>
                        {entry.line ? (
                            <span className={"h-0.5 w-3 shrink-0"} style={{ backgroundColor: entry.color }} />
                        ) : (
                            <span className={"size-2.5 shrink-0 rounded-sm"} style={{ backgroundColor: entry.color }} />
                        )}
                        <span className={"text-xs text-zinc-600 dark:text-zinc-300"}>{entry.name}</span>
                    </li>
                ))}
            </ul>
            {props.note !== undefined && <Text className={"text-xs/5!"}>{props.note}</Text>}
        </div>
    );
}
