import { EmptyState, Text } from "components";
import { useTranslation } from "react-i18next";
import { GraphQuery } from "src/utils/use-graph-query";

/**
 * The properties for {@link DeckAdvisorState}
 */
export type DeckAdvisorStateProps = {
    /** What the query is doing, when it has no answer to show yet */
    state: GraphQuery<unknown>["state"];
};

/**
 * What stands in for a panel that has nothing to show yet.
 *
 * Only reached while the query holds no answer at all: once one has arrived,
 * every panel keeps showing it through the next refetch rather than falling
 * back here, so an edit never blanks the section it was made in.
 *
 * @returns the placeholder
 */
export function DeckAdvisorState({ state }: DeckAdvisorStateProps) {
    const [t] = useTranslation("advisor");

    if (state === "unavailable") {
        return (
            <EmptyState title={t("heading.advisor-unavailable")} description={t("description.advisor-unavailable")} />
        );
    }
    return <Text className={"py-12 text-center"}>{t("label.analyzing")}</Text>;
}
