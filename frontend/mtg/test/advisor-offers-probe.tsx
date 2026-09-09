// Renders the exchange list with the real cut rows and mock data, so the fold
// on a cut that arrives with far more offers than fit (twenty-six, as seen
// live) can be screenshotted at both widths without logging into the app.
import { Suspense } from "react";
import { createRoot } from "react-dom/client";
import "../src/index.css";
import "../src/i18n";
import type { Swap } from "src/api/graph-generated";
import { DeckAdvisorCuts } from "src/components/deck-advisor-cuts";
import type { Printing } from "src/utils/scryfall";

/** Scryfall's redirect endpoint, so the probe needs no printing ids of its own */
const art = (name: string, version: "small" | "normal") =>
    `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}&format=image&version=${version}`;

/** The card being given up, and the twenty-six offered for its slot */
const CUT = { name: "Ondu Giant", type: "Creature — Elf Druid", price: 0.2 };
const OFFERS = [
    "Cultivate",
    "Kodama's Reach",
    "Rampant Growth",
    "Farseek",
    "Nature's Lore",
    "Three Visits",
    "Sakura-Tribe Elder",
    "Wood Elves",
    "Solemn Simulacrum",
    "Explosive Vegetation",
    "Skyshroud Claim",
    "Circuitous Route",
    "Migration Path",
    "Hour of Promise",
    "Search for Tomorrow",
    "Sylvan Scrying",
    "Wayfarer's Bauble",
    "Harrow",
    "Springbloom Druid",
    "Yavimaya Elder",
    "Ranger's Path",
    "Peregrination",
    "Grow from the Ashes",
    "Nissa's Pilgrimage",
    "Roiling Regrowth",
    "Tempt with Discovery",
];

const swaps: Array<Swap> = OFFERS.map((name, index) => ({
    add_oracle_id: `add-${index}`,
    add_name: name,
    shared_roles: index % 2 === 0 ? ["ramp"] : [],
    fills: index % 2 === 0 ? [] : ["ramp"],
    cut: {
        oracle_id: "cut-0",
        name: CUT.name,
        type_line: CUT.type,
        price_usd: CUT.price,
        reasons: [{ code: "weak_in_bucket", bucket: "ramp" }],
    },
}) as unknown as Swap);

const cards = new Map<string, Printing>(
    [CUT.name, ...OFFERS].map((name) => [
        name,
        {
            id: name,
            name,
            imageUrl: art(name, "small"),
            largeImageUrl: art(name, "normal"),
            typeLine: "Card",
            priceEur: 1.2,
        } as unknown as Printing,
    ]),
);

/** The exchange list exactly as the refine phase composes it */
function Probe() {
    return (
        <div className={"bg-(--surface-page,#f4f4f5) p-6"}>
            <DeckAdvisorCuts
                swaps={swaps}
                cards={cards}
                cardsState={"ready"}
                onRetryCards={() => {}}
                onSwap={() => {}}
                onCut={() => {}}
                onKeep={() => {}}
                onIgnoreAdd={() => {}}
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
