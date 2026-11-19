/**
 * Mounts Command Zone Dating's components with mock Commanders, so each state can be
 * screenshotted without a login. `?state=stack|flip|match|reject|super|bio|profile|date-answer|date-pick|date-done|date-left|swipe|swipe-package`,
 * `?lng=de`.
 */
import { Button, Heading, Navbar, NavbarItem, NavbarLabel, NavbarSection, StackedLayout } from "components";
import { AnimatePresence } from "motion/react";
import { Suspense, useState } from "react";
import { createRoot } from "react-dom/client";
import "../src/index.css";
import i18n from "../src/i18n";
import type { DateSessionResponse, DatingCardResponse } from "src/api/generated";
import type { Suggestion } from "src/api/graph-generated";
import { DatingBlindView } from "src/components/dating-blind-view";
import { DatingDateView } from "src/components/dating-date-view";
import { DeckAdvisorSwipe } from "src/components/deck-advisor-swipe";
import type { Badge } from "src/utils/advisor-impact";
import type { Move } from "src/utils/advisor-moves";
import type { Printing } from "src/utils/scryfall";
import { DatingActions } from "src/components/dating-actions";
import { DatingBioDialog } from "src/components/dating-bio-dialog";
import { DatingCard } from "src/components/dating-card";
import { DatingColorFilter } from "src/components/dating-color-filter";
import { DatingSetFilter } from "src/components/dating-set-filter";
import { DatingProfileForm } from "src/components/dating-profile-form";
import { DatingVerdict } from "src/components/dating-verdict";
import type { Verdict } from "src/components/dating-verdict";
import { nextColorChoice } from "src/utils/dating";
import type { Color, ColorChoice, SwipeDirection } from "src/utils/dating";

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

const realFetch = window.fetch.bind(window);
window.fetch = (input, init) =>
    String(input instanceof Request ? input.url : input).includes("/dating/sets")
        ? Promise.resolve(
              Response.json([
                  { code: "BLB", name: "Bloomburrow", legends: 31 },
                  { code: "FDN", name: "Foundations", legends: 42 },
              ]),
          )
        : realFetch(input, init);

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

/** A Goblin tokens package for the package state */
const PACKAGE = [
    "Goblin Chieftain",
    "Impact Tremors",
    "Goblin Bombardment",
    "Skirk Prospector",
    "Beetleback Chief",
    "Siege-Gang Commander",
    "Goblin Matron",
].map((name) => ({ name, type: "Creature — Goblin", fact: "", badges: [badge("tokens", "theme", "good", 1)] }));

const PACKAGE_MOVES = PACKAGE.map(
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
    [...ADDS, ...PACKAGE].map((add) => [
        add.name,
        {
            id: add.name,
            imageUrl: `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(add.name)}&format=image&version=small`,
            largeImageUrl: `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(add.name)}&format=image&version=normal`,
            priceEur: 3.5,
        } as unknown as Printing,
    ]),
);

function Probe() {
    const [stack, setStack] = useState(STACK);
    const [exit, setExit] = useState<SwipeDirection | null>(null);
    const [flipped, setFlipped] = useState(state === "flip");
    const [colors, setColors] = useState<Map<Color, ColorChoice>>(
        new Map([
            ["U", "required"],
            ["R", "excluded"],
        ]),
    );
    const [sets, setSets] = useState<string[]>(params.get("sets")?.split(",") ?? []);
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
                onSurprise={() => {}}
                surprising={false}
                onBuild={() => {}}
            />
        );
    }

    if (state === "swipe" || state === "swipe-package") {
        return (
            <DeckAdvisorSwipe
                moves={state === "swipe-package" ? [...PACKAGE_MOVES, ...MOVES] : MOVES}
                groups={
                    state === "swipe-package"
                        ? [
                              {
                                  key: "typal:Goblin",
                                  label: "Goblin",
                                  reason: "",
                                  suggestions: PACKAGE_MOVES.map(
                                      (move) => (move as { suggestion: unknown }).suggestion as Suggestion,
                                  ),
                              },
                          ]
                        : []
                }
                cards={PRINTINGS}
                count={64}
                target={100}
                colors={1}
                themeLabels={{ tokens: "Tokens" }}
                loading={false}
                canUndo={true}
                onAdd={async () => {}}
                onNever={() => {}}
                onAddPackage={async () => {}}
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

    const swipe = (direction: SwipeDirection) => {
        setExit(direction);
        setFlipped(false);
        setStack((current) => current.slice(1));
    };

    return (
        <StackedLayout
            navCollapseBelow={"sm"}
            contentWidth={"wide"}
            footer={<div className={"h-12"} />}
            navbar={
                <Navbar>
                    <NavbarSection className={"max-sm:hidden"}>
                        {["Start", "Decks", "Turniere", "Game-Tools", "Scannen", "Dating"].map((label) => (
                            <NavbarItem key={label} current={label === "Dating"}>
                                <NavbarLabel>{label}</NavbarLabel>
                            </NavbarItem>
                        ))}
                    </NavbarSection>
                </Navbar>
            }
        >
            <div
                className={
                    "mx-auto flex h-[calc(100dvh-5rem)] min-h-[34rem] w-full max-w-md flex-col gap-2 px-4 pt-2 pb-4 lg:h-[calc(100dvh-9rem)] lg:min-h-[30rem] lg:max-w-none lg:gap-5 lg:p-0"
                }
            >
                <header className={"flex flex-wrap items-center gap-x-2 gap-y-2 lg:flex-nowrap lg:gap-x-5"}>
                    <Heading className={"min-w-0 flex-1"}>{"Command Zone Dating"}</Heading>
                    <div className={"order-last w-full lg:order-none lg:w-auto"}>
                        <DatingColorFilter
                            choices={colors}
                            onToggle={(color) =>
                                setColors((current) => {
                                    const next = new Map(current);
                                    const choice = nextColorChoice(current.get(color));
                                    if (choice === undefined) next.delete(color);
                                    else next.set(color, choice);
                                    return next;
                                })
                            }
                        />
                    </div>
                    <span aria-hidden={true} className={"hidden h-6 w-px bg-zinc-950/10 lg:block dark:bg-white/10"} />
                    <DatingSetFilter sets={sets} onSets={setSets} />
                    <span aria-hidden={true} className={"hidden h-6 w-px bg-zinc-950/10 lg:block dark:bg-white/10"} />
                    <div className={"flex items-center"}>
                        <Button plain={true}>{"P"}</Button>
                        <Button plain={true}>{"M"}</Button>
                    </div>
                </header>
                <div className={"relative isolate min-h-0 flex-1 lg:mx-auto lg:w-full lg:max-w-5xl"}>
                    <AnimatePresence custom={exit}>
                        {stack
                            .slice(0, 2)
                            .reverse()
                            .map((item) => (
                                <DatingCard
                                    key={item.commander}
                                    card={item}
                                    tagline={"jemanden, der jede Beziehung um eine Marke wachsen lässt"}
                                    top={item.commander === top?.commander}
                                    flipped={flipped}
                                    onSwipe={swipe}
                                    onFlip={() => setFlipped((turned) => !turned)}
                                    onOpenBio={() => {}}
                                />
                            ))}
                    </AnimatePresence>
                </div>
                <DatingActions
                    canSwipe={top !== undefined}
                    canRewind={true}
                    supers={1}
                    onSwipe={swipe}
                    onRewind={() => {}}
                />
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
        </StackedLayout>
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
