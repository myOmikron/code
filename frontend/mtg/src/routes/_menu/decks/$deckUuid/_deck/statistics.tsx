import { createFileRoute, useLoaderData } from "@tanstack/react-router";
import { EmptyState } from "components";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { DeckResourceBalance } from "src/components/deck-resource-balance";
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
    const { cards, tags } = Route.useLoaderData();
    const { deck, formats } = useLoaderData({ from: "/_menu/decks/$deckUuid/_deck" });
    const [t] = useTranslation("deck");

    // What the deck may play decides which colour bars are drawn: the
    // commander's identity unless the deck overrules it.
    const colors =
        deck.allowed_color_identity == null
            ? commanderColors(cards.filter((card) => card.zone === "Commander"))
            : letters(deck.allowed_color_identity);
    const stats = deckStats(cards, colors, tags);
    const odds = deckOdds(cards, colors, tags);
    if (stats.totalCards === 0) {
        return <EmptyState title={t("heading.no-statistics")} description={t("description.no-statistics")} />;
    }

    return (
        <div className={"flex flex-col gap-6"}>
            <DeckStatistics deckId={deck.uuid} stats={stats} odds={odds} tags={tags} />
            {/* Last, and from the graph: what the deck makes against what it
                wants. An advisor that cannot be reached simply leaves the
                page as it was. */}
            <DeckResourceBalance
                cards={cards}
                deck={deck}
                formatSize={formats.find((format) => format.slug === deck.format)?.deck_size.cards ?? null}
            />
        </div>
    );
}
