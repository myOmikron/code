import { WatchListEntryCard } from "src/components/watch-list-entry-card";
import type { WatchViewProps } from "src/components/watch-view";

/**
 * One card per row, with everything about it in reach.
 *
 * The view for standing in front of a shelf: the meter, the two badges and the
 * stacks underneath all belong to one card at a time, and none of them survive
 * being squeezed into a column.
 *
 * @returns the list
 */
export function WatchViewCards({
    entries,
    onEdit,
    onAcknowledge,
    onMatch,
    onToggleCopies,
    unfolded,
    copies,
    busy,
}: WatchViewProps) {
    return (
        <ul className={"flex flex-col gap-3"}>
            {entries.map((entry) => (
                <WatchListEntryCard
                    key={entry.uuid}
                    entry={entry}
                    busy={busy === entry.uuid}
                    open={unfolded === entry.uuid}
                    copies={copies[entry.uuid] ?? null}
                    onEdit={onEdit}
                    onAcknowledge={onAcknowledge}
                    onMatch={onMatch}
                    onToggleCopies={onToggleCopies}
                />
            ))}
        </ul>
    );
}
