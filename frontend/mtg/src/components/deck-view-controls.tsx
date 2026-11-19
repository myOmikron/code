import {
    AdjustmentsHorizontalIcon,
    ArchiveBoxIcon,
    BarsArrowDownIcon,
    CheckIcon,
    ListBulletIcon,
    RectangleStackIcon,
    Squares2X2Icon,
    TableCellsIcon,
    ViewColumnsIcon,
} from "@heroicons/react/20/solid";
import { Dropdown, DropdownButton, DropdownDivider, DropdownItem, DropdownLabel, DropdownMenu } from "components";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { useDeckLabels } from "src/components/deck-labels";
import { DECK_GROUPINGS, DECK_SORTS } from "src/utils/deck-grouping";
import type { DeckGrouping, DeckSort } from "src/utils/deck-grouping";
import { DECK_TILE_SIZES, DECK_VIEWS } from "src/utils/deck-view-settings";
import type { DeckTileSize, DeckView } from "src/utils/deck-view-settings";

// Kept as re-exports so existing card-grid and route imports stay stable.
export { DECK_TILE_SIZES, DECK_VIEWS };
export type { DeckTileSize, DeckView };

/** The size a phone fits two cards in a row at */
const TWO_COLUMNS: DeckTileSize = "xs";

/** The size a phone shows one card at a time at */
const ONE_COLUMN: DeckTileSize = "m";

/**
 * The properties for {@link DeckViewControls}
 */
export type DeckViewControlsProps<Grouping extends string = DeckGrouping, Sort extends string = DeckSort> = {
    /** How the cards are laid out */
    view: DeckView;
    /** What the list is broken up by */
    grouping: Grouping;
    /** What the cards inside a group are ordered by */
    sort: Sort;
    /** How big the cards are drawn, only used by the grid */
    size: DeckTileSize;
    /** Records a different layout */
    onChangeView: (view: DeckView) => void;
    /** Records a different card size */
    onChangeSize: (size: DeckTileSize) => void;
    /** Records a different grouping */
    onChangeGrouping: (grouping: Grouping) => void;
    /** Records a different order */
    onChangeSort: (sort: Sort) => void;
    /** Whether the cards carry the Physical deck's marks */
    physical?: boolean;
    /** Turns the Physical deck's marks on or off, absent where the reader may not see the Physical deck */
    onChangePhysical?: (physical: boolean) => void;
    /** The layouts on offer, the deck's four unless said otherwise */
    views?: Array<DeckView>;
    /** The groupings on offer with their names, the deck's unless said otherwise */
    groupings?: { options: Array<Grouping>; label: (grouping: Grouping) => string };
    /** The orders on offer with their names, the deck's unless said otherwise */
    sorts?: { options: Array<Sort>; label: (sort: Sort) => string };
    /** Whether the order is reversed, left out where it cannot be */
    descending?: boolean;
    /** Reverses the order or puts it back, left out where it cannot be */
    onChangeDescending?: (descending: boolean) => void;
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
export function DeckViewControls<Grouping extends string = DeckGrouping, Sort extends string = DeckSort>({
    view,
    grouping,
    sort,
    size,
    onChangeView,
    onChangeSize,
    onChangeGrouping,
    onChangeSort,
    physical,
    onChangePhysical,
    views = DECK_VIEWS,
    groupings,
    sorts,
    descending,
    onChangeDescending,
}: DeckViewControlsProps<Grouping, Sort>) {
    const [t] = useTranslation("deck");
    const labels = useDeckLabels();
    const groupingOptions = groupings ?? {
        options: DECK_GROUPINGS as Array<string> as Array<Grouping>,
        label: (option: Grouping) => labels.grouping(option as string as DeckGrouping),
    };
    const sortOptions = sorts ?? {
        options: DECK_SORTS as Array<string> as Array<Sort>,
        label: (option: Sort) => labels.sort(option as string as DeckSort),
    };

    return (
        <span className={"flex items-center gap-2"}>
            <span
                className={
                    "flex items-center rounded-(--radius-control) bg-zinc-950/5 p-0.5 ring-1 ring-zinc-950/5 dark:bg-white/10 dark:ring-white/10"
                }
            >
                {views.map((option) => (
                    <button
                        key={option}
                        type={"button"}
                        aria-pressed={view === option}
                        aria-label={t(`label.view-${option}`)}
                        title={t(`label.view-${option}`)}
                        onClick={() => onChangeView(option)}
                        className={clsx(
                            "rounded-[calc(var(--radius-control)-0.125rem)] p-1.5 transition",
                            view === option
                                ? "bg-(--surface-card) text-zinc-950 shadow-(--shadow-card-sm) dark:text-white"
                                : "text-zinc-500 hover:text-lime-700 dark:text-zinc-400 dark:hover:text-lime-300",
                        )}
                    >
                        {option === "grid" && <Squares2X2Icon className={"size-4"} />}
                        {option === "stack" && <RectangleStackIcon className={"size-4"} />}
                        {option === "list" && <ListBulletIcon className={"size-4"} />}
                        {option === "table" && <TableCellsIcon className={"size-4"} />}
                    </button>
                ))}
                {onChangePhysical !== undefined && (
                    <>
                        <span className={"mx-0.5 h-4 w-px bg-zinc-950/10 dark:bg-white/15"} />
                        <button
                            type={"button"}
                            aria-pressed={physical === true}
                            aria-label={t("accessibility.physical-marks")}
                            title={t("accessibility.physical-marks")}
                            onClick={() => onChangePhysical(physical !== true)}
                            className={clsx(
                                "flex items-center gap-1 rounded-[calc(var(--radius-control)-0.125rem)] p-1.5 text-xs transition",
                                physical === true
                                    ? "bg-(--surface-card) text-zinc-950 shadow-(--shadow-card-sm) dark:text-white"
                                    : "text-zinc-500 hover:text-lime-700 dark:text-zinc-400 dark:hover:text-lime-300",
                            )}
                        >
                            <ArchiveBoxIcon className={"size-4"} />
                            <span className={"max-sm:sr-only"}>{t("label.physical")}</span>
                        </button>
                    </>
                )}
            </span>

            {/* A phone has no room for the slider, and only two of its steps
                mean anything at that width: one card across or two. */}
            {(view === "grid" || view === "stack") && (
                <span
                    className={
                        "flex items-center rounded-(--radius-control) bg-zinc-950/5 p-0.5 ring-1 ring-zinc-950/5 sm:hidden dark:bg-white/10 dark:ring-white/10"
                    }
                >
                    {[ONE_COLUMN, TWO_COLUMNS].map((option) => (
                        <button
                            key={option}
                            type={"button"}
                            aria-pressed={size === option}
                            aria-label={option === TWO_COLUMNS ? t("label.columns-two") : t("label.columns-one")}
                            title={option === TWO_COLUMNS ? t("label.columns-two") : t("label.columns-one")}
                            onClick={() => onChangeSize(option)}
                            className={clsx(
                                "rounded-[calc(var(--radius-control)-0.125rem)] p-1.5 transition",
                                size === option
                                    ? "bg-(--surface-card) text-zinc-950 shadow-(--shadow-card-sm) dark:text-white"
                                    : "text-zinc-500 hover:text-lime-700 dark:text-zinc-400 dark:hover:text-lime-300",
                            )}
                        >
                            {option === TWO_COLUMNS ? (
                                <ViewColumnsIcon className={"size-4"} />
                            ) : (
                                <Squares2X2Icon className={"size-4"} />
                            )}
                        </button>
                    ))}
                </span>
            )}

            {(view === "grid" || view === "stack") && (
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
                    <span className={"max-sm:sr-only"}>{groupingOptions.label(grouping)}</span>
                </DropdownButton>
                <DropdownMenu anchor={"bottom end"}>
                    {groupingOptions.options.map((option) => (
                        <DropdownItem key={option} onClick={() => onChangeGrouping(option)}>
                            {grouping === option ? <CheckIcon /> : <span className={"size-4"} />}
                            <DropdownLabel>{groupingOptions.label(option)}</DropdownLabel>
                        </DropdownItem>
                    ))}
                    <DropdownDivider />
                    {sortOptions.options.map((option) => (
                        <DropdownItem key={option} onClick={() => onChangeSort(option)}>
                            {sort === option ? <CheckIcon /> : <span className={"size-4"} />}
                            <DropdownLabel>{sortOptions.label(option)}</DropdownLabel>
                        </DropdownItem>
                    ))}
                    {onChangeDescending !== undefined && (
                        <>
                            <DropdownDivider />
                            <DropdownItem onClick={() => onChangeDescending(descending !== true)}>
                                {descending === true ? <CheckIcon /> : <BarsArrowDownIcon />}
                                <DropdownLabel>{t("label.descending")}</DropdownLabel>
                            </DropdownItem>
                        </>
                    )}
                </DropdownMenu>
            </Dropdown>
        </span>
    );
}
