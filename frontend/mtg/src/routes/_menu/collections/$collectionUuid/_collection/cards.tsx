import { createFileRoute, redirect, useLoaderData, useNavigate, useRouter } from "@tanstack/react-router";
import { ArrowUpTrayIcon, MinusIcon, PlusIcon, TrashIcon } from "@heroicons/react/20/solid";
import {
    Alert,
    AlertActions,
    AlertDescription,
    AlertTitle,
    Badge,
    Button,
    EmptyState,
    Pagination,
    PaginationGap,
    PaginationList,
    PaginationNext,
    PaginationPage,
    PaginationPrevious,
    StackedList,
    StackedListFlexRow,
    Strong,
    Text,
    notify,
} from "components";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import type { CollectionEntryResponse } from "src/api/generated";
import { formatCurrency } from "src/utils/format";
import { cachedPrintings, parseCardUrl, resolveCardUrl, resolvePrintings } from "src/utils/scryfall";
import type { Printing } from "src/utils/scryfall";
import { CardSearchPanel } from "src/components/card-search-panel";
import { CollectionEntryDialog } from "src/components/collection-entry-dialog";
import { ConditionBadge, FinishBadge } from "src/components/card-attribute-badge";
import { ImportCollectionDialog } from "src/components/import-collection-dialog";
import { useEntryMutations } from "src/utils/use-entry-mutations";
import { pageWindow } from "src/utils/pagination";

/**
 * Stacks per page.
 *
 * An imported collection runs to five figures of rows, and a browser asked to
 * lay out eleven thousand list items with an image each stops responding. This
 * is the number that keeps a page cheap to render and, not by accident, close
 * to what one `/cards/collection` request resolves at a time.
 */
const PAGE_SIZE = 60;

/**
 * How long paging has to settle before the cards on it are looked up.
 *
 * Clicking through pages faster than this fires no request at all for the ones
 * passed over. That is no longer about the rate limit — the shared scheduler
 * holds that on its own — but about queueing: forty skipped pages would be
 * forty requests ahead of the one actually being looked at.
 *
 * Kept short, because this delay is also the blank stretch on a page whose
 * cards are not in memory yet.
 */
const LOOKUP_DEBOUNCE_MS = 120;

/**
 * Search params of the card list
 */
export type CollectionSearch = {
    /**
     * Which page of the list to show, counted from one.
     *
     * Counted the way the pager labels it rather than the way the array is
     * sliced, because this number is in the url and a link to "page 3" should
     * lead to the page that calls itself 3.
     *
     * Optional only to give [`Route.beforeLoad`] something to recognise: a
     * missing or unusable value arrives here as `undefined` and is redirected
     * to an explicit `page=1`, so every url that ends up on screen names the
     * page it shows.
     */
    page?: number;
};

export const Route = createFileRoute("/_menu/collections/$collectionUuid/_collection/cards")({
    validateSearch: (search: Record<string, unknown>): CollectionSearch => {
        // Anything that is not a whole page number — a word, a fraction, a
        // negative — counts as missing rather than as an error: a mistyped link
        // should still open the collection.
        const page = Number(search.page);
        return { page: Number.isInteger(page) && page >= 1 ? page : undefined };
    },

    // Done as a redirect rather than by defaulting in `validateSearch`, because
    // a default would only fill the value in memory and leave the address bar
    // saying nothing. `replace`, so the url without the parameter does not
    // become a station the back button stops at.
    beforeLoad: ({ params, search }) => {
        if (search.page === undefined) {
            throw redirect({
                to: "/collections/$collectionUuid/cards",
                params,
                search: { page: 1 },
                replace: true,
            });
        }
    },

    component: RouteComponent,
});

/**
 * The cards filed in one collection, with the stacks editable in place.
 *
 * Card names and artwork are resolved against Scryfall rather than stored: the
 * collection only keeps printing ids, and a printing's name never changes.
 *
 * @returns the page
 */
function RouteComponent() {
    const { collectionUuid } = Route.useParams();
    const { entries } = useLoaderData({ from: "/_menu/collections/$collectionUuid/_collection" });
    const router = useRouter();
    const [t] = useTranslation("collection");
    const [tg] = useTranslation();

    // The page lives in the url, not in state, so a page can be linked to and
    // the back button steps through the pages that were actually looked at.
    const { page: pageParam } = Route.useSearch();
    const navigate = useNavigate();
    const page = (pageParam ?? 1) - 1;

    const [resolved, setResolved] = useState(0);
    // Which set of cards has been looked up. Compared against the page on
    // screen during the render rather than kept as a boolean flipped from an
    // effect: a flag set in an effect is a render too late, so turning the page
    // drew one frame that still believed the *previous* lookup was finished —
    // and every unresolved row on it claimed to be an unknown printing.
    const [settled, setSettled] = useState("");
    const [confirming, setConfirming] = useState<CollectionEntryResponse | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    const [dragOver, setDragOver] = useState(false);
    const [inspecting, setInspecting] = useState<CollectionEntryResponse | null>(null);
    const [importing, setImporting] = useState(false);

    // Edits are held locally and written once the clicking stops — a round trip
    // plus a loader re-run before a number moves makes the page feel broken.
    const mutations = useEntryMutations(collectionUuid);

    /**
     * Puts a page of the list on screen by writing it into the url
     *
     * @param next the page to show, counted from zero
     * @param replace whether to overwrite the current history entry instead of
     *        adding one — for corrections the user did not ask for
     */
    function showPage(next: number, replace = false) {
        void navigate({
            to: "/collections/$collectionUuid/cards",
            params: { collectionUuid },
            search: { page: next + 1 },
            replace,
        });
    }

    /**
     * The stack as it should be shown — the loader's row with local edits over it
     *
     * @param entry the stack as the loader knows it
     *
     * @returns the stack as the user last left it
     */
    const shown = (entry: CollectionEntryResponse) => mutations.resolve(entry);

    /**
     * The count to show for a stack
     *
     * @param entry the stack
     *
     * @returns the count
     */
    const quantityOf = (entry: CollectionEntryResponse) => shown(entry).quantity;

    const pages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
    const visible = useMemo(() => entries.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [entries, page]);

    // Read straight out of the module cache during the render, rather than kept
    // in state and filled from an effect. Coming back to a collection whose
    // cards are already known then paints them in the first frame instead of
    // showing a page of grey boxes until an effect has run. `resolved` only
    // exists to ask for that render again once a lookup has finished.
    // `resolved` is in the dependencies on purpose and unused in the body: it is
    // the signal that the module cache has grown, which is the other input here.
    const printings = useMemo(() => cachedPrintings(visible.map((entry) => entry.printing)), [visible, resolved]);

    // Identifies the page's cards, so "have these been looked up" is a question
    // answerable during the render that shows them.
    const wantedKey = useMemo(() => visible.map((entry) => entry.printing).join(","), [visible]);
    const looking = settled !== wantedKey;

    useEffect(() => {
        const wanted = visible.map((entry) => entry.printing);
        if (wanted.every((id) => printings.has(id))) {
            setSettled(wantedKey);
            return;
        }

        let dropped = false;
        const timer = setTimeout(() => {
            void resolvePrintings(wanted).then(() => {
                // A page turned before the answer arrived must not pull the
                // older one back on screen — answers come in no fixed order.
                if (dropped) return;
                setResolved((count) => count + 1);
                setSettled(wantedKey);
            });
        }, LOOKUP_DEBOUNCE_MS);

        return () => {
            dropped = true;
            clearTimeout(timer);
        };
        // Deliberately not keyed on `printings`: it is read above to decide
        // whether anything is missing, but listing it would re-run this on its
        // own result.
    }, [visible, wantedKey]);

    // Deleting the last stack of a page leaves the url pointing past the end,
    // as does a hand-edited link. Corrected with `replace`, because the page
    // that no longer exists is not somewhere the back button should return to.
    useEffect(() => {
        if (page > 0 && page >= pages) showPage(pages - 1, true);
        // Deliberately not keyed on `showPage`: it is rebuilt every render but
        // only ever closes over this route's own params, which cannot change
        // while the route is mounted.
    }, [page, pages]);

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
        // The loader is the truth again, so the locally remembered edits have
        // nothing left to correct.
        mutations.reset();
    }

    /**
     * Files a printing into this collection.
     *
     * An identical stack is incremented rather than duplicated: two rows for the
     * same printing in the same condition and finish would be the same pile of
     * cards written down twice.
     *
     * @param printing the printing to file
     */
    async function file(printing: Printing) {
        const existing = entries.find(
            (entry) => entry.printing === printing.id && entry.condition === "NearMint" && entry.finish === "Nonfoil",
        );
        if (existing !== undefined) {
            changeQuantity(existing, quantityOf(existing) + 1);
            notify.success(t("toast.card-filed", { name: printing.name }));
            return;
        }

        // A new stack has to exist server-side before it can be shown, so this
        // branch does wait for the round trip.
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
     * Only touches local state; {@link FLUSH_DELAY_MS} later the change is
     * written, so a burst of clicks costs one request instead of one each.
     *
     * @param entry the stack to change
     * @param quantity the count to show
     */
    function changeQuantity(entry: CollectionEntryResponse, quantity: number) {
        if (quantity < 1) {
            setConfirming(entry);
            return;
        }
        mutations.edit(entry.uuid, { quantity });
    }

    /**
     * Another stack holding the very same cards, if the collection has one
     *
     * Compared against what the loader holds rather than against the edited
     * copies: merging happens server-side, so what may be offered is what the
     * server would agree is interchangeable, not what the screen shows.
     *
     * @param entry the stack to find a twin for
     *
     * @returns the other stack, or `null` when this one stands alone
     */
    function mergeableWith(entry: CollectionEntryResponse): CollectionEntryResponse | null {
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
    async function remove(entry: CollectionEntryResponse) {
        setConfirming(null);
        setBusy(entry.uuid);
        await Api.collections.entries.delete(collectionUuid, entry.uuid);
        notify.success(t("toast.entry-deleted"));
        await refresh();
        setBusy(null);
    }

    const total = entries.reduce((sum, entry) => sum + quantityOf(entry), 0);

    return (
        <div className={"flex flex-col gap-6"}>
            <div className={"flex items-center justify-between gap-4"}>
                <Text>{tg("label.cards", { count: total, amount: total })}</Text>
                <Button outline={true} onClick={() => setImporting(true)}>
                    <ArrowUpTrayIcon />
                    {t("button.import")}
                </Button>
            </div>

            <CardSearchPanel onPick={(printing) => void file(printing)} />

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
                {entries.length === 0 ? (
                    <EmptyState title={t("heading.no-entries")} description={t("description.no-entries")} />
                ) : (
                    <StackedList>
                        {visible.map((row) => {
                            // Everything below reads the edited stack, so a
                            // condition changed in the dialog is on the row
                            // before the write has even gone out.
                            const entry = shown(row);
                            const printing = printings.get(entry.printing);
                            // While the lookup is still out the row stays blank
                            // rather than announcing itself: the answer usually
                            // arrives within a frame or two, and a placeholder
                            // that appears and vanishes again is worse than the
                            // gap it fills. "Unknown printing" is only claimed
                            // once the lookup that would have found it is done.
                            const name = printing?.name ?? (looking ? "" : t("label.unknown-printing"));
                            return (
                                <StackedListFlexRow key={entry.uuid} className={"gap-4"}>
                                    <button
                                        type={"button"}
                                        disabled={printing === undefined}
                                        aria-label={t("accessibility.inspect-card", {
                                            // A blank accessible name helps nobody — the
                                            // flicker this avoids is a visual one.
                                            name: printing?.name ?? t("label.unknown-printing"),
                                        })}
                                        onClick={() => setInspecting(row)}
                                        className={"shrink-0 rounded transition hover:opacity-80"}
                                    >
                                        {printing?.imageUrl !== undefined && printing?.imageUrl !== null ? (
                                            <img
                                                src={printing.imageUrl}
                                                crossOrigin={"anonymous"}
                                                alt={printing.name}
                                                loading={"lazy"}
                                                // The ratio is on the image itself, not just on
                                                // the fallback: an unloaded `<img>` has no
                                                // intrinsic size, so `w-auto` resolved to zero
                                                // and the row snapped sideways the moment the
                                                // file arrived. The background makes the
                                                // reserved box read as a placeholder.
                                                className={
                                                    "aspect-5/7 h-16 w-auto rounded bg-zinc-200 object-cover dark:bg-zinc-700"
                                                }
                                            />
                                        ) : (
                                            <div className={"aspect-5/7 h-16 rounded bg-zinc-200 dark:bg-zinc-700"} />
                                        )}
                                    </button>
                                    <div className={"flex min-w-0 flex-1 flex-col gap-1.5"}>
                                        {/* Scryfall may not know the printing — a `delete` migration
                                            retires ids. The row still has to render. */}
                                        <button
                                            type={"button"}
                                            disabled={printing === undefined}
                                            onClick={() => setInspecting(row)}
                                            className={"min-w-0 text-left"}
                                        >
                                            <Strong className={"block truncate hover:underline"}>{name}</Strong>
                                        </button>
                                        {printing !== undefined && (
                                            <Text className={"text-xs"}>
                                                {printing.setName} · {printing.setCode} #{printing.collectorNumber}
                                            </Text>
                                        )}
                                        <div className={"flex flex-wrap items-center gap-2"}>
                                            <ConditionBadge condition={entry.condition} />
                                            <FinishBadge finish={entry.finish} />
                                            {printing?.priceEur !== undefined && printing?.priceEur !== null && (
                                                <Badge color={"green"}>
                                                    {formatCurrency(printing.priceEur * entry.quantity)}
                                                </Badge>
                                            )}
                                        </div>
                                    </div>
                                    <div className={"flex shrink-0 items-center gap-1"}>
                                        <Button
                                            plain
                                            aria-label={t("accessibility.decrease-quantity")}
                                            onClick={() => changeQuantity(entry, entry.quantity - 1)}
                                        >
                                            <MinusIcon className={"size-4"} />
                                        </Button>
                                        <Strong className={"w-8 text-center tabular-nums"}>{entry.quantity}</Strong>
                                        <Button
                                            plain
                                            aria-label={t("accessibility.increase-quantity")}
                                            onClick={() => changeQuantity(entry, entry.quantity + 1)}
                                        >
                                            <PlusIcon className={"size-4"} />
                                        </Button>
                                        <Button
                                            plain
                                            disabled={busy === entry.uuid}
                                            aria-label={t("accessibility.delete-entry")}
                                            onClick={() => setConfirming(row)}
                                        >
                                            <TrashIcon className={"size-5"} />
                                        </Button>
                                    </div>
                                </StackedListFlexRow>
                            );
                        })}
                    </StackedList>
                )}
            </div>

            {pages > 1 && (
                <div className={"flex flex-col gap-2"}>
                    {/* Real links, not click handlers: the page is in the url, so
                        a page number can be opened in a new tab, and hovering one
                        already pulls the loader (`defaultPreload: "intent"`). */}
                    <Pagination>
                        <PaginationPrevious
                            href={page > 0 ? "/collections/$collectionUuid/cards" : null}
                            params={{ collectionUuid }}
                            search={{ page }}
                        >
                            {t("button.previous-page")}
                        </PaginationPrevious>
                        <PaginationList>
                            {pageWindow(page + 1, pages).map((entry, index) =>
                                entry === null ? (
                                    // Nothing but position identifies a gap, and
                                    // the list is rebuilt whenever the page moves.
                                    <PaginationGap key={`gap-${index}`} />
                                ) : (
                                    <PaginationPage
                                        key={entry}
                                        href={"/collections/$collectionUuid/cards"}
                                        params={{ collectionUuid }}
                                        search={{ page: entry }}
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
                            search={{ page: page + 2 }}
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
                entry={inspecting === null ? null : shown(inspecting)}
                printing={inspecting !== null ? (printings.get(inspecting.printing) ?? null) : null}
                collectionUuid={collectionUuid}
                mergeableWith={inspecting === null ? null : mergeableWith(inspecting)}
                onEdit={(edit) => inspecting !== null && mutations.edit(inspecting.uuid, edit)}
                flushEdits={mutations.flush}
                onStructureChanged={refresh}
                onClose={() => setInspecting(null)}
            />

            <ImportCollectionDialog
                open={importing}
                collectionUuid={collectionUuid}
                entries={entries}
                onClose={() => setImporting(false)}
                onImported={refresh}
            />

            <Alert open={confirming !== null} onClose={() => setConfirming(null)}>
                <AlertTitle>{t("heading.delete-entry")}</AlertTitle>
                <AlertDescription>
                    {t("description.delete-entry", {
                        name:
                            (confirming !== null ? printings.get(confirming.printing)?.name : undefined) ??
                            t("label.unknown-printing"),
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
