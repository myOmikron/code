import { createFileRoute, redirect, useNavigate, useRouter } from "@tanstack/react-router";
import { ArrowDownTrayIcon, BarsArrowDownIcon, BarsArrowUpIcon } from "@heroicons/react/20/solid";
import {
    Alert,
    AlertActions,
    AlertDescription,
    AlertTitle,
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
    notify,
} from "components";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import type { EntrySort, ListedEntryResponse } from "src/api/generated";
import { parseCardUrl, resolveCardUrl, resolvePrintings } from "src/utils/scryfall";
import type { Printing } from "src/utils/scryfall";
import { CardSearchPanel } from "src/components/card-search-panel";
import { CollectionEntryDialog } from "src/components/collection-entry-dialog";
import { CARD_VIEWS } from "src/components/card-view";
import type { CardView, CardViewProps } from "src/components/card-view";
import { CardViewGrid } from "src/components/card-view-grid";
import { CardViewLarge } from "src/components/card-view-large";
import { CardViewList } from "src/components/card-view-list";
import { CardViewTable } from "src/components/card-view-table";
import { ImportCollectionDialog } from "src/components/import-collection-dialog";
import { useEntryMutations } from "src/utils/use-entry-mutations";
import { pageWindow } from "src/utils/pagination";

/**
 * Stacks per page.
 *
 * The server caps what it hands out; this stays well below that. A page is
 * meant to be looked at, and sixty rows with artwork is already where a browser
 * starts to notice.
 */
const PAGE_SIZE = 60;

/** How long typing has to pause before a search reaches the url */
const SEARCH_DEBOUNCE_MS = 300;

/** The orders offered, and the key each is labelled with */
const SORTS: Array<{ value: EntrySort; key: string }> = [
    { value: "filed", key: "label.sort-filed" },
    { value: "name", key: "label.sort-name" },
    { value: "set", key: "label.sort-set" },
    { value: "rarity", key: "label.sort-rarity" },
    { value: "mana_value", key: "label.sort-mana-value" },
    { value: "unit_price", key: "label.sort-unit-price" },
    { value: "stack_value", key: "label.sort-stack-value" },
    { value: "quantity", key: "label.sort-quantity" },
    { value: "condition", key: "label.sort-condition" },
];

/**
 * Search params of the card list
 */
export type CollectionSearch = {
    /**
     * Which page to show, counted from one.
     *
     * Optional only so that [`Route.beforeLoad`] can recognise its absence and
     * redirect to an explicit `page=1`.
     */
    page?: number;
    /** What to order by */
    sort?: EntrySort;
    /** Whether to reverse that order */
    desc?: boolean;
    /** What to search the card names for */
    q?: string;
    /** How the cards are laid out */
    view?: CardView;
    /**
     * The stack whose dialog is open, by its id.
     *
     * In the url rather than in state so that the dialog is a place: the back
     * gesture closes it instead of leaving the collection, and a card can be
     * linked to. Opening one pushes a history entry; closing goes back over it.
     */
    card?: string;
};

export const Route = createFileRoute("/_menu/collections/$collectionUuid/_collection/cards")({
    validateSearch: (search: Record<string, unknown>): CollectionSearch => {
        // Anything that is not a whole page number counts as missing rather
        // than as an error: a mistyped link should still open the collection.
        const page = Number(search.page);
        return {
            page: Number.isInteger(page) && page >= 1 ? page : undefined,
            sort: SORTS.find((option) => option.value === search.sort)?.value,
            desc: search.desc === true || search.desc === "true" ? true : undefined,
            q: typeof search.q === "string" && search.q !== "" ? search.q : undefined,
            view: CARD_VIEWS.find((option) => option.value === search.view)?.value,
            card: typeof search.card === "string" && search.card !== "" ? search.card : undefined,
        };
    },

    // A redirect rather than a default in `validateSearch`, because a default
    // would only fill the value in memory and leave the address bar saying
    // nothing. `replace`, so the url without the parameter does not become a
    // station the back button stops at.
    beforeLoad: ({ params, search }) => {
        if (search.page === undefined) {
            throw redirect({
                to: "/collections/$collectionUuid/cards",
                params,
                search: { ...search, page: 1 },
                replace: true,
            });
        }
    },

    // Only what the query is built from. `view` and `card` live in the url as
    // well, but neither changes which stacks come back — listing them here
    // meant opening a card refetched the page and threw away where the reader
    // was on it.
    loaderDeps: ({ search }) => ({
        page: search.page,
        sort: search.sort,
        desc: search.desc,
        q: search.q,
    }),
    loader: ({ params, deps }) =>
        Api.collections.cards(params.collectionUuid, {
            limit: PAGE_SIZE,
            offset: ((deps.page ?? 1) - 1) * PAGE_SIZE,
            sort: deps.sort,
            descending: deps.desc,
            search: deps.q,
        }),

    component: RouteComponent,
});

/**
 * The cards filed in one collection, a page at a time.
 *
 * Sorting, filtering and paging all happen in the database, and the card data
 * arrives with the stacks. What used to be several thousand rows plus a
 * Scryfall lookup per card on top is now one request per page.
 *
 * @returns the page
 */
function RouteComponent() {
    const { collectionUuid } = Route.useParams();
    // `total` counts stacks, which is what pages are made of; `total_copies`
    // counts the cards in them, which is what the reader means by "how many".
    const { entries, total, total_copies: totalCopies } = Route.useLoaderData();
    const search = Route.useSearch();
    const router = useRouter();
    const navigate = useNavigate();
    const [t] = useTranslation("collection");
    const [tg] = useTranslation();

    const page = (search.page ?? 1) - 1;
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    const [confirming, setConfirming] = useState<ListedEntryResponse | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    const [dragOver, setDragOver] = useState(false);
    const [importing, setImporting] = useState(false);

    // Derived from the url, not held alongside it. A stack that disappears from
    // under the dialog — split, merged, deleted — therefore closes it, with no
    // second copy of the truth to keep in step.
    const inspecting = search.card === undefined ? null : (entries.find((entry) => entry.uuid === search.card) ?? null);
    // The full card, fetched only for the stack being looked at: rules text,
    // both faces and the large scan are not in the catalog, and pulling them
    // for sixty rows to show one would undo the point of the rewrite.
    const [inspected, setInspected] = useState<Printing | null>(null);
    // Held locally while typing, so the field does not lag a debounce behind
    // the keystrokes.
    const [query, setQuery] = useState(search.q ?? "");

    const mutations = useEntryMutations(collectionUuid);

    /**
     * Writes new search params, keeping the ones not mentioned
     *
     * @param next what to change
     * @param options how to navigate
     * @param options.replace whether to overwrite the current history entry
     * @param options.resetScroll whether to jump back to the top — wanted for a
     *        change that puts the reader somewhere else in the list, and not for
     *        one that leaves them where they were
     */
    function go(next: Partial<CollectionSearch>, options: { replace?: boolean; resetScroll?: boolean } = {}) {
        void navigate({
            to: "/collections/$collectionUuid/cards",
            params: { collectionUuid },
            search: (previous) => ({ ...previous, ...next }),
            replace: options.replace,
            resetScroll: options.resetScroll,
        });
    }

    // Typing narrows the list, so the page it was on may no longer exist. Back
    // to the first, and replaced rather than pushed — nobody wants the back
    // button to walk them through every prefix they typed.
    useEffect(() => {
        if (query === (search.q ?? "")) return;
        const timer = setTimeout(
            () => go({ q: query === "" ? undefined : query, page: 1 }, { replace: true }),
            SEARCH_DEBOUNCE_MS,
        );
        return () => clearTimeout(timer);
        // Deliberately not keyed on `go`: it is rebuilt every render and only
        // ever closes over this route's own params.
    }, [query, search.q]);

    // Deleting the last stack of a page leaves the url pointing past the end,
    // as does a hand-edited link.
    useEffect(() => {
        if (page > 0 && page >= pages) go({ page: pages }, { replace: true });
    }, [page, pages]);

    // The dialog shows one card in full, which the listing does not carry.
    useEffect(() => {
        if (inspecting === null) {
            setInspected(null);
            return;
        }
        let dropped = false;
        const printing = inspecting.printing;
        void resolvePrintings([printing]).then((resolved) => {
            if (!dropped) setInspected(resolved.get(printing) ?? null);
        });
        return () => {
            dropped = true;
        };
    }, [inspecting]);

    /**
     * Closes the card dialog
     *
     * Writes the url without the parameter rather than stepping back through
     * history. Going back is the tidier history, but the pop and the dialog
     * releasing its scroll lock restore the position against each other and the
     * list jumps. Replacing leaves the reader exactly where they were; the back
     * gesture still closes the dialog, because opening it pushed an entry of
     * its own.
     */
    function closeCard() {
        go({ card: undefined }, { replace: true, resetScroll: false });
    }

    /**
     * Re-runs the loader after a write that changed which stacks exist
     *
     * Anything edited but not written yet goes out first, or the loader would
     * read back values the user has already replaced on screen.
     *
     * @returns a promise resolving once the loader has finished
     */
    async function refresh() {
        await mutations.flush();
        await router.invalidate();
        mutations.reset();
    }

    /**
     * Files a printing into this collection.
     *
     * Asks the server whether an identical stack already exists rather than
     * looking through what is on screen: with one page in hand the twin is
     * usually elsewhere, and filing a second row for it would be the same pile
     * of cards written down twice.
     *
     * @param printing the printing to file
     */
    async function file(printing: Printing) {
        const existing = await Api.collections.cards(collectionUuid, {
            printing: printing.id,
            condition: "NearMint",
            finish: "Nonfoil",
            limit: 1,
        });

        const twin = existing.entries[0];
        if (twin !== undefined) {
            await Api.collections.entries.update(collectionUuid, twin.uuid, { quantity: twin.quantity + 1 });
        } else {
            await Api.collections.entries.add(collectionUuid, [
                {
                    printing: printing.id,
                    quantity: 1,
                    condition: "NearMint",
                    finish: "Nonfoil",
                    purchase_price_cents: null,
                    acquired_at: null,
                },
            ]);
        }

        notify.success(t("toast.card-filed", { name: printing.name }));
        await refresh();
    }

    /**
     * Reads a dropped Scryfall link and files the card it points at
     *
     * @param event the drop event
     */
    async function drop(event: React.DragEvent) {
        event.preventDefault();
        setDragOver(false);

        // Browsers put a dragged link on both types; `text/uri-list` may carry
        // several lines, of which only the first is the url.
        const payload = event.dataTransfer.getData("text/uri-list") || event.dataTransfer.getData("text/plain");
        const coordinate = parseCardUrl(payload.split("\n")[0] ?? "");
        if (coordinate === null) {
            notify.error(t("toast.not-a-card-link"));
            return;
        }

        const printing = await resolveCardUrl(coordinate);
        if (printing === null) {
            notify.error(t("toast.unknown-card-link"));
            return;
        }
        await file(printing);
    }

    /**
     * Records a new count for a stack, or asks to remove it when it hits zero
     *
     * @param entry the stack to change
     * @param quantity the count to show
     */
    function changeQuantity(entry: ListedEntryResponse, quantity: number) {
        if (quantity < 1) {
            setConfirming(entry);
            return;
        }
        mutations.edit(entry.uuid, { quantity });
    }

    /**
     * Another stack on this page holding the very same cards
     *
     * Only this page: the twin may well be elsewhere in the collection, and
     * hunting for it would cost a request every time a stack is opened. The
     * offer to merge is an opportunity, not a promise.
     *
     * @param entry the stack to find a twin for
     *
     * @returns the other stack, or `null`
     */
    function mergeableWith(entry: ListedEntryResponse): ListedEntryResponse | null {
        return (
            entries.find(
                (candidate) =>
                    candidate.uuid !== entry.uuid &&
                    candidate.printing === entry.printing &&
                    candidate.condition === entry.condition &&
                    candidate.finish === entry.finish,
            ) ?? null
        );
    }

    /**
     * Removes a stack after the confirmation was accepted
     *
     * @param entry the stack to remove
     */
    async function remove(entry: ListedEntryResponse) {
        setConfirming(null);
        setBusy(entry.uuid);
        await Api.collections.entries.delete(collectionUuid, entry.uuid);
        notify.success(t("toast.entry-deleted"));
        await refresh();
        setBusy(null);
    }

    const sort = search.sort ?? "filed";
    const view = search.view ?? "list";

    // Assembled once and handed to whichever view is on: the four differ in
    // what they draw, never in what they can do.
    const viewProps: CardViewProps = {
        entries: entries.map((entry) => mutations.resolve(entry)),
        onInspect: (entry) => go({ card: entry.uuid }, { resetScroll: false }),
        onChangeQuantity: changeQuantity,
        onDelete: setConfirming,
        busy,
        sort,
        descending: search.desc === true,
        // A header toggles direction when it is already the key, and otherwise
        // takes over as the key — the behaviour every sortable table has.
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
            <div className={"flex flex-wrap items-center justify-between gap-3"}>
                <Text>{tg("label.cards", { count: totalCopies, amount: totalCopies })}</Text>
                <Button outline={true} onClick={() => setImporting(true)}>
                    <ArrowDownTrayIcon />
                    {t("button.import")}
                </Button>
            </div>

            <CardSearchPanel onPick={(printing) => void file(printing)} />

            {/* Both write into the url, so a sorted and filtered view is a link
                — and the loader re-runs off the very same change. */}
            {/* Stacked on a phone, one row from `sm` up. Nothing in the row
                carries a minimum width: a flex item will not shrink below one,
                so a row that cannot wrap pushes the whole page sideways instead
                — which is exactly what a `min-w-48` on the search field did. */}
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
                            <ListboxOption key={option.value} value={option.value}>
                                <ListboxLabel>{t(option.key)}</ListboxLabel>
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
                    {/* Also a search param, so a link carries the way somebody
                        was looking at the collection and not just which cards. */}
                    <Listbox
                        value={view}
                        aria-label={t("label.view")}
                        onChange={(next) => go({ view: next === "list" ? undefined : next }, { resetScroll: false })}
                        className={"min-w-0 flex-1 sm:w-40 sm:flex-none"}
                    >
                        {CARD_VIEWS.map((option) => (
                            <ListboxOption key={option.value} value={option.value}>
                                <ListboxLabel>{t(option.key)}</ListboxLabel>
                            </ListboxOption>
                        ))}
                    </Listbox>
                </div>
            </div>

            <div
                onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "copy";
                    setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(event) => void drop(event)}
                className={
                    dragOver ? "rounded-lg outline-2 outline-offset-4 outline-blue-500 outline-dashed" : "rounded-lg"
                }
            >
                {total === 0 ? (
                    <EmptyState
                        title={search.q !== undefined ? t("heading.no-hits") : t("heading.no-entries")}
                        description={search.q !== undefined ? t("description.no-hits") : t("description.no-entries")}
                    />
                ) : (
                    <CardsView {...viewProps} />
                )}
            </div>

            {pages > 1 && (
                <div className={"flex flex-col gap-2"}>
                    <Pagination>
                        <PaginationPrevious
                            href={page > 0 ? "/collections/$collectionUuid/cards" : null}
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
                                        href={"/collections/$collectionUuid/cards"}
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
                            href={page + 1 < pages ? "/collections/$collectionUuid/cards" : null}
                            params={{ collectionUuid }}
                            search={{ ...search, page: page + 2 }}
                        >
                            {t("button.next-page")}
                        </PaginationNext>
                    </Pagination>
                    {/* The numbers are hidden below `sm`, so on a phone this is
                        the only thing saying where in the collection one is. */}
                    <Text className={"text-center text-xs sm:hidden"}>
                        {t("label.page-of", { page: page + 1, pages })}
                    </Text>
                </div>
            )}

            <CollectionEntryDialog
                entry={inspecting === null ? null : mutations.resolve(inspecting)}
                printing={inspected}
                collectionUuid={collectionUuid}
                mergeableWith={inspecting === null ? null : mergeableWith(inspecting)}
                onEdit={(edit) => inspecting !== null && mutations.edit(inspecting.uuid, edit)}
                flushEdits={mutations.flush}
                onStructureChanged={refresh}
                onClose={closeCard}
            />

            <ImportCollectionDialog
                open={importing}
                collectionUuid={collectionUuid}
                onClose={() => setImporting(false)}
                onImported={refresh}
            />

            <Alert open={confirming !== null} onClose={() => setConfirming(null)}>
                <AlertTitle>{t("heading.delete-entry")}</AlertTitle>
                <AlertDescription>
                    {t("description.delete-entry", {
                        name: confirming?.card?.name ?? t("label.unknown-printing"),
                    })}
                </AlertDescription>
                <AlertActions>
                    <Button plain onClick={() => setConfirming(null)}>
                        {tg("button.cancel")}
                    </Button>
                    <Button color={"red"} onClick={() => void (confirming && remove(confirming))}>
                        {t("button.delete-entry")}
                    </Button>
                </AlertActions>
            </Alert>
        </div>
    );
}
