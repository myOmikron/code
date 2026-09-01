// Renders the suggestion gallery with the real tiles and mock data, so the add
// overlay on a card's artwork can be screenshotted — hovered, focused and on a
// touch-sized viewport — without logging into the app. Driven by a CDP script
// that moves a real pointer over a tile and captures the result.
import { Suspense } from "react";
import { createRoot } from "react-dom/client";
import "../src/index.css";
import "../src/i18n";
import type { Suggestion, SuggestionReport } from "src/api/graph-generated";
import { DeckAdvisorSuggestions } from "src/components/deck-advisor-suggestions";
import type { Printing } from "src/utils/scryfall";

/** Scryfall's redirect endpoint, so the probe needs no printing ids of its own */
const art = (name: string, version: "small" | "normal") =>
    `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}&format=image&version=${version}`;

const CARDS: Array<{ name: string; cost: string; type: string; price: number; changer?: boolean }> = [
    { name: "Sol Ring", cost: "{1}", type: "Artifact", price: 1.8 },
    { name: "Cultivate", cost: "{2}{G}", type: "Sorcery", price: 0.7 },
    { name: "Swords to Plowshares", cost: "{W}", type: "Instant", price: 2.4 },
    { name: "Rhystic Study", cost: "{2}{U}", type: "Enchantment", price: 28.5, changer: true },
    { name: "Beast Within", cost: "{2}{G}", type: "Instant", price: 1.1 },
    { name: "Counterspell", cost: "{U}{U}", type: "Instant", price: 1.4 },
];

const suggestion = (index: number): Suggestion => ({
    oracle_id: `oracle-${index}`,
    name: CARDS[index].name,
    cmc: index + 1,
    type_line: CARDS[index].type,
    price_usd: CARDS[index].price,
    score: 1 - index * 0.07,
    game_changer: CARDS[index].changer ?? false,
    provenance: [
        {
            channel: "role_gap",
            score: 0.4 - index * 0.02,
            detail: `Fills ${CARDS[index].type.toLowerCase()} — deck is ${4 - index} short at this speed`,
        },
        { channel: "edhrec", score: 0.2, detail: "in 42% of decks" },
    ],
});

const suggestions = CARDS.map((_, index) => suggestion(index));

const report = {
    commander: "Atraxa, Praetors' Voice",
    commander_inferred: false,
    identity: ["W", "U", "B", "G"],
    considered: 1240,
    suggestions,
    notes: [],
    groups: [
        {
            key: "bucket:ramp",
            label: "Ramp",
            reason: "The deck is four mana sources short at this speed.",
            suggestions: suggestions.slice(0, 3),
        },
        {
            key: "bucket:interaction",
            label: "Interaction",
            reason: "Three answers short of the corridor for this bracket.",
            suggestions: suggestions.slice(3),
        },
    ],
} as unknown as SuggestionReport;

const cards = new Map<string, Printing>(
    CARDS.map((card) => [
        card.name,
        {
            id: card.name,
            name: card.name,
            imageUrl: art(card.name, "small"),
            largeImageUrl: art(card.name, "normal"),
            manaCost: card.cost,
            typeLine: card.type,
            priceEur: card.price,
        } as unknown as Printing,
    ]),
);

/** The gallery exactly as the build phase composes it */
function Probe() {
    return (
        <div className={"bg-(--surface-page,#f4f4f5) p-6"}>
            <DeckAdvisorSuggestions
                report={report}
                batch={suggestions}
                cards={cards}
                cardsState={"ready"}
                onRetryCards={() => {}}
                onAdd={(picked) => {
                    document.body.dataset.added = picked.name;
                }}
                onAddToMaybe={() => {}}
                maybeOracles={new Set()}
                onIgnore={() => {}}
                busyOracle={null}
            />
        </div>
    );
}

const root = document.getElementById("root");
if (root !== null) {
    createRoot(root).render(
        <Suspense fallback={null}>
            <Probe />
        </Suspense>,
    );
    document.body.dataset.status = "mounted";
}
