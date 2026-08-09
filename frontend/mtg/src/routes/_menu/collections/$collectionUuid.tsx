import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import { ChevronLeftIcon, MinusIcon, PlusIcon, TrashIcon } from "@heroicons/react/20/solid";
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
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { RequireAccount } from "src/components/require-account";
import type { CardCondition, CardFinish, CollectionEntryResponse } from "src/api/generated";
import { formatCurrency } from "src/utils/format";
import { resolvePrintings } from "src/utils/scryfall";

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

/** Translation key per finish, see {@link CONDITION_KEY} */
const FINISH_KEY: Record<CardFinish, string> = {
    Nonfoil: "label.finish-nonfoil",
    Foil: "label.finish-foil",
    Etched: "label.finish-etched",
};

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

    /**
     * Re-runs the loader after a write, so the list on screen matches the server
     *
     * @returns a promise resolving once the loader has finished
     */
    const refresh = () => router.invalidate();

    /**
     * Writes a new count for a stack, or removes it when it would hit zero
     *
     * @param entry the stack to change
     * @param quantity the count to write
     */
    async function changeQuantity(entry: CollectionEntryResponse, quantity: number) {
        if (quantity < 1) {
            setConfirming(entry);
            return;
        }
        setBusy(entry.uuid);
        await Api.collections.entries.setQuantity(collectionUuid, entry.uuid, quantity);
        await refresh();
        setBusy(null);
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

    const total = entries.reduce((sum, entry) => sum + entry.quantity, 0);

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
                                        <div className={"h-16 w-11 shrink-0 rounded bg-zinc-200 dark:bg-zinc-700"} />
                                    )}
                                    <div className={"flex min-w-0 flex-1 flex-col gap-1.5"}>
                                        {/* Scryfall may not know the printing — a `delete` migration
                                                retires ids. The row still has to render. */}
                                        <Strong className={"block truncate"}>
                                            {printing?.name ?? t("label.unknown-printing")}
                                        </Strong>
                                        {printing !== undefined && (
                                            <Text className={"text-xs"}>
                                                {printing.setName} · {printing.setCode} #{printing.collectorNumber}
                                            </Text>
                                        )}
                                        <div className={"flex flex-wrap items-center gap-2"}>
                                            <Badge color={"zinc"}>{t(CONDITION_KEY[entry.condition])}</Badge>
                                            <Badge color={entry.finish === "Nonfoil" ? "zinc" : "amber"}>
                                                {t(FINISH_KEY[entry.finish])}
                                            </Badge>
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
                                            disabled={busy === entry.uuid}
                                            aria-label={t("accessibility.decrease-quantity")}
                                            onClick={() => void changeQuantity(entry, entry.quantity - 1)}
                                        >
                                            <MinusIcon className={"size-4"} />
                                        </Button>
                                        <Strong className={"w-8 text-center tabular-nums"}>{entry.quantity}</Strong>
                                        <Button
                                            plain
                                            disabled={busy === entry.uuid}
                                            aria-label={t("accessibility.increase-quantity")}
                                            onClick={() => void changeQuantity(entry, entry.quantity + 1)}
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
