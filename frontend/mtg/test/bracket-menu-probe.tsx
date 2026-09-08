// Renders the real `DeckBracketMenu` against four counted decks, so the one
// button and its read-out can be screenshotted without logging into the app.
// `?deck=<index>` picks the deck; the last focus the menu asked for is echoed
// into `#state`, which is how a driving script checks that a rule row really
// filters the deck view.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import "../src/index.css";
import "../src/i18n";
import type { BracketRulesResponse } from "src/api/generated";
import { DeckBracketMenu } from "src/components/deck-bracket-menu";
import type { CardFocus } from "src/utils/card-focus";
import type { BracketCounts } from "src/utils/deck-rules";

/** The ladder exactly as the webserver publishes it */
const BRACKETS: Array<BracketRulesResponse> = [
    { number: 1, slug: "exhibition", max_game_changers: 0, mass_land_denial: false, extra_turns: "none", combos: "none" },
    {
        number: 2,
        slug: "core",
        max_game_changers: 0,
        mass_land_denial: false,
        extra_turns: "no-chaining",
        combos: "no-two-card",
    },
    {
        number: 3,
        slug: "upgraded",
        max_game_changers: 3,
        mass_land_denial: false,
        extra_turns: "no-chaining",
        combos: "any",
    },
    { number: 4, slug: "optimized", max_game_changers: null, mass_land_denial: true, extra_turns: "any", combos: "any" },
    { number: 5, slug: "cedh", max_game_changers: null, mass_land_denial: true, extra_turns: "any", combos: "any" },
];

/** One counted deck, named so a screenshot says which case it is */
type Case = { name: string; bracket: number | null; counts: BracketCounts };

const CASES: Array<Case> = [
    {
        name: "Atraxa, Grand Unifier — nothing flagged",
        bracket: 2,
        counts: {
            gameChangers: [],
            massLandDenial: [],
            extraTurns: [],
            chainsExtraTurns: false,
            combos: [],
        },
    },
    {
        name: "Winota — land denial, one extra turn, a three-card line",
        bracket: 2,
        counts: {
            gameChangers: ["Ancient Tomb"],
            massLandDenial: ["Armageddon", "Ruination"],
            extraTurns: ["Time Warp"],
            chainsExtraTurns: false,
            combos: [["Kiki-Jiki, Mirror Breaker", "Restoration Angel", "Blade Historian"]],
        },
    },
    {
        name: "Yuriko — three extra turns, which chain",
        bracket: 3,
        counts: {
            gameChangers: ["Fierce Guardianship", "Vampiric Tutor"],
            massLandDenial: [],
            extraTurns: ["Nexus of Fate", "Temporal Manipulation", "Time Warp"],
            chainsExtraTurns: true,
            combos: [],
        },
    },
    {
        name: "Kinnan — three Game Changers, two two-card combos, unclaimed",
        bracket: null,
        counts: {
            gameChangers: ["Gaea's Cradle", "Rhystic Study", "Thassa's Oracle"],
            massLandDenial: [],
            extraTurns: [],
            chainsExtraTurns: false,
            combos: [
                ["Kinnan, Bonder Prodigy", "Basalt Monolith"],
                ["Thassa's Oracle", "Demonic Consultation"],
            ],
        },
    },
    {
        name: "Thrasios/Tymna — bracket 5, everything legal",
        bracket: 5,
        counts: {
            gameChangers: [
                "Rhystic Study",
                "Mystic Remora",
                "Demonic Tutor",
                "Vampiric Tutor",
                "Fierce Guardianship",
                "Ancient Tomb",
                "Gaea's Cradle",
                "Grim Monolith",
                "The One Ring",
                "Jeska's Will",
                "Underworld Breach",
                "Thassa's Oracle",
                "Cyclonic Rift",
            ],
            massLandDenial: [],
            extraTurns: ["Time Warp", "Temporal Manipulation", "Nexus of Fate"],
            chainsExtraTurns: true,
            combos: [["Thassa's Oracle", "Demonic Consultation"]],
        },
    },
];

/**
 * The ladder as a webserver that predates the three-step rules serves it.
 *
 * `?stale=1` swaps it in. A dev stack whose image is a rebuild behind serves
 * exactly this, and the menu has to read the same either way — the ladder is a
 * published constant, so a rule the service does not name falls back to what
 * that rung is known to ask rather than to a shrug.
 */
const STALE = BRACKETS.map((rules) => ({
    number: rules.number,
    slug: rules.slug,
    max_game_changers: rules.max_game_changers,
    mass_land_denial: rules.mass_land_denial,
    extra_turns: rules.number >= 4,
    two_card_combos: rules.number >= 3,
})) as unknown as Array<BracketRulesResponse>;

/** The bar's own strip, so the button is measured where it actually sits */
function Probe() {
    const params = new URLSearchParams(window.location.search);
    const index = Number(params.get("deck") ?? "1");
    const ladder = params.get("stale") === "1" ? STALE : BRACKETS;
    const shown = CASES[index] ?? CASES[1];
    const [bracket, setBracket] = useState<number | null>(shown.bracket);
    const [focus, setFocus] = useState<CardFocus | null>(null);

    return (
        <div className={"bg-(--surface-page,#f4f4f5) p-4"}>
            <p className={"mb-2 text-xs text-zinc-500"}>{shown.name}</p>
            <div
                className={
                    "flex flex-wrap items-center gap-2 rounded-(--radius-card) bg-zinc-200/90 px-5 py-3 shadow-(--shadow-card-md) ring-1 ring-zinc-950/10 dark:bg-zinc-800/90 dark:ring-white/15"
                }
            >
                <span className={"text-sm font-semibold"}>{"{W}{U}{B}{G}"}</span>
                <DeckBracketMenu
                    brackets={ladder}
                    bracket={bracket}
                    counts={shown.counts}
                    onChange={setBracket}
                    onFocus={setFocus}
                    className={"shrink-0"}
                />
            </div>
            <pre id={"state"} className={"mt-4 text-[11px] text-zinc-600 dark:text-zinc-300"}>
                {JSON.stringify({ bracket, focus }, null, 2)}
            </pre>
        </div>
    );
}

createRoot(document.getElementById("root")!).render(<Probe />);
document.body.dataset.status = "ready";
