import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import {
    EmptyState,
    Input,
    Pagination,
    PaginationGap,
    PaginationList,
    PaginationNext,
    PaginationPage,
    PaginationPrevious,
    Text,
} from "components";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { resolvePrintings } from "src/utils/scryfall";
import { provisionalPrinting } from "src/utils/provisional-printing";
import type { Printing } from "src/utils/scryfall";
import { ConditionBadge, FinishBadge, SignedBadge } from "src/components/card-attribute-badge";
import { CardDetailDialog } from "src/components/card-detail-dialog";
import { useCardLabels } from "src/components/card-labels";
import type { CardViewProps } from "src/components/card-view";
import { CollectionCardGroups } from "src/components/collection-card-groups";
import { DeckViewControls } from "src/components/deck-view-controls";
import { DeckViewDialog } from "src/components/deck-view-dialog";
import {
    VISITOR_COLLECTION_GROUPINGS,
    VISITOR_COLLECTION_OFFER,
    VISITOR_COLLECTION_SORTS,
} from "src/utils/collection-view-settings";
import { DECK_VIEWS } from "src/utils/deck-view-settings";
import { useShortcuts } from "src/utils/use-shortcuts";
import { useShortcutHelpOpen } from "src/context/shortcut-help-context";
import { collectionViewSearch, useCollectionView } from "src/utils/use-collection-view";
import type { CollectionViewSearch } from "src/utils/use-collection-view";
import { pageWindow } from "src/utils/pagination";
import { isNotPublic } from "src/utils/public-page";

/** Stacks per page */
const PAGE_SIZE = 60;

/** How long typing has to pause before a search reaches the url */
const SEARCH_DEBOUNCE_MS = 300;

/**
 * Search params of a public collection's card list
 */
export type PublicCollectionSearch = CollectionViewSearch & {
    /** Which page to show, counted from one */
    page?: number;
    /** What to search the card names for */
    q?: string;
    /** The stack whose dialog is open, by its id */
    card?: string;
};

export const Route = createFileRoute("/_menu/global/collections/$collectionUuid/_collection/cards")({
    validateSearch: (search: Record<string, unknown>): PublicCollectionSearch => {
        const page = Number(search.page);
        return {
            page: Number.isInteger(page) && page >= 1 ? page : undefined,
            ...collectionViewSearch(search, VISITOR_COLLECTION_OFFER),
            q: typeof search.q === "string" && search.q !== "" ? search.q : undefined,
            card: typeof search.card === "string" && search.card !== "" ? search.card : undefined,
        };
    },

    beforeLoad: ({ params, search }) => {
        if (search.page === undefined) {
            throw redirect({
                to: "/global/collections/$collectionUuid/cards",
                params,
                search: { ...search, page: 1 },
                replace: true,
            });
        }
    },

    loaderDeps: ({ search }) => ({
        page: search.page,
        sort: search.sort,
        desc: search.desc,
        group: search.group,
        q: search.q,
    }),
    loader: async ({ params, deps }) => {
        try {
            return {
                page: await Api.explore.collections.cards(params.collectionUuid, {
                    limit: PAGE_SIZE,
                    offset: ((deps.page ?? 1) - 1) * PAGE_SIZE,
                    sort: deps.sort,
                    descending: deps.desc,
                    group: deps.group,
                    search: deps.q,
                }),
            };
        } catch (error) {
            if (isNotPublic(error)) return { page: null };
            throw error;
        }
    },

    component: RouteComponent,
});

/**
 * The cards in a collection somebody put on show, a page at a time.
 *
 * @returns the page
 */
function RouteComponent() {
    const { collectionUuid } = Route.useParams();
    const { page: listing } = Route.useLoaderData();
    const search = Route.useSearch();
    const navigate = useNavigate();
    const [t] = useTranslation("collection");
    const [tg] = useTranslation();
    const labels = useCardLabels();

    const page = (search.page ?? 1) - 1;
    const entries = listing?.entries ?? [];
    const total = listing?.total ?? 0;
    const pages = Math.max(1, Math.ceil((listing?.listed ?? 0) / PAGE_SIZE));

    const inspecting = search.card === undefined ? null : (entries.find((entry) => entry.uuid === search.card) ?? null);
    const [inspected, setInspected] = useState<Printing | null>(null);
    const [query, setQuery] = useState(search.q ?? "");
    const [choosing, setChoosing] = useState<"view" | "group" | null>(null);
    const shortcutHelpOpen = useShortcutHelpOpen();
    const [settings, changeView] = useCollectionView(search, VISITOR_COLLECTION_OFFER, go);

    /**
     * Writes new search params, keeping the ones not mentioned
     *
     * @param next what to change
     * @param options how to navigate
     * @param options.replace whether to overwrite the current history entry
     * @param options.resetScroll whether to jump back to the top
     */
    function go(next: Partial<PublicCollectionSearch>, options: { replace?: boolean; resetScroll?: boolean } = {}) {
        void navigate({
            to: "/global/collections/$collectionUuid/cards",
            params: { collectionUuid },
            search: { ...search, ...next },
            replace: options.replace,
            resetScroll: options.resetScroll,
        });
    }

    useEffect(() => {
        if (query === (search.q ?? "")) return;
        const timer = setTimeout(
            () => go({ q: query === "" ? undefined : query, page: 1 }, { replace: true }),
            SEARCH_DEBOUNCE_MS,
        );
        return () => clearTimeout(timer);
    }, [query, search.q]);

    useEffect(() => {
        if (page > 0 && page >= pages) go({ page: pages }, { replace: true });
    }, [page, pages]);

    // Opened on what the listing already carries and upgraded when Scryfall's
    // own record lands, see `provisionalPrinting`: the dialog opens on
    // `printing !== null`, so waiting for the lookup meant a click that did
    // nothing until the slowest of memory, disk and network answered.
    useEffect(() => {
        if (inspecting === null) {
            setInspected(null);
            return;
        }
        let dropped = false;
        const printing = inspecting.printing;
        setInspected(inspecting.card == null ? null : provisionalPrinting(printing, inspecting.card));
        void resolvePrintings([printing]).then((resolved) => {
            const found = resolved.get(printing);
            if (!dropped && found !== undefined) setInspected(found);
        });
        return () => {
            dropped = true;
        };
    }, [inspecting]);

    const { sort, view } = settings;
    const views = settings.group === "none" ? DECK_VIEWS.filter((option) => option !== "stack") : DECK_VIEWS;

    useShortcuts(
        {
            v: () => setChoosing("view"),
            g: () => setChoosing("group"),
            o: () => changeView({ descending: !settings.descending }),
        },
        inspecting === null && choosing === null && !shortcutHelpOpen,
    );

    const viewProps: CardViewProps = {
        entries,
        prices: false,
        onInspect: (entry) => go({ card: entry.uuid }, { resetScroll: false }),
        sort,
        descending: settings.descending,
        onSort: (next, descending) => changeView({ sort: next, descending }),
    };

    return (
        <div className={"flex flex-col gap-6"}>
            <Text>{tg("label.cards", { count: listing?.total_copies ?? 0, amount: listing?.total_copies ?? 0 })}</Text>

            <div className={"flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center"}>
                <Input
                    type={"search"}
                    value={query}
                    placeholder={t("label.filter-cards")}
                    aria-label={t("label.filter-cards")}
                    onChange={(event) => setQuery(event.target.value)}
                    className={"w-full min-w-0 sm:w-auto sm:flex-1 sm:basis-48"}
                />
                <DeckViewControls
                    view={view}
                    views={views}
                    size={settings.size}
                    grouping={settings.group}
                    groupings={{ options: VISITOR_COLLECTION_GROUPINGS, label: labels.grouping }}
                    sort={sort}
                    sorts={{ options: VISITOR_COLLECTION_SORTS, label: labels.sort }}
                    descending={settings.descending}
                    onChangeView={(next) => changeView({ view: next })}
                    onChangeSize={(next) => changeView({ size: next })}
                    onChangeGrouping={(next) => changeView({ group: next })}
                    onChangeSort={(next) => changeView({ sort: next })}
                    onChangeDescending={(next) => changeView({ descending: next })}
                />
            </div>

            {total === 0 ? (
                <EmptyState
                    title={search.q !== undefined ? t("heading.no-hits") : t("heading.no-entries")}
                    description={
                        search.q !== undefined ? t("description.no-hits") : t("description.collection-not-public")
                    }
                />
            ) : (
                <CollectionCardGroups
                    {...viewProps}
                    view={view}
                    size={settings.size}
                    grouping={settings.group}
                    groups={listing?.groups ?? []}
                />
            )}

            {pages > 1 && (
                <div className={"flex flex-col gap-2"}>
                    <Pagination>
                        <PaginationPrevious
                            href={page > 0 ? "/global/collections/$collectionUuid/cards" : null}
                            params={{ collectionUuid }}
                            search={{ ...search, page }}
                        >
                            {t("button.previous-page")}
                        </PaginationPrevious>
                        <PaginationList>
                            {pageWindow(page + 1, pages).map((entry, index) =>
                                entry === null ? (
                                    <PaginationGap key={`gap-${index}`} />
                                ) : (
                                    <PaginationPage
                                        key={entry}
                                        href={"/global/collections/$collectionUuid/cards"}
                                        params={{ collectionUuid }}
                                        search={{ ...search, page: entry }}
                                        current={entry === page + 1}
                                    >
                                        {String(entry)}
                                    </PaginationPage>
                                ),
                            )}
                        </PaginationList>
                        <PaginationNext
                            href={page + 1 < pages ? "/global/collections/$collectionUuid/cards" : null}
                            params={{ collectionUuid }}
                            search={{ ...search, page: page + 2 }}
                        >
                            {t("button.next-page")}
                        </PaginationNext>
                    </Pagination>
                    <Text className={"text-center text-xs sm:hidden"}>
                        {t("label.page-of", { page: page + 1, pages })}
                    </Text>
                </div>
            )}

            <DeckViewDialog
                choosing={choosing}
                view={view}
                views={views}
                grouping={settings.group}
                groupings={VISITOR_COLLECTION_GROUPINGS}
                groupingLabel={labels.grouping}
                onChangeView={(next) => changeView({ view: next })}
                onChangeGrouping={(next) => changeView({ group: next })}
                onClose={() => setChoosing(null)}
            />

            <CardDetailDialog
                printing={inspected}
                market={inspecting?.card ?? null}
                prices={false}
                finish={inspecting?.finish}
                details={
                    inspecting === null
                        ? []
                        : [
                              { label: t("label.quantity"), value: inspecting.quantity },
                              {
                                  label: t("label.condition"),
                                  value: <ConditionBadge condition={inspecting.condition} />,
                              },
                              { label: t("label.finish"), value: <FinishBadge finish={inspecting.finish} /> },
                              ...(inspecting.signed
                                  ? [{ label: tg("label.signed"), value: <SignedBadge signed={true} /> }]
                                  : []),
                          ]
                }
                onClose={() => go({ card: undefined }, { replace: true, resetScroll: false })}
            />
        </div>
    );
}
