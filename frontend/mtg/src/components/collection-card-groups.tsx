import clsx from "clsx";
import type { CSSProperties, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { DeckTagResponse, EntryGrouping, GroupTotalResponse, ListedEntryResponse } from "src/api/generated";
import type { CardViewProps } from "src/components/card-view";
import { CardThumbnail } from "src/components/card-thumbnail";
import { CardViewGrid } from "src/components/card-view-grid";
import { CardViewList } from "src/components/card-view-list";
import { CardViewTable } from "src/components/card-view-table";
import { CONTEXT_MENU_TARGET, contextMenuTrigger } from "src/components/context-menu";
import { ACROSS, COLUMNS, GroupHeading } from "src/components/deck-card-grid";
import { useDeckLabels } from "src/components/deck-labels";
import { ManaCost } from "src/components/mana-cost";
import { artworkOf } from "src/utils/card-artwork";
import type { DeckTileSize, DeckView } from "src/utils/deck-view-settings";

/** One run of rows under one heading */
type Segment = {
    /** The group's key, as the server filed the rows */
    key: string;
    /** The rows of the group on this page */
    entries: Array<ListedEntryResponse>;
    /** How many copies the whole group holds, across every page */
    copies: number;
};

/**
 * Cuts a page into runs of rows under one heading
 *
 * The server hands the rows over already in group order, so a group is one
 * unbroken run; a stack listed under several tags simply sits in several.
 *
 * @param entries the rows of the page
 * @param groups the size of every group on the page
 *
 * @returns the runs, in reading order
 */
function segments(entries: Array<ListedEntryResponse>, groups: Array<GroupTotalResponse>): Array<Segment> {
    const runs: Array<Segment> = [];
    for (const entry of entries) {
        const key = entry.group ?? "";
        const last = runs.at(-1);
        if (last !== undefined && last.key === key) {
            last.entries.push(entry);
            continue;
        }
        const total = groups.find((group) => group.key === key);
        runs.push({ key, entries: [entry], copies: total?.copies ?? 0 });
    }
    return runs;
}

/**
 * The properties for {@link CollectionCardGroups}
 */
export type CollectionCardGroupsProps = CardViewProps & {
    /** How the cards are laid out */
    view: DeckView;
    /** How big the cards are drawn in the grid and the stacks */
    size: DeckTileSize;
    /** What the page is broken up by */
    grouping: EntryGrouping;
    /** The size of every group on the page, across all pages */
    groups: Array<GroupTotalResponse>;
};

/**
 * A page of a collection in the chosen layout, under group headings when grouped.
 *
 * The headings count the whole group, not the part of it the page holds, so a
 * group cut by the page break reads the same on both pages.
 *
 * @returns the page
 */
export function CollectionCardGroups({ view, size, grouping, groups, ...props }: CollectionCardGroupsProps) {
    const name = useGroupName(grouping, props.tags ?? []);

    if (grouping === "none") return <Layout view={view} size={size} {...props} />;

    const runs = segments(props.entries, groups);

    if (view === "stack") return <CardViewStacks runs={runs} size={size} name={name} {...props} />;

    return (
        <div className={"flex flex-col gap-8"}>
            {runs.map((run) => (
                <div key={run.key} className={"flex flex-col gap-3"}>
                    <GroupHeading commander={false} copies={run.copies}>
                        {name(run)}
                    </GroupHeading>
                    <Layout view={view} size={size} {...props} entries={run.entries} />
                </div>
            ))}
        </div>
    );
}

/**
 * One layout of rows without headings
 *
 * @returns the layout
 */
function Layout({ view, size, ...props }: CardViewProps & { view: DeckView; size: DeckTileSize }) {
    switch (view) {
        case "grid":
        case "stack":
            return <CardViewGrid {...props} size={size} />;
        case "list":
            return <CardViewList {...props} />;
        case "table":
            return <CardViewTable {...props} />;
    }
}

/**
 * What a group heading shows, per grouping
 *
 * @param grouping what the page is broken up by
 * @param tags the owner's card-wide tags
 *
 * @returns a function naming a run
 */
function useGroupName(grouping: EntryGrouping, tags: Array<DeckTagResponse>): (run: Segment) => ReactNode {
    const [t] = useTranslation("collection");
    const labels = useDeckLabels();

    return (run) => {
        switch (grouping) {
            case "type":
                return labels.type(run.key);
            case "mana_value":
                return labels.manaValue(run.key);
            case "color":
                if (run.key === "multicolor") return labels.multicolor();
                if (run.key === "colorless") return <ManaCost value={"{C}"} />;
                return <ManaCost value={`{${run.key}}`} />;
            case "set": {
                const card = run.entries[0]?.card;
                return card == null ? t("label.unknown-printing") : `${card.set_name} (${card.set_code})`;
            }
            case "tag":
                return tags.find((tag) => tag.uuid === run.key)?.name ?? t("label.untagged");
            case "none":
                return null;
        }
    };
}

/**
 * The properties for {@link CardViewStacks}
 */
type CardViewStacksProps = CardViewProps & {
    /** The runs of the page, one stack each */
    runs: Array<Segment>;
    /** How many stacks stand side by side, a step of the deck's size slider */
    size: DeckTileSize;
    /** What a run's heading shows */
    name: (run: Segment) => ReactNode;
};

/**
 * The page as columns of cards tucked under each other, one stack per group.
 *
 * Only the name band of every card shows, the way a pile on the table reads;
 * resting the pointer on a card slides the cards under it down and shows it
 * whole, and a click opens it.
 *
 * @returns the stacks
 */
function CardViewStacks({ runs, size, name, onInspect, onMenu, onActivate, selected }: CardViewStacksProps) {
    const [t] = useTranslation("collection");

    return (
        <div className={clsx("grid items-start", COLUMNS[size])} style={{ "--cards": ACROSS[size] } as CSSProperties}>
            {runs.map((run) => (
                <div key={run.key} className={"flex min-w-0 flex-col gap-3"}>
                    <GroupHeading commander={false} copies={run.copies}>
                        {name(run)}
                    </GroupHeading>
                    <ul className={"flex flex-col"}>
                        {run.entries.map((entry, index) => (
                            <li
                                key={entry.uuid}
                                onMouseEnter={() => onActivate?.(entry)}
                                className={clsx(
                                    "relative transition-[margin] [&:hover+li]:mt-0",
                                    index > 0 && "-mt-[124%]",
                                    selected === entry.uuid &&
                                        "rounded-(--radius-card) ring-2 ring-(--color-brand-500)",
                                    CONTEXT_MENU_TARGET,
                                )}
                                {...(onMenu === undefined ? {} : contextMenuTrigger((at) => onMenu(entry, at)))}
                            >
                                <button
                                    type={"button"}
                                    onClick={() => onInspect(entry)}
                                    className={"block w-full"}
                                    aria-label={t("accessibility.inspect-card", {
                                        name: entry.card?.name ?? t("label.unknown-printing"),
                                    })}
                                >
                                    <CardThumbnail
                                        name={entry.card?.name ?? ""}
                                        image={artworkOf(entry.card, "front").image}
                                        finish={entry.finish}
                                        className={"w-full rounded-lg"}
                                    />
                                </button>
                                {entry.quantity > 1 && (
                                    <span
                                        className={
                                            "absolute top-1.5 right-1.5 rounded-full bg-zinc-950/85 px-2 py-0.5 text-xs font-bold text-white tabular-nums shadow-lg ring-2 ring-white/75"
                                        }
                                    >
                                        ×{entry.quantity}
                                    </span>
                                )}
                            </li>
                        ))}
                    </ul>
                </div>
            ))}
        </div>
    );
}
