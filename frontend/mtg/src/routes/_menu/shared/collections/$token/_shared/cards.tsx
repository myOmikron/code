import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { BarsArrowDownIcon, BarsArrowUpIcon } from "@heroicons/react/20/solid";
import {
    Button,
    EmptyState,
    Input,
    Listbox,
    ListboxLabel,
    ListboxOption,
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
import type { EntrySort } from "src/api/generated";
import { resolvePrintings } from "src/utils/scryfall";
import { provisionalPrinting } from "src/utils/provisional-printing";
import type { Printing } from "src/utils/scryfall";
import { ConditionBadge, FinishBadge } from "src/components/card-attribute-badge";
import { CardDetailDialog } from "src/components/card-detail-dialog";
import { useCardLabels } from "src/components/card-labels";
import { CARD_VIEWS } from "src/components/card-view";
import type { CardView, CardViewProps } from "src/components/card-view";
import { CardViewGrid } from "src/components/card-view-grid";
import { CardViewLarge } from "src/components/card-view-large";
import { CardViewList } from "src/components/card-view-list";
import { CardViewTable } from "src/components/card-view-table";
import { pageWindow } from "src/utils/pagination";
import { isDeadShareLink } from "src/utils/share-link";

/** Stacks per page */
const PAGE_SIZE = 60;

/** How long typing has to pause before a search reaches the url */
const SEARCH_DEBOUNCE_MS = 300;

/**
 * The orders offered, in the order they are listed. Named by `useCardLabels`.
 *
 * Without the two that order by money: this is somebody else's collection, and
 * it is read without prices — see `redact_entry` on the other side.
 */
const SORTS: Array<EntrySort> = ["filed", "name", "set", "rarity", "mana_value", "quantity", "condition"];

/**
 * Search params of a shared collection's card list
 */
export type SharedCollectionSearch = {
    /** Which page to show, counted from one */
    page?: number;
    /** What to order by */
    sort?: EntrySort;
    /** Whether to reverse that order */
    desc?: boolean;
    /** What to search the card names for */
    q?: string;
    /** How the cards are laid out */
    view?: CardView;
    /** The stack whose dialog is open, by its id */
    card?: string;
};

export const Route = createFileRoute("/_menu/shared/collections/$token/_shared/cards")({
    validateSearch: (search: Record<string, unknown>): SharedCollectionSearch => {
        const page = Number(search.page);
        return {
            page: Number.isInteger(page) && page >= 1 ? page : undefined,
            sort: SORTS.find((option) => option === search.sort),
            desc: search.desc === true || search.desc === "true" ? true : undefined,
            q: typeof search.q === "string" && search.q !== "" ? search.q : undefined,
            view: CARD_VIEWS.find((option) => option === search.view),
            card: typeof search.card === "string" && search.card !== "" ? search.card : undefined,
        };
    },

    beforeLoad: ({ params, search }) => {
        if (search.page === undefined) {
            throw redirect({
                to: "/shared/collections/$token/cards",
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
        q: search.q,
    }),
    loader: async ({ params, deps }) => {
        try {
            return {
                page: await Api.shared.collections.cards(params.token, {
                    limit: PAGE_SIZE,
                    offset: ((deps.page ?? 1) - 1) * PAGE_SIZE,
                    sort: deps.sort,
                    descending: deps.desc,
                    search: deps.q,
                }),
            };
        } catch (error) {
            if (isDeadShareLink(error)) return { page: null };
            throw error;
        }
    },

    component: RouteComponent,
});

/**
 * The cards in a shared collection, a page at a time.
 *
 * @returns the page
 */
function RouteComponent() {
    const { token } = Route.useParams();
    const { page: listing } = Route.useLoaderData();
    const search = Route.useSearch();
    const navigate = useNavigate();
    const [t] = useTranslation("collection");
    const [tg] = useTranslation();
    const labels = useCardLabels();

    const page = (search.page ?? 1) - 1;
    const entries = listing?.entries ?? [];
    const total = listing?.total ?? 0;
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    const inspecting = search.card === undefined ? null : (entries.find((entry) => entry.uuid === search.card) ?? null);
    const [inspected, setInspected] = useState<Printing | null>(null);
    const [query, setQuery] = useState(search.q ?? "");

    /**
     * Writes new search params, keeping the ones not mentioned
     *
     * @param next what to change
     * @param options how to navigate
     * @param options.replace whether to overwrite the current history entry
     * @param options.resetScroll whether to jump back to the top
     */
    function go(next: Partial<SharedCollectionSearch>, options: { replace?: boolean; resetScroll?: boolean } = {}) {
        void navigate({
            to: "/shared/collections/$token/cards",
            params: { token },
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

    const sort = search.sort ?? "filed";
    const view = search.view ?? "list";

    const viewProps: CardViewProps = {
        entries,
        prices: false,
        onInspect: (entry) => go({ card: entry.uuid }, { resetScroll: false }),
        sort,
        descending: search.desc === true,
        onSort: (next, descending) =>
            go({ sort: next === "filed" ? undefined : next, desc: descending ? true : undefined, page: 1 }),
    };
    const CardsView = {
        grid: CardViewGrid,
        list: CardViewList,
        large: CardViewLarge,
        table: CardViewTable,
    }[view];

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
                <div className={"flex min-w-0 shrink items-center gap-2"}>
                    <Listbox
                        value={sort}
                        aria-label={t("label.sort")}
                        onChange={(next) => go({ sort: next === "filed" ? undefined : next, page: 1 })}
                        className={"min-w-0 flex-1 sm:w-44 sm:flex-none"}
                    >
                        {SORTS.map((option) => (
                            <ListboxOption key={option} value={option}>
                                <ListboxLabel>{labels.sort(option)}</ListboxLabel>
                            </ListboxOption>
                        ))}
                    </Listbox>
                    <Button
                        outline
                        aria-label={
                            search.desc === true
                                ? t("accessibility.sort-ascending")
                                : t("accessibility.sort-descending")
                        }
                        onClick={() => go({ desc: search.desc === true ? undefined : true, page: 1 })}
                    >
                        {search.desc === true ? <BarsArrowUpIcon /> : <BarsArrowDownIcon />}
                    </Button>
                    <Listbox
                        value={view}
                        aria-label={t("label.view")}
                        onChange={(next) => go({ view: next === "list" ? undefined : next }, { resetScroll: false })}
                        className={"min-w-0 flex-1 sm:w-40 sm:flex-none"}
                    >
                        {CARD_VIEWS.map((option) => (
                            <ListboxOption key={option} value={option}>
                                <ListboxLabel>{labels.view(option)}</ListboxLabel>
                            </ListboxOption>
                        ))}
                    </Listbox>
                </div>
            </div>

            {total === 0 ? (
                <EmptyState
                    title={search.q !== undefined ? t("heading.no-hits") : t("heading.no-entries")}
                    description={search.q !== undefined ? t("description.no-hits") : t("description.shared-empty")}
                />
            ) : (
                <CardsView {...viewProps} />
            )}

            {pages > 1 && (
                <div className={"flex flex-col gap-2"}>
                    <Pagination>
                        <PaginationPrevious
                            href={page > 0 ? "/shared/collections/$token/cards" : null}
                            params={{ token }}
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
                                        href={"/shared/collections/$token/cards"}
                                        params={{ token }}
                                        search={{ ...search, page: entry }}
                                        current={entry === page + 1}
                                    >
                                        {String(entry)}
                                    </PaginationPage>
                                ),
                            )}
                        </PaginationList>
                        <PaginationNext
                            href={page + 1 < pages ? "/shared/collections/$token/cards" : null}
                            params={{ token }}
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
                          ]
                }
                onClose={() => go({ card: undefined }, { replace: true, resetScroll: false })}
            />
        </div>
    );
}
