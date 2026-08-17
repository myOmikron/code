import { createFileRoute, useLoaderData } from "@tanstack/react-router";
import { EmptyState } from "components";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { DeckStatistics } from "src/components/deck-statistics";
import { commanderColors, letters } from "src/utils/deck-rules";
import { deckOdds } from "src/utils/deck-odds";
import { deckStats } from "src/utils/deck-stats";

export const Route = createFileRoute("/_menu/decks/$deckUuid/_deck/statistics")({
    loader: ({ params }) => Api.decks.cards.list(params.deckUuid),
    component: RouteComponent,
});

/**
 * What the deck is made of, in numbers.
 *
 * @returns the page
 */
function RouteComponent() {
    const { cards } = Route.useLoaderData();
    const { deck } = useLoaderData({ from: "/_menu/decks/$deckUuid/_deck" });
    const [t] = useTranslation("deck");

    // What the deck may play decides which colour bars are drawn: the
    // commander's identity unless the deck overrules it.
    const colors =
        deck.allowed_color_identity == null
            ? commanderColors(cards.filter((card) => card.zone === "Commander"))
            : letters(deck.allowed_color_identity);
    const stats = deckStats(cards, colors);
    const odds = deckOdds(cards, colors);
    if (stats.totalCards === 0) {
        return <EmptyState title={t("heading.no-statistics")} description={t("description.no-statistics")} />;
    }

    return <DeckStatistics stats={stats} odds={odds} />;
}
