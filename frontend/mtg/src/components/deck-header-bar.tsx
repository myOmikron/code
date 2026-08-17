import { CheckCircleIcon, ExclamationTriangleIcon, PlusIcon, TrophyIcon } from "@heroicons/react/20/solid";
import clsx from "clsx";
import {
    Dropdown,
    DropdownButton,
    DropdownDivider,
    DropdownHeading,
    DropdownItem,
    DropdownLabel,
    DropdownMenu,
    DropdownSection,
    PrimaryButton,
    Strong,
    Text,
} from "components";
import { useTranslation } from "react-i18next";
import type { BracketRulesResponse } from "src/api/generated";
import { useDeckLabels } from "src/components/deck-labels";
import { DeckViewControls } from "src/components/deck-view-controls";
import type { DeckView } from "src/components/deck-view-controls";
import { ManaCost } from "src/components/mana-cost";
import type { DeckGrouping, DeckSort } from "src/utils/deck-grouping";
import type { DeckLegality, DeckViolation } from "src/utils/deck-rules";

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
    /** Records a different layout */
    onChangeView: (view: DeckView) => void;
    /** Records a different grouping */
    onChangeGrouping: (grouping: DeckGrouping) => void;
    /** Records a different order */
    onChangeSort: (sort: DeckSort) => void;
    /** Opens the card search */
    onAdd: () => void;
    /** Opens the colour picker */
    onEditColors: () => void;
    /** Records a claimed bracket */
    onChangeBracket: (bracket: number | null) => void;
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
    onChangeView,
    onChangeGrouping,
    onChangeSort,
    onAdd,
    onEditColors,
    onChangeBracket,
}: DeckHeaderBarProps) {
    const [t] = useTranslation("deck");
    const labels = useDeckLabels();

    const remarks = legality.deck.length + (legality.slots.size > 0 ? 1 : 0);
    const clean = remarks === 0;
    const filled = target === null ? 1 : Math.min(1, legality.cards / target);
    const claimed = brackets.find((rules) => rules.number === bracket);

    return (
        <div
            className={
                "sticky top-0 z-10 -mx-2 flex flex-col gap-2 rounded-(--radius-card) bg-(--surface-card)/95 px-3 py-2.5 shadow-(--shadow-card-sm) ring-1 ring-zinc-950/5 backdrop-blur sm:-mx-4 sm:px-5 sm:py-3 dark:ring-white/10"
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
                            {clean ? (
                                <DropdownItem>
                                    <CheckCircleIcon />
                                    <DropdownLabel>{t("label.legal")}</DropdownLabel>
                                </DropdownItem>
                            ) : (
                                <>
                                    {legality.deck.map((violation) => (
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
                    </DropdownMenu>
                </Dropdown>
            </div>

            {/* Wraps, and the add button grows into whatever is left: on a phone
                the identity chips take the first line and the controls the
                second, instead of the button being pushed off the screen. */}
            <div className={"flex flex-wrap items-center gap-2"}>
                {legality.allowedColors.length > 0 && (
                    <button
                        type={"button"}
                        onClick={onEditColors}
                        aria-label={t("label.colors")}
                        title={t("label.colors")}
                        className={
                            "shrink-0 rounded-(--radius-control) px-1 py-1 hover:bg-zinc-950/5 dark:hover:bg-white/10"
                        }
                    >
                        <ManaCost value={legality.allowedColors.map((color) => `{${color}}`).join("")} />
                    </button>
                )}

                {legality.gameChangers.length > 0 && <GameChangers names={legality.gameChangers} />}

                {brackets.length > 0 && (
                    <Dropdown>
                        <DropdownButton outline={true} className={"shrink-0"} aria-label={t("label.bracket")}>
                            <span className={"tabular-nums"}>
                                {claimed === undefined ? t("label.bracket-short-none") : `B${claimed.number}`}
                            </span>
                            <span className={"max-lg:sr-only"}>
                                {claimed === undefined ? "" : labels.bracket(claimed.slug)}
                            </span>
                        </DropdownButton>
                        <DropdownMenu anchor={"bottom start"} className={"min-w-72"}>
                            <DropdownItem onClick={() => onChangeBracket(null)}>
                                {bracket === null ? <CheckCircleIcon /> : <span className={"size-4"} />}
                                <DropdownLabel>{t("label.bracket-none")}</DropdownLabel>
                            </DropdownItem>
                            <DropdownDivider />
                            {brackets.map((rules) => (
                                <DropdownItem key={rules.number} onClick={() => onChangeBracket(rules.number)}>
                                    {bracket === rules.number ? <CheckCircleIcon /> : <span className={"size-4"} />}
                                    <DropdownLabel>{`${rules.number} · ${labels.bracket(rules.slug)}`}</DropdownLabel>
                                </DropdownItem>
                            ))}
                        </DropdownMenu>
                    </Dropdown>
                )}

                <span className={"ml-auto flex flex-1 items-center justify-end gap-2 sm:flex-none"}>
                    <DeckViewControls
                        view={view}
                        grouping={grouping}
                        sort={sort}
                        onChangeView={onChangeView}
                        onChangeGrouping={onChangeGrouping}
                        onChangeSort={onChangeSort}
                    />
                    <PrimaryButton onClick={onAdd} className={"max-sm:flex-1"}>
                        <PlusIcon />
                        <span className={"max-[380px]:sr-only"}>{t("button.add-cards")}</span>
                        <kbd
                            className={
                                "ml-1 rounded border border-white/25 px-1 text-[0.625rem] font-medium text-white/80 max-lg:hidden"
                            }
                        >
                            A
                        </kbd>
                    </PrimaryButton>
                </span>
            </div>
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
        case "sideboard-size":
            return t("label.violation-sideboard", { have: violation.have, allowed: violation.allowed });
    }
}
