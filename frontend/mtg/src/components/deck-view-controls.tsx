import { AdjustmentsHorizontalIcon, CheckIcon, ListBulletIcon, Squares2X2Icon } from "@heroicons/react/20/solid";
import { Dropdown, DropdownButton, DropdownDivider, DropdownItem, DropdownLabel, DropdownMenu } from "components";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { useDeckLabels } from "src/components/deck-labels";
import { DECK_GROUPINGS, DECK_SORTS } from "src/utils/deck-grouping";
import type { DeckGrouping, DeckSort } from "src/utils/deck-grouping";

/** How the deck's cards are laid out */
export type DeckView = "list" | "grid";

/** The views on offer, in the order they are listed */
export const DECK_VIEWS: Array<DeckView> = ["grid", "list"];

/** How big the cards are drawn in the grid */
export type DeckTileSize = "xs" | "s" | "m" | "l" | "xl";

/** The sizes on offer, from smallest to largest */
export const DECK_TILE_SIZES: Array<DeckTileSize> = ["xs", "s", "m", "l", "xl"];

/**
 * The properties for {@link DeckViewControls}
 */
export type DeckViewControlsProps = {
    /** How the cards are laid out */
    view: DeckView;
    /** What the list is broken up by */
    grouping: DeckGrouping;
    /** What the cards inside a group are ordered by */
    sort: DeckSort;
    /** How big the cards are drawn, only used by the grid */
    size: DeckTileSize;
    /** Records a different layout */
    onChangeView: (view: DeckView) => void;
    /** Records a different card size */
    onChangeSize: (size: DeckTileSize) => void;
    /** Records a different grouping */
    onChangeGrouping: (grouping: DeckGrouping) => void;
    /** Records a different order */
    onChangeSort: (sort: DeckSort) => void;
};

/**
 * How the deck is laid out: two buttons and one menu.
 *
 * The layout is a segmented pair rather than a dropdown, because switching
 * between pictures and rows is the one control that is used constantly and it
 * should cost a single tap. Grouping and order share a menu below it: both are
 * set rarely, and three dropdowns side by side filled a phone's screen before
 * a single card was visible.
 *
 * @returns the controls
 */
export function DeckViewControls({
    view,
    grouping,
    sort,
    size,
    onChangeView,
    onChangeSize,
    onChangeGrouping,
    onChangeSort,
}: DeckViewControlsProps) {
    const [t] = useTranslation("deck");
    const labels = useDeckLabels();

    return (
        <span className={"flex items-center gap-2"}>
            <span
                className={
                    "flex items-center rounded-(--radius-control) bg-zinc-950/5 p-0.5 ring-1 ring-zinc-950/5 dark:bg-white/10 dark:ring-white/10"
                }
            >
                {DECK_VIEWS.map((option) => (
                    <button
                        key={option}
                        type={"button"}
                        aria-pressed={view === option}
                        aria-label={option === "grid" ? t("label.view-grid") : t("label.view-list")}
                        title={option === "grid" ? t("label.view-grid") : t("label.view-list")}
                        onClick={() => onChangeView(option)}
                        className={clsx(
                            "rounded-[calc(var(--radius-control)-0.125rem)] p-1.5 transition",
                            view === option
                                ? "bg-(--surface-card) text-zinc-950 shadow-(--shadow-card-sm) dark:text-white"
                                : "text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white",
                        )}
                    >
                        {option === "grid" ? (
                            <Squares2X2Icon className={"size-4"} />
                        ) : (
                            <ListBulletIcon className={"size-4"} />
                        )}
                    </button>
                ))}
            </span>

            {view === "grid" && (
                <input
                    type={"range"}
                    min={0}
                    max={DECK_TILE_SIZES.length - 1}
                    step={1}
                    value={DECK_TILE_SIZES.indexOf(size)}
                    aria-label={t("label.card-size")}
                    title={t("label.card-size")}
                    onChange={(event) => onChangeSize(DECK_TILE_SIZES[Number(event.target.value)] ?? "m")}
                    className={"h-1 w-20 cursor-pointer accent-(--color-accent) max-sm:hidden"}
                />
            )}

            <Dropdown>
                <DropdownButton outline={true} aria-label={t("label.arrange")}>
                    <AdjustmentsHorizontalIcon />
                    <span className={"max-sm:sr-only"}>{labels.grouping(grouping)}</span>
                </DropdownButton>
                <DropdownMenu anchor={"bottom end"}>
                    {DECK_GROUPINGS.map((option) => (
                        <DropdownItem key={option} onClick={() => onChangeGrouping(option)}>
                            {grouping === option ? <CheckIcon /> : <span className={"size-4"} />}
                            <DropdownLabel>{labels.grouping(option)}</DropdownLabel>
                        </DropdownItem>
                    ))}
                    <DropdownDivider />
                    {DECK_SORTS.map((option) => (
                        <DropdownItem key={option} onClick={() => onChangeSort(option)}>
                            {sort === option ? <CheckIcon /> : <span className={"size-4"} />}
                            <DropdownLabel>{labels.sort(option)}</DropdownLabel>
                        </DropdownItem>
                    ))}
                </DropdownMenu>
            </Dropdown>
        </span>
    );
}
