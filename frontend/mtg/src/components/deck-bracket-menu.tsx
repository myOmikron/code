import { ArrowPathIcon, CheckCircleIcon, ChevronDownIcon, ExclamationTriangleIcon } from "@heroicons/react/20/solid";
import { LinkIcon, MapIcon, TrophyIcon } from "@heroicons/react/20/solid";
import clsx from "clsx";
import {
    Dropdown,
    DropdownButton,
    DropdownDescription,
    DropdownDivider,
    DropdownHeading,
    DropdownItem,
    DropdownLabel,
    DropdownMenu,
    DropdownSection,
} from "components";
import type { ComponentType, SVGProps } from "react";
import { useTranslation } from "react-i18next";
import type { BracketRulesResponse } from "src/api/generated";
import { useDeckLabels } from "src/components/deck-labels";
import type { CardFocus } from "src/utils/card-focus";
import type { BracketCounts, BracketRuleCheck } from "src/utils/deck-rules";
import { BRACKET_RULE_KINDS, checkBracket, detectedBracket, playedBracket } from "src/utils/deck-rules";

/** The mark each bracket rule wears, wherever the deck bar shows one */
const RULE_ICONS: Record<BracketRuleCheck["kind"], ComponentType<SVGProps<SVGSVGElement>>> = {
    // The trophy the Game Changer marker already wears everywhere else.
    "game-changers": TrophyIcon,
    "mass-land-denial": MapIcon,
    // Turns coming round again, which is what the rule is about.
    "extra-turns": ArrowPathIcon,
    // A chain link: pieces that only do something together.
    combos: LinkIcon,
};

/**
 * The properties for {@link DeckBracketMenu}
 */
export type DeckBracketMenuProps = {
    /** The brackets on offer, empty for a format that has none */
    brackets: Array<BracketRulesResponse>;
    /** Which bracket the deck claims, `null` when it claims none */
    bracket: number | null;
    /** What the deck holds for each of the bracket's four rules */
    counts: BracketCounts;
    /** Records a claimed bracket */
    onChange: (bracket: number | null) => void;
    /** Filters the deck view down to one rule's cards */
    onFocus: (focus: CardFocus) => void;
    /** Additional CSS classes for the trigger */
    className?: string;
};

/**
 * Everything about a deck's bracket, behind one button.
 *
 * The bar used to carry two controls for one subject: a Game Changers chip
 * that named the cards behind a single rule, and a picker that claimed a
 * bracket without saying whether the deck kept it. Neither could answer "does
 * this claim hold", because that question spans all four rules and the claim
 * at once — so they are one button and one menu, and the other three rules
 * stop being the only ones a reader has to go looking for.
 *
 * The button is the summary: the claim, and a mark for each rule the deck
 * actually plays into, amber as a whole when the claim does not hold. The menu
 * is the read-out: what the deck plays as, every rule kept or broken, and the
 * claim itself last, because it is the one thing here that writes anything.
 *
 * A rule with cards behind it filters the deck down to them, which is why the
 * menu takes {@link CardFocus} — the same handle the format's own remarks use.
 *
 * @returns the button and its menu
 */
export function DeckBracketMenu({ brackets, bracket, counts, onChange, onFocus, className }: DeckBracketMenuProps) {
    const [t] = useTranslation("deck");
    const labels = useDeckLabels();

    if (brackets.length === 0) return null;

    const claimed = brackets.find((rules) => rules.number === bracket);
    const plays = playedBracket(counts, brackets);
    // A deck that claims nothing is still read against something, or the menu
    // would have nothing to say at exactly the moment a reader opens it. The
    // detected bracket is what the deck would be claimed at, which makes every
    // row below read as "and here is why".
    const detected = detectedBracket(counts, brackets);
    const against = claimed ?? brackets.find((rules) => rules.number === detected);
    const checks = against === undefined ? [] : checkBracket(counts, against);
    // `plays` is null only for a format with no brackets at all, which never
    // reaches here — the ladder is known, so its top rung always fits.
    const fits = plays === null || claimed === undefined || plays <= claimed.number;
    const marks = checks.filter((check) => check.have > 0);

    return (
        <Dropdown>
            <DropdownButton
                plain={true}
                aria-label={
                    plays === null
                        ? t("label.bracket")
                        : `${claimed === undefined ? t("label.bracket-none") : `${t("label.bracket")} ${claimed.number}`} · ${t("label.plays-as-bracket", { number: plays })}`
                }
                className={clsx(
                    "shrink-0 gap-1.5 rounded-(--radius-control) px-2.5 py-1 text-xs font-medium ring-1",
                    // The text colours are forced: `plain` carries Catalyst's
                    // own `text-zinc-950 dark:text-white`, which is the same
                    // specificity as anything passed in here and wins on
                    // stylesheet order — the button would keep its amber
                    // ground and lose its amber lettering.
                    fits
                        ? "text-zinc-700! ring-zinc-950/10 dark:text-zinc-300! dark:ring-white/15"
                        : "bg-amber-500/10 text-amber-700! ring-amber-600/20 dark:text-amber-300! dark:ring-amber-400/25",
                    className,
                )}
            >
                <span className={"tabular-nums"}>
                    {claimed === undefined ? t("label.bracket-short-none") : `B${claimed.number}`}
                </span>
                {claimed !== undefined && <span className={"max-lg:sr-only"}>{labels.bracket(claimed.slug)}</span>}
                {/* What the deck plays into, without a word: a reader who
                    already knows the deck reads the marks and never opens the
                    menu. Divided off, because the claim to their left is a
                    statement and these are facts. */}
                {marks.length > 0 && (
                    <span className={"flex items-center gap-1 border-l border-current/25 pl-1.5"}>
                        {marks.map((check) => {
                            const Icon = RULE_ICONS[check.kind];
                            return (
                                <Icon
                                    key={check.kind}
                                    className={clsx(
                                        "size-3.5",
                                        check.kept
                                            ? "text-emerald-600! dark:text-emerald-400!"
                                            : "text-amber-600! dark:text-amber-400!",
                                    )}
                                />
                            );
                        })}
                    </span>
                )}
                <ChevronDownIcon className={"size-3.5 opacity-60"} />
            </DropdownButton>

            <DropdownMenu anchor={"bottom start"} className={"min-w-[min(22rem,calc(100vw-2rem))]"}>
                <DropdownSection>
                    <DropdownHeading>{t("label.bracket")}</DropdownHeading>
                    <DropdownItem>
                        {fits ? (
                            <CheckCircleIcon className={"text-emerald-600! dark:text-emerald-400!"} />
                        ) : (
                            <ExclamationTriangleIcon className={"text-amber-600! dark:text-amber-400!"} />
                        )}
                        <DropdownLabel>
                            {plays === null ? t("label.bracket-none") : t("label.plays-as-bracket", { number: plays })}
                        </DropdownLabel>
                        <DropdownDescription>
                            {claimed === undefined
                                ? t("description.bracket-unclaimed", {
                                      number: against?.number ?? "",
                                      name: against === undefined ? "" : labels.bracket(against.slug),
                                  })
                                : fits
                                  ? t("description.bracket-fits", { number: claimed.number })
                                  : t("description.bracket-broken", { number: claimed.number })}
                        </DropdownDescription>
                    </DropdownItem>
                    {/* Said out loud rather than left implied: while the graph
                        has not answered, the combo rule is missing from the
                        list below, and a verdict that hides what it could not
                        check is worse than no verdict. */}
                    {counts.combos === null && (
                        <DropdownItem disabled={true}>
                            <DropdownLabel className={"text-zinc-500 dark:text-zinc-400"}>
                                {t("description.bracket-unchecked")}
                            </DropdownLabel>
                        </DropdownItem>
                    )}
                </DropdownSection>

                {/* Every rule, kept ones included — "inside bracket 2" is the
                    more common answer and the one a list of complaints cannot
                    give. Order is fixed by BRACKET_RULE_KINDS so the rows sit
                    in the same place from deck to deck. */}
                <DropdownSection>
                    <DropdownDivider />
                    {BRACKET_RULE_KINDS.map((kind) => {
                        const check = checks.find((entry) => entry.kind === kind);
                        if (check === undefined) return null;
                        const Icon = RULE_ICONS[kind];
                        return (
                            <DropdownItem
                                key={kind}
                                disabled={check.have === 0}
                                onClick={() =>
                                    onFocus({ label: t(`label.rule-${kind}`), names: check.names, uuids: [] })
                                }
                            >
                                {/* Three states, not two. A rule the deck
                                    plays into and keeps is affirmed with a
                                    green tick; one it is over the line on
                                    keeps its own mark, in amber. A rule the
                                    deck holds nothing for is neither — there
                                    is nothing to affirm about a card that is
                                    not in the deck — so it keeps its mark and
                                    stays quiet. The colours are forced: the
                                    item paints its own icons zinc-500 through
                                    a parent selector no plain class beats. */}
                                {check.have === 0 ? (
                                    <Icon />
                                ) : check.kept ? (
                                    <CheckCircleIcon className={"text-emerald-600! dark:text-emerald-400!"} />
                                ) : (
                                    <Icon className={"text-amber-600! dark:text-amber-400!"} />
                                )}
                                <DropdownLabel
                                    className={clsx(
                                        !check.kept && "text-amber-700 dark:text-amber-300",
                                        "flex items-center gap-1.5",
                                    )}
                                >
                                    {t(`label.rule-${kind}`)}
                                    {kind === "extra-turns" && counts.chainsExtraTurns && (
                                        <span
                                            className={clsx(
                                                "rounded-sm px-1 text-[10px]/4 font-semibold tracking-wide uppercase",
                                                check.kept
                                                    ? "bg-zinc-950/[0.06] text-zinc-500 dark:bg-white/10 dark:text-zinc-400"
                                                    : "bg-amber-500/15 text-amber-700 dark:text-amber-300",
                                            )}
                                        >
                                            {t("label.extra-turns-chains")}
                                        </span>
                                    )}
                                </DropdownLabel>
                                <DropdownDescription>{ruleLabel(t, check, counts)}</DropdownDescription>
                            </DropdownItem>
                        );
                    })}
                </DropdownSection>

                {/* Last, because it is the only thing here that writes. */}
                <DropdownSection>
                    <DropdownDivider />
                    <DropdownHeading>{t("heading.bracket-claim")}</DropdownHeading>
                    <DropdownItem onClick={() => onChange(null)}>
                        {bracket === null ? <CheckCircleIcon /> : <span className={"size-4"} />}
                        <DropdownLabel>{t("label.bracket-none")}</DropdownLabel>
                    </DropdownItem>
                    {brackets.map((rules) => (
                        <DropdownItem key={rules.number} onClick={() => onChange(rules.number)}>
                            {bracket === rules.number ? <CheckCircleIcon /> : <span className={"size-4"} />}
                            <DropdownLabel>{`${rules.number} · ${labels.bracket(rules.slug)}`}</DropdownLabel>
                            {rules.number === plays && (
                                <DropdownDescription>{t("description.bracket-plays-as-this")}</DropdownDescription>
                            )}
                        </DropdownItem>
                    ))}
                </DropdownSection>
            </DropdownMenu>
        </Dropdown>
    );
}

/**
 * How one bracket rule reads against the deck, in a few words.
 *
 * The icon beside it already says kept or broken, so this says what is behind
 * that: the numbers where the bracket sets one, the cards themselves where it
 * plays none of something, and — for the two rules that climb in three steps —
 * which of the things the deck holds the rule is actually about.
 *
 * @param t the deck namespace's translate function
 * @param check the rule
 * @param counts what the deck holds
 *
 * @returns the label
 */
function ruleLabel(
    t: (key: string, options?: Record<string, unknown>) => string,
    check: BracketRuleCheck,
    counts: BracketCounts,
): string {
    if (check.have === 0) return t("description.rule-none");
    if (check.step === "any") return t("description.rule-any", { count: check.have });

    if (check.kind === "extra-turns" && check.step === "limited") {
        // The bracket seats the cards and only asks that they cannot follow
        // one another, so the count alone would say nothing about the rule.
        return counts.chainsExtraTurns
            ? t("description.rule-extra-turns-chain", { count: check.have })
            : t("description.rule-extra-turns-alone");
    }
    if (check.kind === "combos" && check.step === "limited") {
        return check.breaking > 0
            ? t("description.rule-combos-two-card", { count: check.breaking })
            : t("description.rule-combos-longer", { count: check.have });
    }

    if (check.allowed === 0) {
        return check.kept
            ? t("description.rule-none")
            : t("description.rule-none-broken", { count: check.have, cards: check.cards.join(", ") });
    }
    return t("description.rule-limit", { have: check.have, allowed: check.allowed });
}
