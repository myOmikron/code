import {
    CheckCircleIcon,
    ExclamationTriangleIcon,
    MagnifyingGlassIcon,
    PlusIcon,
    TagIcon,
    TrophyIcon,
    UserGroupIcon,
    XMarkIcon,
} from "@heroicons/react/20/solid";
import clsx from "clsx";
import {
    Dropdown,
    DropdownButton,
    DropdownDescription,
    DropdownHeading,
    DropdownItem,
    DropdownLabel,
    DropdownMenu,
    DropdownSection,
    Input,
    InputGroup,
    PrimaryButton,
    Strong,
    Text,
} from "components";
import type { Ref } from "react";
import { useTranslation } from "react-i18next";
import type { BracketRulesResponse } from "src/api/generated";
import { DeckBracketPicker } from "src/components/deck-bracket-picker";
import { useDeckLabels } from "src/components/deck-labels";
import { DeckViewControls } from "src/components/deck-view-controls";
import type { DeckTileSize, DeckView } from "src/components/deck-view-controls";
import { ManaCost } from "src/components/mana-cost";
import type { DeckGrouping, DeckSort } from "src/utils/deck-grouping";
import type { BracketRuleCheck, DeckLegality, DeckViolation, HouseRule } from "src/utils/deck-rules";
import { checkBracket, playedBracket } from "src/utils/deck-rules";

/**
 * The properties for {@link DeckHeaderBar}
 */
export type DeckHeaderBarProps = {
    /** What the format and the bracket have to say about the deck */
    legality: DeckLegality;
    /** What the deck is built for */
    format: string;
    /** How many cards the format wants, `null` when it names no number */
    target: number | null;
    /** The Commander brackets, empty for a format that has none */
    brackets: Array<BracketRulesResponse>;
    /** Which bracket the deck claims, `null` when it claims none */
    bracket: number | null;
    /** How the cards are laid out */
    view: DeckView;
    /** What the list is broken up by */
    grouping: DeckGrouping;
    /** What the cards inside a group are ordered by */
    sort: DeckSort;
    /** How big the cards are drawn */
    size: DeckTileSize;
    /** Whether the search within the deck is visible */
    searchOpen: boolean;
    /** The card name being searched for */
    searchQuery: string;
    /** Opens and focuses the search within the deck */
    onOpenSearch: () => void;
    /** Changes the search within the deck */
    onChangeSearch: (query: string) => void;
    /** Closes and clears the search within the deck */
    onCloseSearch: () => void;
    /** Records a different layout */
    onChangeView: (view: DeckView) => void;
    /** Records a different card size */
    onChangeSize: (size: DeckTileSize) => void;
    /** Records a different grouping */
    onChangeGrouping: (grouping: DeckGrouping) => void;
    /** Records a different order */
    onChangeSort: (sort: DeckSort) => void;
    /** Opens the card search */
    onAdd: () => void;
    /** Opens the house rules, colours included */
    onEditRuleZero: () => void;
    /** Opens the tag manager */
    onManageTags: () => void;
    /** Records a claimed bracket */
    onChangeBracket: (bracket: number | null) => void;
    /** The bar itself, for a page that has to know how much room it takes */
    ref?: Ref<HTMLDivElement>;
    /** The search field, so its keyboard shortcut can focus it */
    searchRef?: Ref<HTMLInputElement>;
};

/**
 * Where the deck stands, and everything it takes to change that.
 *
 * Two lines that hold their shape on a phone: the stand on top, the deck's
 * identity and the controls below it. Nothing wraps into a wall, because the
 * things that are set rarely — colours, bracket, grouping — sit behind one tap
 * each, and the two that are used constantly, adding a card and switching the
 * layout, are always one tap away.
 *
 * @returns the bar
 */
export function DeckHeaderBar({
    legality,
    format,
    target,
    brackets,
    bracket,
    view,
    grouping,
    sort,
    size,
    searchOpen,
    searchQuery,
    onOpenSearch,
    onChangeSearch,
    onCloseSearch,
    onChangeView,
    onChangeSize,
    onChangeGrouping,
    onChangeSort,
    onAdd,
    onEditRuleZero,
    onManageTags,
    ref,
    searchRef,
    onChangeBracket,
}: DeckHeaderBarProps) {
    const [t] = useTranslation("deck");
    const labels = useDeckLabels();

    const remarks = legality.deck.length + (legality.slots.size > 0 ? 1 : 0);
    const clean = remarks === 0;
    const filled = target === null ? 1 : Math.min(1, legality.cards / target);
    const claimed = brackets.find((rules) => rules.number === bracket);
    // The bracket's rules are read out in their own section, kept ones
    // included, so the format section keeps only what the format itself asks.
    const formatViolations = legality.deck.filter((violation) => !isBracketViolation(violation));
    const bracketChecks = claimed === undefined ? [] : checkBracket(legality, claimed);
    const plays = playedBracket(legality, brackets);

    return (
        <div
            ref={ref}
            className={
                "sticky top-0 z-20 flex flex-col gap-2 rounded-(--radius-card) bg-zinc-200/90 px-3 py-2.5 shadow-(--shadow-card-md) ring-1 ring-zinc-950/10 backdrop-blur-xl sm:px-5 sm:py-3 dark:bg-zinc-800/90 dark:ring-white/15"
            }
        >
            <div className={"flex items-center gap-3"}>
                <span className={"flex shrink-0 items-baseline gap-1"}>
                    <Strong className={"text-xl tabular-nums sm:text-2xl"}>{legality.cards}</Strong>
                    {target !== null && <Text className={"text-xs sm:text-sm"}>{`/ ${target}`}</Text>}
                </span>

                {/* The strip is the deck stand, read without reading: full and
                    green means the count is exactly right. */}
                <span className={"h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-zinc-950/5 dark:bg-white/10"}>
                    <span
                        className={clsx(
                            "block h-full rounded-full transition-[width]",
                            target !== null && legality.cards === target
                                ? "bg-(--color-success)"
                                : target !== null && legality.cards > target
                                  ? "bg-amber-500"
                                  : "bg-(--color-brand-500)",
                        )}
                        style={{ width: `${filled * 100}%` }}
                    />
                </span>

                <Dropdown>
                    <DropdownButton
                        plain={true}
                        aria-label={clean ? t("label.legal") : t("label.remarks", { count: remarks })}
                        className={clsx(
                            "shrink-0 rounded-(--radius-pill) px-2.5 py-1 text-xs font-medium ring-1",
                            clean
                                ? "bg-emerald-500/10 text-emerald-700 ring-emerald-600/20 dark:text-emerald-300 dark:ring-emerald-400/25"
                                : "bg-amber-500/10 text-amber-700 ring-amber-600/20 dark:text-amber-300 dark:ring-amber-400/25",
                        )}
                    >
                        {clean ? (
                            <CheckCircleIcon className={"size-4"} />
                        ) : (
                            <ExclamationTriangleIcon className={"size-4"} />
                        )}
                        <span className={"max-sm:sr-only"}>
                            {clean ? t("label.legal") : t("label.remarks", { count: remarks })}
                        </span>
                    </DropdownButton>
                    <DropdownMenu anchor={"bottom end"} className={"min-w-72"}>
                        <DropdownSection>
                            <DropdownHeading>{labels.format(format)}</DropdownHeading>
                            {formatViolations.length === 0 && legality.slots.size === 0 ? (
                                <DropdownItem>
                                    <CheckCircleIcon />
                                    <DropdownLabel>{t("label.legal")}</DropdownLabel>
                                </DropdownItem>
                            ) : (
                                <>
                                    {formatViolations.map((violation) => (
                                        <DropdownItem key={violation.kind}>
                                            <ExclamationTriangleIcon />
                                            <DropdownLabel>{deckViolationLabel(t, violation)}</DropdownLabel>
                                        </DropdownItem>
                                    ))}
                                    {legality.slots.size > 0 && (
                                        <DropdownItem>
                                            <ExclamationTriangleIcon />
                                            <DropdownLabel>
                                                {t("label.cards-with-remarks", { count: legality.slots.size })}
                                            </DropdownLabel>
                                        </DropdownItem>
                                    )}
                                </>
                            )}
                        </DropdownSection>

                        {/* What the deck plays as, against what it claims. Every
                            rule is read out, kept or broken: "inside bracket 2"
                            is the more common answer and the one a list of
                            complaints cannot give. */}
                        {brackets.length > 0 && (
                            <DropdownSection>
                                <DropdownHeading>{t("label.bracket")}</DropdownHeading>
                                <DropdownItem>
                                    {plays !== null && (claimed === undefined || plays <= claimed.number) ? (
                                        <CheckCircleIcon />
                                    ) : (
                                        <ExclamationTriangleIcon />
                                    )}
                                    <DropdownLabel>
                                        {plays === null
                                            ? t("label.bracket-none")
                                            : t("label.plays-as-bracket", { number: plays })}
                                    </DropdownLabel>
                                    {/* Said out loud rather than left implied:
                                        two-card combos are a bracket rule this
                                        band cannot read, and a verdict that
                                        hides what it could not check is worse
                                        than no verdict. */}
                                    <DropdownDescription>{t("description.bracket-unchecked")}</DropdownDescription>
                                </DropdownItem>
                                {bracketChecks.map((check) => (
                                    <DropdownItem key={check.kind}>
                                        {check.kept ? <CheckCircleIcon /> : <ExclamationTriangleIcon />}
                                        <DropdownLabel>{t(`label.rule-${check.kind}`)}</DropdownLabel>
                                        <DropdownDescription>{bracketRuleLabel(t, check)}</DropdownDescription>
                                    </DropdownItem>
                                ))}
                            </DropdownSection>
                        )}

                        {/* What the table agreed to, stated rather than
                            silenced. These are not faults — the chip above
                            counts remarks and this section is not one, which is
                            why a fully covered deck still reads as legal. */}
                        {legality.houseRules.length > 0 && (
                            <DropdownSection>
                                <DropdownHeading>{t("label.house-rules")}</DropdownHeading>
                                {legality.houseRules.map((rule) => (
                                    <DropdownItem key={rule.kind}>
                                        <UserGroupIcon />
                                        <DropdownLabel>{houseRuleLabel(t, rule)}</DropdownLabel>
                                    </DropdownItem>
                                ))}
                            </DropdownSection>
                        )}
                    </DropdownMenu>
                </Dropdown>
            </div>

            {/* Wraps, and the add button grows into whatever is left: on a phone
                the identity chips take the first line and the controls the
                second, instead of the button being pushed off the screen. */}
            <div className={"flex flex-wrap items-center gap-2"}>
                {/* Drawn for every deck, colourless ones included: this is one
                    of the two ways into the house rules, and a deck with no
                    commander yet is exactly the deck whose colours somebody is
                    about to claim by hand. */}
                <button
                    type={"button"}
                    onClick={onEditRuleZero}
                    aria-label={t("label.colors")}
                    title={t("label.colors")}
                    className={
                        "shrink-0 rounded-(--radius-control) px-1 py-1 hover:bg-zinc-950/5 dark:hover:bg-white/10"
                    }
                >
                    <ManaCost
                        value={
                            legality.allowedColors.length === 0
                                ? "{C}"
                                : legality.allowedColors.map((color) => `{${color}}`).join("")
                        }
                    />
                </button>

                {legality.gameChangers.length > 0 && <GameChangers names={legality.gameChangers} />}

                <DeckBracketPicker
                    brackets={brackets}
                    bracket={bracket}
                    onChange={onChangeBracket}
                    className={"shrink-0"}
                />

                <span
                    className={
                        "ml-auto flex w-full basis-full flex-wrap items-center justify-end gap-2 sm:w-auto sm:flex-none sm:basis-auto sm:flex-nowrap"
                    }
                >
                    <button
                        type={"button"}
                        onClick={onOpenSearch}
                        aria-label={t("label.search-cards")}
                        title={t("label.search-cards")}
                        className={clsx(
                            "shrink-0 rounded-(--radius-control) p-1.5 transition hover:bg-zinc-950/5 hover:text-zinc-950 dark:hover:bg-white/10 dark:hover:text-white",
                            searchOpen
                                ? "text-(--color-brand-600) dark:text-(--color-brand-300)"
                                : "text-zinc-500 dark:text-zinc-400",
                        )}
                    >
                        <MagnifyingGlassIcon className={"size-5"} />
                    </button>
                    <button
                        type={"button"}
                        onClick={onManageTags}
                        aria-label={t("button.manage-tags")}
                        title={t("button.manage-tags")}
                        className={
                            "shrink-0 rounded-(--radius-control) p-1.5 text-zinc-500 transition hover:bg-zinc-950/5 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white"
                        }
                    >
                        <TagIcon className={"size-5"} />
                    </button>
                    <DeckViewControls
                        view={view}
                        grouping={grouping}
                        sort={sort}
                        size={size}
                        onChangeView={onChangeView}
                        onChangeSize={onChangeSize}
                        onChangeGrouping={onChangeGrouping}
                        onChangeSort={onChangeSort}
                    />
                    <PrimaryButton onClick={onAdd} className={"max-sm:flex-1"}>
                        <PlusIcon />
                        <span className={"max-sm:sr-only"}>{t("button.add-cards")}</span>
                    </PrimaryButton>
                </span>
            </div>

            {searchOpen && (
                <div className={"flex items-center gap-2"}>
                    <InputGroup className={"min-w-0 flex-1"}>
                        <MagnifyingGlassIcon />
                        <Input
                            ref={searchRef}
                            type={"search"}
                            autoFocus={true}
                            value={searchQuery}
                            aria-label={t("label.search-cards")}
                            placeholder={t("label.search-cards")}
                            onChange={(event) => onChangeSearch(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key !== "Escape") return;
                                event.preventDefault();
                                onCloseSearch();
                            }}
                        />
                    </InputGroup>
                    <button
                        type={"button"}
                        onClick={onCloseSearch}
                        aria-label={t("button.close-search")}
                        title={t("button.close-search")}
                        className={
                            "shrink-0 rounded-(--radius-control) p-1.5 text-zinc-500 transition hover:bg-zinc-950/5 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white"
                        }
                    >
                        <XMarkIcon className={"size-5"} />
                    </button>
                </div>
            )}
        </div>
    );
}

/**
 * The properties for {@link GameChangers}
 */
type GameChangersProps = {
    /** The Game Changers in the deck, by name */
    names: Array<string>;
};

/**
 * How many of the listed cards are in the deck, and which ones.
 *
 * A menu rather than a hover panel: the count answers the bracket, the names
 * answer what to cut, and a phone has no hover to answer either with.
 *
 * @returns the chip
 */
function GameChangers({ names }: GameChangersProps) {
    const [t] = useTranslation("deck");

    return (
        <Dropdown>
            <DropdownButton
                plain={true}
                aria-label={t("label.game-changers", { count: names.length })}
                className={
                    "shrink-0 rounded-(--radius-pill) bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-700 ring-1 ring-amber-600/20 dark:text-amber-300 dark:ring-amber-400/25"
                }
            >
                <TrophyIcon className={"size-4"} />
                <span className={"tabular-nums"}>{names.length}</span>
                <span className={"max-lg:sr-only"}>{t("label.game-changers-short")}</span>
            </DropdownButton>
            <DropdownMenu anchor={"bottom start"} className={"min-w-64"}>
                <DropdownSection>
                    <DropdownHeading>{t("label.game-changers", { count: names.length })}</DropdownHeading>
                    {names.map((name) => (
                        <DropdownItem key={name}>
                            <DropdownLabel>{name}</DropdownLabel>
                        </DropdownItem>
                    ))}
                </DropdownSection>
            </DropdownMenu>
        </Dropdown>
    );
}

/**
 * Whether a remark is the bracket's business rather than the format's
 *
 * @param violation the remark
 *
 * @returns whether the bracket section already draws it
 */
function isBracketViolation(violation: DeckViolation): boolean {
    return (
        violation.kind === "game-changers" || violation.kind === "mass-land-denial" || violation.kind === "extra-turns"
    );
}

/**
 * How one bracket rule reads against the deck, in a few words.
 *
 * The icon beside it already says kept or broken, so this says the numbers —
 * except where the bracket plays none of something at all, where the cards
 * themselves are the answer to "what now".
 *
 * @param t the deck namespace's translate function
 * @param check the rule
 *
 * @returns the label
 */
function bracketRuleLabel(
    t: (key: string, options?: Record<string, unknown>) => string,
    check: BracketRuleCheck,
): string {
    if (check.allowed === null) return t("description.rule-any", { count: check.have });
    if (check.allowed === 0) {
        return check.kept
            ? t("description.rule-none")
            : t("description.rule-none-broken", { count: check.have, cards: check.cards.join(", ") });
    }
    return t("description.rule-limit", { have: check.have, allowed: check.allowed });
}

/**
 * What is wrong with the deck as a whole, in a few words
 *
 * @param t the deck namespace's translate function
 * @param violation the remark
 *
 * @returns the label
 */
function deckViolationLabel(
    t: (key: string, options?: Record<string, unknown>) => string,
    violation: DeckViolation,
): string {
    switch (violation.kind) {
        case "deck-size":
            return violation.exact
                ? t("label.violation-size-exact", { have: violation.have, want: violation.want })
                : t("label.violation-size-least", { have: violation.have, want: violation.want });
        case "commander-count":
            return t("label.violation-commander", { have: violation.have, min: violation.min, max: violation.max });
        case "game-changers":
            return t("label.violation-game-changers", { have: violation.have, allowed: violation.allowed });
        // The cards are named rather than counted: which ones they are is the
        // whole of the decision the reader has to make about them.
        case "mass-land-denial":
            return t("label.violation-mass-land-denial", {
                count: violation.cards.length,
                cards: violation.cards.join(", "),
            });
        case "extra-turns":
            return t("label.violation-extra-turns", {
                count: violation.cards.length,
                cards: violation.cards.join(", "),
            });
        case "sideboard-size":
            return t("label.violation-sideboard", { have: violation.have, allowed: violation.allowed });
    }
}

/**
 * What one agreed deviation is covering, in a few words.
 *
 * Written the way the format's remarks are written, minus the alarm: the same
 * facts, said as a statement about the deck rather than as a complaint about
 * it.
 *
 * @param t the deck namespace's translate function
 * @param rule the agreement
 *
 * @returns the label
 */
function houseRuleLabel(t: (key: string, options?: Record<string, unknown>) => string, rule: HouseRule): string {
    switch (rule.kind) {
        // A claim of no colours at all is a claim, so it is spelled the way
        // every other colourless thing here is spelled rather than left blank.
        case "colors":
            return t("label.house-rule-colors", { colors: rule.colors === "" ? "C" : rule.colors });
        case "commanders":
            return t("label.house-rule-commanders", { have: rule.have });
        // Named rather than counted, for the same reason the bracket's rules
        // name their cards: which ones they are is the whole of the agreement.
        case "duplicates":
            return t("label.house-rule-duplicates", { count: rule.cards.length, cards: rule.cards.join(", ") });
        case "banned":
            return t("label.house-rule-banned", { count: rule.cards.length, cards: rule.cards.join(", ") });
        case "deck-size":
            return t("label.house-rule-deck-size", { cards: rule.want });
    }
}
