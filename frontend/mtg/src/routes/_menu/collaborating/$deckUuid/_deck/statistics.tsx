import { createFileRoute, useLoaderData } from "@tanstack/react-router";
import { EmptyState } from "components";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { DeckStatistics } from "src/components/deck-statistics";
import { commanderColors, letters } from "src/utils/deck-rules";
import { deckOdds } from "src/utils/deck-odds";
import { deckStats } from "src/utils/deck-stats";

export const Route = createFileRoute("/_menu/collaborating/$deckUuid/_deck/statistics")({
    loader: async ({ params }) => ({ deck: await Api.decks.cards.listIfThere(params.deckUuid) }),
    component: RouteComponent,
});

/**
 * What a deck its owner named the reader on is made of, in numbers.
 *
 * @returns the page
 */
function RouteComponent() {
    const { deckUuid } = Route.useParams();
    const { deck } = Route.useLoaderData();
    const chrome = useLoaderData({ from: "/_menu/collaborating/$deckUuid/_deck" });
    const [t] = useTranslation("deck");

    const cards = deck?.cards ?? [];
    const tags = deck?.tags ?? [];
    if (chrome.deck === null) {
        return <EmptyState title={t("heading.no-statistics")} description={t("description.no-statistics")} />;
    }
    const colors =
        chrome.deck.allowed_color_identity == null
            ? commanderColors(cards.filter((card) => card.zone === "Commander"))
            : letters(chrome.deck.allowed_color_identity);
    const stats = deckStats(cards, colors, tags);
    const odds = deckOdds(cards, colors, tags);
    if (stats.totalCards === 0) {
        return <EmptyState title={t("heading.no-statistics")} description={t("description.no-statistics")} />;
    }

    return <DeckStatistics deckId={`collaborating:${deckUuid}`} stats={stats} odds={odds} tags={tags} />;
}
