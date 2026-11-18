/**
 * Mounts Command Zone Dating's components with mock Commanders, so each state can be
 * screenshotted without a login. `?state=stack|flip|match|reject|super|bio|profile|date-answer|date-pick|date-done|date-left|swipe`,
 * `?lng=de`.
 */
import { Heading } from "components";
import { AnimatePresence } from "motion/react";
import { Suspense, useState } from "react";
import { createRoot } from "react-dom/client";
import "../src/index.css";
import i18n from "../src/i18n";
import type { DateSessionResponse, DatingCardResponse } from "src/api/generated";
import { DatingBlindView } from "src/components/dating-blind-view";
import { DatingDateView } from "src/components/dating-date-view";
import { DeckAdvisorSwipe } from "src/components/deck-advisor-swipe";
import type { Badge } from "src/utils/advisor-impact";
import type { Move } from "src/utils/advisor-moves";
import type { Printing } from "src/utils/scryfall";
import { DatingBioDialog } from "src/components/dating-bio-dialog";
import { DatingCard } from "src/components/dating-card";
import { DatingColorFilter } from "src/components/dating-color-filter";
import { DatingProfileForm } from "src/components/dating-profile-form";
import { DatingVerdict } from "src/components/dating-verdict";
import type { Verdict } from "src/components/dating-verdict";
import type { Color, SwipeDirection } from "src/utils/dating";

const art = (name: string, version = "art_crop") =>
    `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}&format=image&version=${version}`;

const card = (name: string, colors: string, interests: string[], yourType = false): DatingCardResponse => ({
    commander: name.toLowerCase().replace(/\W+/g, "-"),
    printing: null,
    name,
    color_identity: colors,
    image_art_crop: art(name),
    image_normal: art(name, "normal"),
    type_line: "Legendary Creature",
    oracle_text: "Flying, vigilance, deathtouch, lifelink\nAt the beginning of your end step, proliferate.",
    edhrec_rank: 12,
    price_eur: 4.5,
    interests: interests.map((label) => ({ label, theme: label.toLowerCase() })),
    your_type: yourType,
});

const STACK = [
    card("Atraxa, Praetors' Voice", "WUBG", ["+1/+1 Counters", "Superfriends", "Infect"], true),
    card("Toxrill, the Corrosive", "UB", ["Control", "Removal", "Tokens"]),
    card("Krenko, Mob Boss", "R", ["Goblins", "Tokens", "Aggro"]),
];

const params = new URLSearchParams(location.search);
const state = params.get("state") ?? "stack";

const PALETTE = ["Treasure", "Aristocrats", "Lifegain", "Landfall", "Spellslinger", "Aggro", "Mill"].map((label) => ({
    theme: label.toLowerCase(),
    label,
}));

const session = (overrides: Partial<DateSessionResponse>): DateSessionResponse => ({
    deck: "deck",
    commander: "krenko",
    name: "Krenko, Mob Boss",
    image_art_crop: art("Krenko, Mob Boss"),
    status: "Active",
    chemistry: 50,
    next: "Commander",
    round: 1,
    proposal: { theme: "tribal", label: "Tribal" },
    palette: PALETTE,
    turns: [],
    ...overrides,
});

const TURNS: DateSessionResponse["turns"] = [
    { by: "Commander", theme: "tribal", label: "Tribal", level: "allin", delta: 20 },
    { by: "Player", theme: "aristocrats", label: "Aristocrats", level: "core", delta: 15 },
    { by: "Commander", theme: "tokens", label: "Tokens", level: "core", delta: 15 },
    { by: "Player", theme: "lifegain", label: "Lifegain", level: "allin", delta: -25 },
];

const SESSIONS: Record<string, DateSessionResponse> = {
    "date-answer": session({}),
    "date-pick": session({ next: "Player", proposal: null, turns: TURNS.slice(0, 3), chemistry: 85, round: 2 }),
    "date-done": session({ status: "Done", next: null, proposal: null, turns: TURNS, chemistry: 75, round: 3 }),
    "date-left": session({
        status: "Left",
        next: null,
        proposal: null,
        chemistry: 0,
        turns: [{ by: "Commander", theme: "tribal", label: "Tribal", level: "avoid", delta: -40 }],
    }),
};

const badge = (id: string, kind: string, tone: Badge["tone"], delta: number): Badge =>
    ({ dim: { key: `${kind}:${id}`, kind, id, value: 0, low: 0, high: 0 }, delta, after: 0, tone }) as unknown as Badge;

const ADDS = [
    {
        name: "Skullclamp",
        type: "Artifact — Equipment",
        fact: "In 71% of Krenko decks",
        badges: [badge("card_draw", "bucket", "good", 1)],
    },
    {
        name: "Impact Tremors",
        type: "Enchantment",
        fact: "Every Goblin pings each opponent",
        badges: [badge("tokens", "theme", "good", 1)],
    },
    {
        name: "Mountain",
        type: "Basic Land — Mountain",
        fact: "Lands are short",
        badges: [badge("lands", "bucket", "good", 5)],
    },
];

const MOVES = ADDS.map(
    (add) =>
        ({
            kind: "add",
            oracle_id: add.name,
            name: add.name,
            fact: add.fact,
            badges: add.badges,
            suggestion: { oracle_id: add.name, name: add.name, type_line: add.type },
        }) as unknown as Move,
);

const PRINTINGS = new Map<string, Printing>(
    ADDS.map((add) => [
        add.name,
        {
            id: add.name,
            imageUrl: null,
            largeImageUrl: `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(add.name)}&format=image&version=normal`,
            priceEur: 3.5,
        } as unknown as Printing,
    ]),
);

function Probe() {
    const [stack, setStack] = useState(STACK);
    const [exit, setExit] = useState<SwipeDirection | null>(null);
    const [flipped, setFlipped] = useState(state === "flip");
    const [colors, setColors] = useState<Set<Color>>(new Set(["U", "B"]));
    const top = stack[0];
    const verdict: Verdict | null =
        state === "match"
            ? { kind: "match", how: "like", shared: "Tokens" }
            : state === "super"
              ? { kind: "match", how: "super", shared: null }
              : state === "reject"
                ? { kind: "reject", reason: { dimension: "Salt", direction: "More", detail: null } }
                : null;

    if (state in SESSIONS) {
        return (
            <DatingDateView
                session={SESSIONS[state]}
                busy={false}
                onAnswer={() => {}}
                onBring={async () => {}}
                onDateNight={() => {}}
                onComeBack={() => {}}
                onMeetCards={() => {}}
                onBuildAnyway={() => {}}
                onBack={() => {}}
            />
        );
    }

    if (state.startsWith("blind-")) {
        return (
            <DatingBlindView
                name={"Krenko, Mob Boss"}
                art={art("Krenko, Mob Boss")}
                state={
                    state === "blind-revealed"
                        ? {
                              kind: "revealed",
                              added: 64,
                              themes: [
                                  { theme: "tribal", label: "Goblins", level: "allin" },
                                  { theme: "tokens", label: "Tokens", level: "core" },
                                  { theme: "aristocrats", label: "Aristocrats", level: "light" },
                              ],
                          }
                        : state === "blind-failed"
                          ? { kind: "failed" }
                          : { kind: "waiting" }
                }
                onSwipe={() => {}}
                onBuild={() => {}}
            />
        );
    }

    if (state === "swipe") {
        return (
            <DeckAdvisorSwipe
                moves={MOVES}
                cards={PRINTINGS}
                count={64}
                target={100}
                colors={1}
                themeLabels={{ tokens: "Tokens" }}
                loading={false}
                canUndo={true}
                onAdd={async () => {}}
                onNever={() => {}}
                onUndo={async () => {}}
                onClose={() => {}}
            />
        );
    }

    if (state === "profile") {
        return (
            <div className={"mx-auto max-w-md p-4"}>
                <DatingProfileForm answers={{ colors: "UB", bracket: 3, budget_eur: 300 }} onSave={async () => {}} />
            </div>
        );
    }

    return (
        <div className={"mx-auto flex h-dvh w-full max-w-md flex-col gap-2 px-4 pt-2 pb-4"}>
            <Heading>{"Command Zone Dating"}</Heading>
            <DatingColorFilter
                selected={colors}
                onToggle={(color) =>
                    setColors((current) => {
                        const next = new Set(current);
                        if (next.has(color)) next.delete(color);
                        else next.add(color);
                        return next;
                    })
                }
            />
            <div className={"relative isolate min-h-0 flex-1"}>
                <AnimatePresence custom={exit}>
                    {stack
                        .slice(0, 2)
                        .reverse()
                        .map((item) => (
                            <DatingCard
                                key={item.commander}
                                card={item}
                                top={item.commander === top?.commander}
                                flipped={flipped}
                                onSwipe={(direction) => {
                                    setExit(direction);
                                    setFlipped(false);
                                    setStack((current) => current.slice(1));
                                }}
                                onFlip={() => setFlipped((turned) => !turned)}
                                onOpenBio={() => {}}
                            />
                        ))}
                </AnimatePresence>
            </div>
            <div className={"h-20"} />
            <DatingBioDialog card={state === "bio" ? STACK[0] : null} onClose={() => {}} />
            {verdict !== null && (
                <DatingVerdict
                    commander={STACK[1].commander}
                    name={state === "reject" ? "Toxrill, the Corrosive" : "Krenko, Mob Boss"}
                    art={art(state === "reject" ? "Toxrill, the Corrosive" : "Krenko, Mob Boss")}
                    verdict={verdict}
                    busy={false}
                    onKeepSwiping={() => {}}
                    onStartDeck={() => {}}
                    onComeBack={() => {}}
                />
            )}
        </div>
    );
}

const language = params.get("lng");
if (language) await i18n.changeLanguage(language);
await i18n.loadNamespaces(["dating", "advisor"]);
if (params.get("dark") !== null) document.documentElement.classList.add("dark");

createRoot(document.getElementById("root")!).render(
    <Suspense fallback={null}>
        <Probe />
    </Suspense>,
);
document.body.dataset.status = "mounted";
