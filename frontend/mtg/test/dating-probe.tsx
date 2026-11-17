/**
 * Mounts Command Zone Dating's components with mock Commanders, so each state can be
 * screenshotted without a login. `?state=stack|match|reject|super|bio|profile`, `?lng=de`.
 */
import { Heading } from "components";
import { AnimatePresence } from "motion/react";
import { Suspense, useState } from "react";
import { createRoot } from "react-dom/client";
import "../src/index.css";
import i18n from "../src/i18n";
import type { DatingCardResponse } from "src/api/generated";
import { DatingBioDialog } from "src/components/dating-bio-dialog";
import { DatingCard } from "src/components/dating-card";
import { DatingColorFilter } from "src/components/dating-color-filter";
import { DatingProfileForm } from "src/components/dating-profile-form";
import { DatingVerdict } from "src/components/dating-verdict";
import type { Verdict } from "src/components/dating-verdict";
import type { Color, SwipeDirection } from "src/utils/dating";

const art = (name: string) =>
    `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}&format=image&version=art_crop`;

const card = (name: string, colors: string, interests: string[], yourType = false): DatingCardResponse => ({
    commander: name.toLowerCase().replace(/\W+/g, "-"),
    printing: null,
    name,
    color_identity: colors,
    image_art_crop: art(name),
    image_normal: null,
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

function Probe() {
    const [stack, setStack] = useState(STACK);
    const [exit, setExit] = useState<SwipeDirection | null>(null);
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
                                onSwipe={(direction) => {
                                    setExit(direction);
                                    setStack((current) => current.slice(1));
                                }}
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
await i18n.loadNamespaces(["dating"]);
if (params.get("dark") !== null) document.documentElement.classList.add("dark");

createRoot(document.getElementById("root")!).render(
    <Suspense fallback={null}>
        <Probe />
    </Suspense>,
);
document.body.dataset.status = "mounted";
