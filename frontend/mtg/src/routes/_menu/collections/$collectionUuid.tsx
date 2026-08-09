import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import { ChevronLeftIcon, MinusIcon, PlusIcon, TrashIcon } from "@heroicons/react/20/solid";
import type { BadgeProps } from "components";
import {
    Alert,
    AlertActions,
    AlertDescription,
    AlertTitle,
    Badge,
    Button,
    EmptyState,
    Heading,
    StackedList,
    StackedListFlexRow,
    Strong,
    Text,
    notify,
} from "components";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { RequireAccount } from "src/components/require-account";
import type { CardCondition, CardFinish, CollectionEntryResponse } from "src/api/generated";
import { formatCurrency } from "src/utils/format";
import { parseCardUrl, resolveCardUrl, resolvePrintings } from "src/utils/scryfall";
import type { Printing } from "src/utils/scryfall";
import { CardSearchPanel } from "src/components/card-search-panel";
import { CardDetailDialog } from "src/components/card-detail-dialog";

/**
 * Translation key per grade — spelled out because the scanner only sees literal
 * `t()` arguments, and because the enum names are not kebab-case slugs.
 */
const CONDITION_KEY: Record<CardCondition, string> = {
    Mint: "label.condition-mint",
    NearMint: "label.condition-near-mint",
    Excellent: "label.condition-excellent",
    Good: "label.condition-good",
    LightPlayed: "label.condition-light-played",
    Played: "label.condition-played",
    Poor: "label.condition-poor",
};

/**
 * Badge colour per grade, following Cardmarket's scale.
 *
 * Cardmarket runs the grades along a green-to-red gradient, which is what makes
 * a condition readable at a glance without reading the label. Mapped onto the
 * component library's palette rather than Cardmarket's own hex values, so the
 * badges stay consistent with the rest of the app in both light and dark mode.
 */
const CONDITION_COLOR: Record<CardCondition, BadgeProps["color"]> = {
    Mint: "emerald",
    NearMint: "green",
    Excellent: "lime",
    Good: "yellow",
    LightPlayed: "amber",
    Played: "orange",
    Poor: "red",
};

/** Translation key per finish, see {@link CONDITION_KEY} */
const FINISH_KEY: Record<CardFinish, string> = {
    Nonfoil: "label.finish-nonfoil",
    Foil: "label.finish-foil",
    Etched: "label.finish-etched",
};

/** Badge colour per finish — only the foils are worth setting apart */
const FINISH_COLOR: Record<CardFinish, BadgeProps["color"]> = {
    Nonfoil: "zinc",
    Foil: "sky",
    Etched: "violet",
};

/** How long clicking has to pause before the counts are written */
const FLUSH_DELAY_MS = 600;

export const Route = createFileRoute("/_menu/collections/$collectionUuid")({
    // In the loader rather than in an effect, so hovering the link on the
    // overview already fetches the entries and their card data. Resolving the
    // printings is part of it — the artwork is what makes the page feel slow if
    // it only starts loading after the click.
    loader: async ({ params }) => {
        // The list is the only way to the collection's name today — there is no
        // single-collection GET yet.
        const [all, listed] = await Promise.all([
            Api.collections.list(),
            Api.collections.entries.list(params.collectionUuid),
        ]);
        return {
            collection: all.find((candidate) => candidate.uuid === params.collectionUuid) ?? null,
            entries: listed.entries,
            printings: await resolvePrintings(listed.entries.map((entry) => entry.printing)),
        };
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
    const { collection, entries, printings } = Route.useLoaderData();
    const router = useRouter();
    const [t] = useTranslation("collection");
    const [tg] = useTranslation();

    const [confirming, setConfirming] = useState<CollectionEntryResponse | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    const [dragOver, setDragOver] = useState(false);
    // Counts the user has clicked but that are not written yet. Rows show these
    // instead of the loader's value, so a click lands without waiting for the
    // server — writing straight through meant a PUT plus a full loader re-run
    // before the number moved.
    const [pending, setPending] = useState<Record<string, number>>({});
    const [inspecting, setInspecting] = useState<CollectionEntryResponse | null>(null);

    /**
     * The count to show for a stack — the clicked one if there is one
     *
     * @param entry the stack
     *
     * @returns the count
     */
    const quantityOf = (entry: CollectionEntryResponse) => pending[entry.uuid] ?? entry.quantity;

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
                setPending((current) => {
                    const rest = { ...current };
                    for (const [uuid, quantity] of Object.entries(snapshot)) {
                        if (rest[uuid] === quantity) delete rest[uuid];
                    }
                    return rest;
                });
                await router.invalidate();
            })();
        }, FLUSH_DELAY_MS);

        return () => clearTimeout(timer);
    }, [pending, collectionUuid, router]);

    /**
     * Re-runs the loader after a write, so the list on screen matches the server
     *
     * @returns a promise resolving once the loader has finished
     */
    const refresh = () => router.invalidate();

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
        <RequireAccount>
            <div className={"flex flex-col gap-6"}>
                <div className={"flex flex-col gap-2"}>
                    <Link
                        to={"/collections"}
                        className={"flex items-center gap-1 text-sm text-zinc-500 hover:underline dark:text-zinc-400"}
                    >
                        <ChevronLeftIcon className={"size-4"} /> {t("button.back-to-collections")}
                    </Link>
                    <Heading>{collection?.name ?? ""}</Heading>
                    <Text>{tg("label.cards", { count: total, amount: total })}</Text>
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
                        dragOver
                            ? "rounded-lg outline-2 outline-offset-4 outline-blue-500 outline-dashed"
                            : "rounded-lg"
                    }
                >
                    {entries.length === 0 ? (
                        <EmptyState title={t("heading.no-entries")} description={t("description.no-entries")} />
                    ) : (
                        <StackedList>
                            {entries.map((entry) => {
                                const printing = printings.get(entry.printing);
                                return (
                                    <StackedListFlexRow key={entry.uuid} className={"gap-4"}>
                                        {printing?.imageUrl !== undefined && printing?.imageUrl !== null ? (
                                            <img
                                                src={printing.imageUrl}
                                                alt={printing.name}
                                                loading={"lazy"}
                                                className={"h-16 w-auto shrink-0 rounded"}
                                            />
                                        ) : (
                                            <div
                                                className={"h-16 w-11 shrink-0 rounded bg-zinc-200 dark:bg-zinc-700"}
                                            />
                                        )}
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
                                                <Badge color={CONDITION_COLOR[entry.condition]}>
                                                    {t(CONDITION_KEY[entry.condition])}
                                                </Badge>
                                                <Badge color={FINISH_COLOR[entry.finish]}>
                                                    {t(FINISH_KEY[entry.finish])}
                                                </Badge>
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
                                            <Strong className={"w-8 text-center tabular-nums"}>{entry.quantity}</Strong>
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

                <CardDetailDialog
                    printing={inspecting !== null ? (printings.get(inspecting.printing) ?? null) : null}
                    details={
                        inspecting === null
                            ? []
                            : [
                                  { label: t("label.quantity"), value: String(quantityOf(inspecting)) },
                                  {
                                      label: t("label.condition"),
                                      value: (
                                          <Badge color={CONDITION_COLOR[inspecting.condition]}>
                                              {t(CONDITION_KEY[inspecting.condition])}
                                          </Badge>
                                      ),
                                  },
                                  {
                                      label: t("label.finish"),
                                      value: (
                                          <Badge color={FINISH_COLOR[inspecting.finish]}>
                                              {t(FINISH_KEY[inspecting.finish])}
                                          </Badge>
                                      ),
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
        </RequireAccount>
    );
}
