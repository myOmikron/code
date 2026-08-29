import { createFileRoute, useLoaderData } from "@tanstack/react-router";
import { EmptyState } from "components";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { DeckStatistics } from "src/components/deck-statistics";
import { commanderColors, letters } from "src/utils/deck-rules";
import { deckOdds } from "src/utils/deck-odds";
import { deckStats } from "src/utils/deck-stats";
import { isDeadShareLink } from "src/utils/share-link";

export const Route = createFileRoute("/_menu/shared/decks/$token/_shared/statistics")({
    loader: async ({ params }) => {
        try {
            return { deck: await Api.shared.decks.cards(params.token) };
        } catch (error) {
            if (isDeadShareLink(error)) return { deck: null };
            throw error;
        }
    },
    component: RouteComponent,
});

/**
 * What a shared deck is made of, in numbers.
 *
 * @returns the page
 */
function RouteComponent() {
    const { token } = Route.useParams();
    const { deck } = Route.useLoaderData();
    const shared = useLoaderData({ from: "/_menu/shared/decks/$token/_shared" });
    const [t] = useTranslation("deck");

    const cards = deck?.cards ?? [];
    const tags = deck?.tags ?? [];
    if (shared.deck === null) {
        return <EmptyState title={t("heading.no-statistics")} description={t("description.no-statistics")} />;
    }
    const colors =
        shared.deck.allowed_color_identity == null
            ? commanderColors(cards.filter((card) => card.zone === "Commander"))
            : letters(shared.deck.allowed_color_identity);
    const stats = deckStats(cards, colors, tags);
    const odds = deckOdds(cards, colors, tags);
    if (stats.totalCards === 0) {
        return <EmptyState title={t("heading.no-statistics")} description={t("description.no-statistics")} />;
    }

    return <DeckStatistics deckId={`shared:${token}`} stats={stats} odds={odds} tags={tags} />;
}
