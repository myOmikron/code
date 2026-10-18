import { Badge } from "components";
import { useTranslation } from "react-i18next";
import { SyncRunOutcome } from "src/api/generated";

/**
 * The properties for {@link AdminSyncOutcomeBadge}
 */
export type AdminSyncOutcomeBadgeProps = {
    /** What the Sync run came to */
    outcome: SyncRunOutcome;
};

/**
 * What a Sync run came to as a badge, failures stand out
 *
 * @returns the badge
 */
export function AdminSyncOutcomeBadge({ outcome }: AdminSyncOutcomeBadgeProps) {
    const [t] = useTranslation("admin");
    switch (outcome) {
        case SyncRunOutcome.Synced:
            return <Badge color={"green"}>{t("label.outcome-synced")}</Badge>;
        case SyncRunOutcome.Unchanged:
            return <Badge color={"zinc"}>{t("label.outcome-unchanged")}</Badge>;
        case SyncRunOutcome.Failed:
            return <Badge color={"red"}>{t("label.outcome-failed")}</Badge>;
    }
}
