/**
 * Mounts the unified advisor with mock data, so each state can be
 * screenshotted without a login. `?count=94|100|104` sets the deck size,
 * `?dialog=room|debrief|debrief2|plateau|goals` opens a dialog.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Suspense, useState } from "react";
import { createRoot } from "react-dom/client";
import "../src/index.css";
import "../src/i18n";
import type { CutCandidate, Diagnostics, Suggestion } from "src/api/graph-generated";
import { DeckAdvisorDebriefDialog } from "src/components/deck-advisor-debrief-dialog";
import { DeckAdvisorGoals, GoalsTab } from "src/components/deck-advisor-goals";
import { DeckAdvisorHeader } from "src/components/deck-advisor-header";
import { DeckAdvisorMoves } from "src/components/deck-advisor-moves";
import { DeckAdvisorNeeds } from "src/components/deck-advisor-needs";
import { DeckAdvisorPlateauDialog } from "src/components/deck-advisor-plateau-dialog";
import { DeckAdvisorRoomDialog } from "src/components/deck-advisor-room-dialog";
import { DeckAdvisorThemes } from "src/components/deck-advisor-themes";
import { DEFAULT_ADVISOR_SETTINGS } from "src/utils/advisor-settings";
import { deckDims, needs, roomFor } from "src/utils/advisor-impact";
import { buildMoves } from "src/utils/advisor-moves";
import type { Printing } from "src/utils/scryfall";

const art = (name: string, version: "small" | "normal") =>
    `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}&format=image&version=${version}`;

type Mock = {
    name: string;
    cost: string;
    cmc: number;
    type: string;
    buckets?: Record<string, number>;
    themes?: Array<string>;
    fact: string;
};

const ADDS: Array<Mock> = [
    {
        name: "Skullclamp",
        cost: "{1}",
        cmc: 1,
        type: "Artifact — Equipment",
        buckets: { card_draw: 1 },
        themes: ["tokens", "aristocrats"],
        fact: "In 71% of Lathril decks",
    },
    {
        name: "Elvish Archdruid",
        cost: "{1}{G}{G}",
        cmc: 3,
        type: "Creature — Elf Druid",
        buckets: { ramp: 1, mana_sources: 1 },
        themes: ["elves"],
        fact: "Fills Ramp, deck is 2 short at this speed",
    },
    {
        name: "Elvish Warmaster",
        cost: "{1}{G}",
        cmc: 2,
        type: "Creature — Elf Warrior",
        buckets: { synergy_wincon: 1 },
        themes: ["elves", "tokens"],
        fact: "In 62% of Lathril decks",
    },
    {
        name: "Heritage Druid",
        cost: "{G}",
        cmc: 1,
        type: "Creature — Elf Druid",
        buckets: { ramp: 1, mana_sources: 1 },
        themes: ["elves"],
        fact: "In 58% of Lathril decks",
    },
    {
        name: "Guardian Project",
        cost: "{3}{G}",
        cmc: 4,
        type: "Enchantment",
        buckets: { card_draw: 1 },
        fact: "Draws off every new Elf",
    },
    {
        name: "Infernal Grasp",
        cost: "{1}{B}",
        cmc: 2,
        type: "Instant",
        buckets: { interaction: 1 },
        fact: "In 48% of Lathril decks",
    },
    {
        name: "Zulaport Cutthroat",
        cost: "{1}{B}",
        cmc: 2,
        type: "Creature — Human Rogue",
        buckets: { synergy_wincon: 1 },
        themes: ["aristocrats"],
        fact: "Drains on every token death",
    },
    {
        name: "Beast Whisperer",
        cost: "{2}{G}{G}{G}",
        cmc: 5,
        type: "Creature — Elf Druid",
        buckets: { card_draw: 1 },
        themes: ["elves"],
        fact: "In 44% of Lathril decks",
    },
    {
        name: "Priest of Titania",
        cost: "{1}{G}",
        cmc: 2,
        type: "Creature — Elf Druid",
        buckets: { ramp: 1, mana_sources: 1 },
        themes: ["elves"],
        fact: "In 57% of Lathril decks",
    },
    {
        name: "Pitiless Plunderer",
        cost: "{3}{B}",
        cmc: 4,
        type: "Creature — Human Pirate",
        buckets: { ramp: 0.7 },
        themes: ["aristocrats"],
        fact: "Treasure on every death",
    },
];
const CUTS: Array<Mock> = [
    {
        name: "Gilded Lotus",
        cost: "{5}",
        cmc: 5,
        type: "Artifact",
        buckets: { ramp: 1, mana_sources: 1 },
        fact: "Cutting it moves the deck closer to its target shape",
    },
    {
        name: "Sever the Bloodline",
        cost: "{3}{B}",
        cmc: 4,
        type: "Sorcery",
        buckets: { interaction: 1 },
        fact: "Interaction is over target",
    },
    {
        name: "Ravenous Chupacabra",
        cost: "{2}{B}{B}",
        cmc: 4,
        type: "Creature — Horror",
        buckets: { interaction: 1 },
        fact: "Interaction is over target",
    },
    {
        name: "Rampaging Baloths",
        cost: "{4}{G}{G}",
        cmc: 6,
        type: "Creature — Beast",
        buckets: { synergy_wincon: 1 },
        fact: "Played in 4% of decks",
    },
    {
        name: "Thornweald Archer",
        cost: "{1}{G}",
        cmc: 2,
        type: "Creature — Elf Archer",
        themes: ["elves"],
        fact: "Played in 3% of decks",
    },
    {
        name: "Massacre Wurm",
        cost: "{3}{B}{B}{B}",
        cmc: 6,
        type: "Creature — Phyrexian Wurm",
        buckets: { interaction: 1 },
        fact: "Kills your own Elves",
    },
];

const suggestions: Array<Suggestion> = ADDS.map((card, index) => ({
    oracle_id: `add-${index}`,
    name: card.name,
    cmc: card.cmc,
    type_line: card.type,
    price_usd: 1,
    score: 1 - index * 0.05,
    provenance: [{ channel: "edhrec_synergy", score: 0.4, detail: card.fact }],
    profile: { buckets: card.buckets ?? {}, themes: card.themes ?? [] },
}));
const cuts: Array<CutCandidate> = CUTS.map((card, index) => ({
    oracle_id: `cut-${index}`,
    name: card.name,
    cmc: card.cmc,
    type_line: card.type,
    score: 1 - index * 0.1,
    profile: { buckets: card.buckets ?? {}, themes: card.themes ?? [] },
}));
const facts = Object.fromEntries([
    ...ADDS.map((card, index) => [`add-${index}`, card.fact]),
    ...CUTS.map((card, index) => [`cut-${index}`, card.fact]),
]);

const report = {
    deck_size: 99,
    lands: 37,
    buckets: [
        { bucket: "mana_sources", coverage: 46, low: 42, high: 48, status: "ok" },
        { bucket: "ramp", coverage: 8, low: 10, high: 12, status: "low" },
        { bucket: "card_draw", coverage: 7, low: 9, high: 11, status: "low" },
        { bucket: "interaction", coverage: 11, low: 7, high: 9, status: "high" },
        { bucket: "synergy_wincon", coverage: 14, low: 12, high: 16, status: "ok" },
    ],
    types: [
        { type: "Creature", count: 33, low: 28, high: 36, status: "ok" },
        { type: "Instant", count: 6, low: 6, high: 10, status: "ok" },
        { type: "Sorcery", count: 8, low: 4, high: 7, status: "high" },
        { type: "Artifact", count: 8, low: 6, high: 9, status: "ok" },
        { type: "Enchantment", count: 4, low: 3, high: 6, status: "ok" },
        { type: "Land", count: 37, low: 36, high: 38, status: "ok" },
    ],
    curve: [
        { mv: 0, count: 0, target: 0 },
        { mv: 1, count: 7, target: 8 },
        { mv: 2, count: 14, target: 14 },
        { mv: 3, count: 14, target: 14 },
        { mv: 4, count: 11, target: 10 },
        { mv: 5, count: 9, target: 5 },
        { mv: 6, count: 5, target: 3 },
    ],
    themes: [
        { theme: "elves", label: "Elves", share: 0.35, cards: 21 },
        { theme: "tokens", label: "Tokens", share: 0.18, cards: 10 },
        { theme: "aristocrats", label: "Aristocrats", share: 0.08, cards: 6 },
    ],
    themed_cards: 30,
} as unknown as Diagnostics;

const prefs = { levels: { elves: "allin" as const, tokens: "core" as const } };
const themeLabels = { elves: "Elves", tokens: "Tokens", aristocrats: "Aristocrats" };
const cards = new Map<string, Printing>(
    [...ADDS, ...CUTS].map((card) => [
        card.name,
        {
            id: card.name,
            name: card.name,
            imageUrl: art(card.name, "small"),
            largeImageUrl: art(card.name, "normal"),
            manaCost: card.cost,
            typeLine: card.type,
            priceEur: 1.2,
        } as unknown as Printing,
    ]),
);

const params = new URLSearchParams(location.search);
const count = Number(params.get("count") ?? 94);
const dialog = params.get("dialog");

/** The advisor page's composition with mock data */
function Probe() {
    const [filter, setFilter] = useState<string | null>(null);
    const [tab, setTab] = useState<GoalsTab | null>(dialog === "goals" ? "goals" : null);
    const dims = deckDims(report, prefs, ["elves", "tokens", "aristocrats"], null);
    const diff = count - 100;
    const moves = buildMoves({ diff, adds: suggestions, cuts, dims, facts, filter });
    const add = dialog === "room" ? suggestions[0] : null;
    const settings = {
        ...DEFAULT_ADVISOR_SETTINGS,
        themes: prefs,
        directions: [{ problem: "interaction", fix: "removal" }],
    };

    return (
        <div className={"mx-auto flex max-w-6xl flex-col gap-6 p-6"}>
            <DeckAdvisorHeader
                count={count}
                target={100}
                goals={"Goals · More removal · Bracket 3 · 2 hidden"}
                onOpenGoals={() => setTab("goals")}
                onFill={() => {}}
            />
            {params.get("themes") !== null && (
                <DeckAdvisorThemes report={report} prefs={prefs} onSetLevel={() => {}} labels={themeLabels} />
            )}
            <DeckAdvisorNeeds needs={needs(dims)} themeLabels={themeLabels} selected={filter} onSelect={setFilter} />
            <DeckAdvisorMoves
                moves={moves}
                batch={suggestions}
                notes={[]}
                lead={[]}
                cards={cards}
                cardsState={"ready"}
                onRetryCards={() => {}}
                onPrimary={(move) => {
                    document.body.dataset.primary = move.name;
                }}
                onIgnore={() => {}}
                onMaybe={() => {}}
                onKeep={() => {}}
                maybeOracles={new Set()}
                busyOracle={null}
                themeLabels={themeLabels}
                highlight={filter}
                empty={<p>empty</p>}
            />
            <DeckAdvisorRoomDialog
                add={add}
                options={add === null ? [] : roomFor(add, cuts, dims)}
                facts={facts}
                cards={cards}
                themeLabels={themeLabels}
                busy={false}
                onSwap={() => {}}
                onMaybe={() => {}}
                onClose={() => {}}
            />
            <DeckAdvisorPlateauDialog open={dialog === "plateau"} onPlay={() => {}} onClose={() => {}} />
            <DeckAdvisorDebriefDialog
                open={dialog === "debrief"}
                deckName={"Lathril's Court"}
                onTune={() => {}}
                onFine={() => {}}
                onSomethingElse={() => {}}
                onLater={() => {}}
            />
            <DeckAdvisorGoals
                tab={tab}
                onTab={setTab}
                onClose={() => setTab(null)}
                bracket={3}
                claimed={true}
                brackets={[]}
                houseRules={[]}
                poolQuery={null}
                onApplyPool={() => {}}
                ignored={[]}
                onUnignore={() => {}}
                kept={[]}
                onUnkeep={() => {}}
                settings={settings}
                onSaveSettings={() => {}}
                onSaveBracket={() => {}}
                detected={{ elves: 21, tokens: 10 }}
                report={report}
                themeLabels={themeLabels}
                onSetThemeLevel={() => {}}
                onSetShape={() => {}}
                onRemoveDirection={() => {}}
                onAddDirection={() => {}}
            />
        </div>
    );
}

const root = document.getElementById("root");
if (root !== null) {
    createRoot(root).render(
        <QueryClientProvider client={new QueryClient()}>
            <Suspense fallback={null}>
                <Probe />
            </Suspense>
        </QueryClientProvider>,
    );
    document.body.dataset.status = "mounted";
}
