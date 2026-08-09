import { createFileRoute, useLoaderData, useRouter } from "@tanstack/react-router";
import {
    ArrowUpTrayIcon,
    ChevronLeftIcon,
    ChevronRightIcon,
    MinusIcon,
    PlusIcon,
    TrashIcon,
} from "@heroicons/react/20/solid";
import {
    Alert,
    AlertActions,
    AlertDescription,
    AlertTitle,
    Badge,
    Button,
    EmptyState,
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
import { parseCardUrl, resolveCardUrl, resolvePrintings } from "src/utils/scryfall";
import type { Printing } from "src/utils/scryfall";
import { CardSearchPanel } from "src/components/card-search-panel";
import { CardDetailDialog } from "src/components/card-detail-dialog";
import { ConditionBadge, FinishBadge } from "src/components/card-attribute-badge";
import { ImportCollectionDialog } from "src/components/import-collection-dialog";

/** How long clicking has to pause before the counts are written */
const FLUSH_DELAY_MS = 600;

/**
 * Stacks per page.
 *
 * An imported collection runs to five figures of rows, and a browser asked to
 * lay out eleven thousand list items with an image each stops responding. This
 * is the number that keeps a page cheap to render and, not by accident, close
 * to what one `/cards/collection` request resolves at a time.
 */
const PAGE_SIZE = 60;

export const Route = createFileRoute("/_menu/collections/$collectionUuid/_collection/")({
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

    const [page, setPage] = useState(0);
    // Only the cards on screen are looked up. Resolving the whole collection
    // would be one request per 75 stacks before anything could be shown.
    const [printings, setPrintings] = useState<Map<string, Printing>>(new Map());
    const [confirming, setConfirming] = useState<CollectionEntryResponse | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    const [dragOver, setDragOver] = useState(false);
    // Counts the user has clicked but that are not written yet. Rows show these
    // instead of the loader's value, so a click lands without waiting for the
    // server — writing straight through meant a PUT plus a full loader re-run
    // before the number moved.
    const [pending, setPending] = useState<Record<string, number>>({});
    // Counts already written but not yet read back. The loader data still holds
    // the old number, so without this a stack would snap back to its previous
    // count the moment the write finished.
    const [written, setWritten] = useState<Record<string, number>>({});
    const [inspecting, setInspecting] = useState<CollectionEntryResponse | null>(null);
    const [importing, setImporting] = useState(false);

    /**
     * The count to show for a stack — the clicked one if there is one
     *
     * @param entry the stack
     *
     * @returns the count
     */
    const quantityOf = (entry: CollectionEntryResponse) => pending[entry.uuid] ?? written[entry.uuid] ?? entry.quantity;

    const pages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
    const visible = useMemo(() => entries.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [entries, page]);

    useEffect(() => {
        let dropped = false;
        void resolvePrintings(visible.map((entry) => entry.printing)).then((resolved) => {
            if (!dropped) setPrintings(resolved);
        });
        // A page turned before the answer arrived must not overwrite the newer
        // one — the requests are not guaranteed to come back in order.
        return () => {
            dropped = true;
        };
    }, [visible]);

    // Deleting the last stack of a page leaves the pager pointing past the end.
    useEffect(() => {
        if (page > 0 && page >= pages) setPage(pages - 1);
    }, [page, pages]);

    useEffect(() => {
        const snapshot = pending;
        if (Object.keys(snapshot).length === 0) return;

        const timer = setTimeout(() => {
            void (async () => {
                await Promise.all(
                    Object.entries(snapshot).map(([uuid, quantity]) =>
                        Api.collections.entries.setQuantity(collectionUuid, uuid, quantity),
                    ),
                );
                // Only drop what was actually sent — a click during the flush
                // must not be swallowed by the reset.
                setWritten((current) => ({ ...current, ...snapshot }));
                setPending((current) => {
                    const rest = { ...current };
                    for (const [uuid, quantity] of Object.entries(snapshot)) {
                        if (rest[uuid] === quantity) delete rest[uuid];
                    }
                    return rest;
                });
                // Deliberately no reload: the counts on screen are the ones
                // just written, and re-fetching the whole collection to learn
                // that costs a megabyte of json per click.
            })();
        }, FLUSH_DELAY_MS);

        return () => clearTimeout(timer);
    }, [pending, collectionUuid]);

    /**
     * Re-runs the loader after a write that changed which stacks exist
     *
     * @returns a promise resolving once the loader has finished
     */
    async function refresh() {
        await router.invalidate();
        // The loader is the truth again, so the locally remembered counts have
        // nothing left to correct.
        setWritten({});
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
        setPending((current) => ({ ...current, [entry.uuid]: quantity }));
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
                        {visible.map((entry) => {
                            const printing = printings.get(entry.printing);
                            return (
                                <StackedListFlexRow key={entry.uuid} className={"gap-4"}>
                                    <button
                                        type={"button"}
                                        disabled={printing === undefined}
                                        aria-label={t("accessibility.inspect-card", {
                                            name: printing?.name ?? t("label.unknown-printing"),
                                        })}
                                        onClick={() => setInspecting(entry)}
                                        className={"shrink-0 rounded transition hover:opacity-80"}
                                    >
                                        {printing?.imageUrl !== undefined && printing?.imageUrl !== null ? (
                                            <img
                                                src={printing.imageUrl}
                                                alt={printing.name}
                                                loading={"lazy"}
                                                className={"h-16 w-auto rounded"}
                                            />
                                        ) : (
                                            <div className={"h-16 w-11 rounded bg-zinc-200 dark:bg-zinc-700"} />
                                        )}
                                    </button>
                                    <div className={"flex min-w-0 flex-1 flex-col gap-1.5"}>
                                        {/* Scryfall may not know the printing — a `delete` migration
                                            retires ids. The row still has to render. */}
                                        <button
                                            type={"button"}
                                            disabled={printing === undefined}
                                            onClick={() => setInspecting(entry)}
                                            className={"min-w-0 text-left"}
                                        >
                                            <Strong className={"block truncate hover:underline"}>
                                                {printing?.name ?? t("label.unknown-printing")}
                                            </Strong>
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
                                                    {formatCurrency(printing.priceEur * quantityOf(entry))}
                                                </Badge>
                                            )}
                                        </div>
                                    </div>
                                    <div className={"flex shrink-0 items-center gap-1"}>
                                        <Button
                                            plain
                                            aria-label={t("accessibility.decrease-quantity")}
                                            onClick={() => changeQuantity(entry, quantityOf(entry) - 1)}
                                        >
                                            <MinusIcon className={"size-4"} />
                                        </Button>
                                        <Strong className={"w-8 text-center tabular-nums"}>{quantityOf(entry)}</Strong>
                                        <Button
                                            plain
                                            aria-label={t("accessibility.increase-quantity")}
                                            onClick={() => changeQuantity(entry, quantityOf(entry) + 1)}
                                        >
                                            <PlusIcon className={"size-4"} />
                                        </Button>
                                        <Button
                                            plain
                                            disabled={busy === entry.uuid}
                                            aria-label={t("accessibility.delete-entry")}
                                            onClick={() => setConfirming(entry)}
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
                <div className={"flex items-center justify-between gap-4"}>
                    <Button plain disabled={page === 0} onClick={() => setPage(page - 1)}>
                        <ChevronLeftIcon />
                        {t("button.previous-page")}
                    </Button>
                    <Text className={"text-xs"}>{t("label.page-of", { page: page + 1, pages })}</Text>
                    <Button plain disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>
                        {t("button.next-page")}
                        <ChevronRightIcon />
                    </Button>
                </div>
            )}

            <CardDetailDialog
                printing={inspecting !== null ? (printings.get(inspecting.printing) ?? null) : null}
                details={
                    inspecting === null
                        ? []
                        : [
                              { label: t("label.quantity"), value: String(quantityOf(inspecting)) },
                              {
                                  label: t("label.condition"),
                                  value: <ConditionBadge condition={inspecting.condition} />,
                              },
                              {
                                  label: t("label.finish"),
                                  value: <FinishBadge finish={inspecting.finish} />,
                              },
                              ...(inspecting.purchase_price_cents !== null &&
                              inspecting.purchase_price_cents !== undefined
                                  ? [
                                        {
                                            label: t("label.purchase-price"),
                                            value: formatCurrency(inspecting.purchase_price_cents / 100),
                                        },
                                    ]
                                  : []),
                          ]
                }
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
