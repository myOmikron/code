import { Badge } from "components";
import { SyncRunOutcome } from "src/api/generated";
import { useSyncOutcomeLabel } from "src/components/sync-outcome-labels";

/**
 * The properties for {@link AdminSyncOutcomeBadge}
 */
export type AdminSyncOutcomeBadgeProps = {
    /** What the Sync run came to */
    outcome: SyncRunOutcome;
};

const COLORS = {
    [SyncRunOutcome.Synced]: "green",
    [SyncRunOutcome.Unchanged]: "zinc",
    [SyncRunOutcome.Failed]: "red",
} as const;

/**
 * What a Sync run came to as a badge, failures stand out
 *
 * @returns the badge
 */
export function AdminSyncOutcomeBadge({ outcome }: AdminSyncOutcomeBadgeProps) {
    const label = useSyncOutcomeLabel();
    return <Badge color={COLORS[outcome]}>{label(outcome)}</Badge>;
}
