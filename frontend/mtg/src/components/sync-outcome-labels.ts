import { useTranslation } from "react-i18next";
import { SyncRunOutcome } from "src/api/generated";

/**
 * What the outcomes of a Sync run are called
 *
 * @returns a function naming an outcome
 */
export function useSyncOutcomeLabel(): (outcome: SyncRunOutcome) => string {
    const [t] = useTranslation("admin");
    return (outcome) => {
        switch (outcome) {
            case SyncRunOutcome.Synced:
                return t("label.outcome-synced");
            case SyncRunOutcome.Unchanged:
                return t("label.outcome-unchanged");
            case SyncRunOutcome.Failed:
                return t("label.outcome-failed");
        }
    };
}
