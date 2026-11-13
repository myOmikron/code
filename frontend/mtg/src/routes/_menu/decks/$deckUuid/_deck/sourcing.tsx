import { ArrowUturnLeftIcon, ClipboardDocumentCheckIcon, ShoppingCartIcon } from "@heroicons/react/20/solid";
import { createFileRoute, useLoaderData, useRouter } from "@tanstack/react-router";
import {
    Button,
    ConfirmDialog,
    Divider,
    Label,
    StackedList,
    Subheading,
    Switch,
    SwitchField,
    Text,
    notify,
} from "components";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import type { SourcedStackResponse, SourcingCandidateResponse } from "src/api/generated";
import { CollectionMarker } from "src/components/collection-marker";
import { DeckDissolveDialog } from "src/components/deck-dissolve-dialog";
import { DeckInventoryRow } from "src/components/deck-inventory-row";
import { DeckProxyRow } from "src/components/deck-proxy-row";
import { DeckSourcingSlot } from "src/components/deck-sourcing-slot";
import { DeckWantsDialog } from "src/components/deck-wants-dialog";
import { countSlot, groupByOrigin, missingCost, proxyReplacements } from "src/utils/deck-sourcing";
import type { SourcingMatch } from "src/utils/deck-sourcing";
import { formatCurrency } from "src/utils/format";

export const Route = createFileRoute("/_menu/decks/$deckUuid/_deck/sourcing")({
    loader: async ({ params }) => {
        const [sourcing, collections, values] = await Promise.all([
            Api.decks.sourcing.read(params.deckUuid),
            Api.collections.list(),
            Api.decks.values(params.deckUuid),
        ]);
        return { sourcing, collections, values };
    },
    component: RouteComponent,
});

/**
 * Where the cards in this deck come from, and where the rest could come from.
 *
 * The deck list says what the deck wants; this says what it has. Everything in
 * between is a card moving out of a collection and into the deck, which is why both
 * directions live on one page: the same shelf answers both questions.
 *
 * @returns the page
 */
function RouteComponent() {
    const [t] = useTranslation("collection");
    const { deckUuid } = Route.useParams();
    const { sourcing, collections, values } = Route.useLoaderData();
    const { deck } = useLoaderData({ from: "/_menu/decks/$deckUuid/_deck" });
    const router = useRouter();
    // Both on to start with: the strict reading is the one that tells the truth
    // about the deck as it is written down, and loosening it is a deliberate
    // "any copy will do" that the hints under each card offer when it applies.
    const [match, setMatch] = useState<SourcingMatch>({ exactPrinting: true, matchFinish: true });
    const [busy, setBusy] = useState(false);
    const [dissolving, setDissolving] = useState(false);
    const [shopping, setShopping] = useState(false);
    // The stack whose deletion is being confirmed. Cards leaving the account
    // for good is the one move on this page that nothing undoes, so it is the
    // one that asks first.
    const [deleting, setDeleting] = useState<SourcedStackResponse | null>(null);
    const [unfolded, setUnfolded] = useState<string | null>(null);

    const shelf = collections;
    const real = sourcing.filed.filter((stack) => !stack.proxy);
    const proxies = proxyReplacements(sourcing.filed, sourcing.candidates);
    const wanted = new Set(
        sourcing.slots.flatMap((slot) => (slot.card?.oracle_id != null ? [slot.card.oracle_id] : [])),
    );

    const counted = sourcing.slots.map((slot) => ({
        slot,
        count: countSlot(slot, sourcing.filed, sourcing.candidates, match),
    }));
    // A slot that is fully sleeved up is already visible in the section below,
    // so it drops out of the shopping half rather than repeating itself.
    const open = counted.filter(({ count }) => count.filed < count.needed);
    const needed = counted.reduce((sum, row) => sum + row.count.needed, 0);
    const filed = counted.reduce((sum, row) => sum + row.count.filed, 0);
    const missing = counted.reduce((sum, row) => sum + row.count.missing, 0);
    // One row per slot; the dialog folds them the way its switches ask for.
    const wants = counted.map(({ slot, count }) => ({
        key: slot.card?.oracle_id ?? slot.printing,
        name: slot.card?.name ?? "",
        setCode: slot.card?.set_code ?? "",
        missing: count.missing,
        available: Math.min(count.available, Math.max(0, count.needed - count.filed)),
    }));
    const bill = missingCost(counted);

    /**
     * Reloads the page after a move, so both sides of it are the server's word
     *
     * @returns a promise resolving once the loader has finished
     */
    const refresh = () => router.invalidate();

    /**
     * Says that the deck already holds what its list asks for
     *
     * @param slot the one card that was just bought, `null` for the whole list
     */
    async function fill(slot: string | null = null) {
        setBusy(true);
        try {
            const answer = await Api.decks.sourcing.fill(deckUuid, slot);
            notify.success(t("toast.deck-filled", { count: answer.filed }));
            await refresh();
        } finally {
            setBusy(false);
        }
    }

    /**
     * Moves copies out of a collection and into the Physical deck
     *
     * The list leads: another edition than the list names stays a Deviation
     * until somebody changes the list or swaps the card.
     *
     * @param candidate the stack they come out of
     * @param quantity how many to take
     */
    async function take(candidate: SourcingCandidateResponse, quantity: number) {
        setBusy(true);
        try {
            await Api.decks.sourcing.take(deckUuid, candidate.uuid, quantity);
            notify.success(t("toast.cards-taken", { count: quantity }));
            await refresh();
        } finally {
            setBusy(false);
        }
    }

    /**
     * Puts Proxies into the Physical deck for a line of the list
     *
     * @param slot the line they stand in for
     * @param quantity how many to put in
     */
    async function putProxies(slot: string, quantity: number) {
        setBusy(true);
        try {
            await Api.decks.sourcing.putProxies(deckUuid, slot, quantity);
            notify.success(t("toast.proxies-put-in", { count: quantity }));
            await refresh();
        } finally {
            setBusy(false);
        }
    }

    /**
     * Replaces Proxies with real copies out of a collection
     *
     * @param proxy the Proxy stack
     * @param candidate the stack the real copies come out of
     * @param quantity how many Proxies to replace
     */
    async function replaceProxy(proxy: SourcedStackResponse, candidate: SourcingCandidateResponse, quantity: number) {
        setBusy(true);
        try {
            await Api.decks.sourcing.replaceProxy(deckUuid, proxy.uuid, candidate.uuid, quantity);
            notify.success(t("toast.proxies-replaced", { count: quantity }));
            await refresh();
        } finally {
            setBusy(false);
        }
    }

    /**
     * Throws a Proxy stack away
     *
     * @param proxy the Proxy stack
     */
    async function discardProxies(proxy: SourcedStackResponse) {
        setBusy(true);
        try {
            await Api.decks.sourcing.returnCards(deckUuid, proxy.uuid, proxy.quantity);
            notify.success(t("toast.proxies-discarded", { count: proxy.quantity }));
            await refresh();
        } finally {
            setBusy(false);
        }
    }

    /**
     * Takes a stack out of the deck and out of the account
     *
     * For cards that are gone: sold, traded away, lost. Returning them to a
     * collection is the other button — this one is what somebody reaches for
     * when there is no collection left to return them to.
     *
     * @param stack the stack to delete
     */
    async function destroy(stack: SourcedStackResponse) {
        setBusy(true);
        try {
            await Api.decks.sourcing.discard(deckUuid, stack.uuid);
            setDeleting(null);
            notify.success(t("toast.cards-deleted", { count: stack.quantity }));
            await refresh();
        } finally {
            setBusy(false);
        }
    }

    /**
     * Sorts a stack out of the deck and back into a collection
     *
     * @param stack the stack to sort back
     * @param target where it goes, `null` to send it back where it came from
     */
    async function returnStack(stack: SourcedStackResponse, target: string | null) {
        setBusy(true);
        try {
            await Api.decks.sourcing.returnCards(deckUuid, stack.uuid, stack.quantity, target);
            notify.success(t("toast.cards-returned", { count: stack.quantity }));
            await refresh();
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className={"flex flex-col gap-8"}>
            <section className={"flex flex-col gap-4"}>
                <div className={"flex flex-wrap items-start justify-between gap-3"}>
                    <div className={"flex flex-col gap-1"}>
                        <Subheading>{t("heading.sourcing")}</Subheading>
                        <Text>{t("description.sourcing")}</Text>
                        <Text className={"flex flex-wrap items-center gap-x-2 gap-y-1"}>
                            <span className={"tabular-nums"}>
                                {t("label.list-value", { value: formatCurrency(values.list_value_cents / 100) })}
                            </span>
                            {values.physical != null && (
                                <>
                                    <span aria-hidden={true}>·</span>
                                    <span className={"tabular-nums"}>
                                        {t("label.physical-value", {
                                            value: formatCurrency(values.physical.physical_value_cents / 100),
                                        })}
                                    </span>
                                </>
                            )}
                        </Text>
                        <Text className={"flex flex-wrap items-center gap-x-2 gap-y-1"}>
                            <span className={"tabular-nums"}>{t("label.sourced", { filed, needed })}</span>
                            {missing > 0 && (
                                <>
                                    <span aria-hidden={true}>·</span>
                                    <span className={"tabular-nums"}>
                                        {t("label.to-buy", { count: missing })}
                                        {bill > 0 && ` · ${formatCurrency(bill / 100)}`}
                                    </span>
                                </>
                            )}
                        </Text>
                    </div>
                    <div className={"flex flex-col items-end gap-2"}>
                        {missing > 0 && (
                            <Button outline={true} onClick={() => setShopping(true)}>
                                <ShoppingCartIcon />
                                {t("button.export-wants")}
                            </Button>
                        )}
                        <SwitchField>
                            <Label>{t("label.exact-printing-only")}</Label>
                            <Switch
                                color={"lime"}
                                checked={match.exactPrinting}
                                onChange={(exactPrinting) => setMatch({ ...match, exactPrinting })}
                            />
                        </SwitchField>
                        <SwitchField>
                            <Label>{t("label.match-finish")}</Label>
                            <Switch
                                color={"lime"}
                                checked={match.matchFinish}
                                onChange={(matchFinish) => setMatch({ ...match, matchFinish })}
                            />
                        </SwitchField>
                    </div>
                </div>

                {counted.length === 0 ? (
                    <Text>{t("description.no-slots")}</Text>
                ) : open.length === 0 ? (
                    <Text>{t("description.all-sourced")}</Text>
                ) : (
                    <StackedList>
                        {open.map(({ slot }) => (
                            <DeckSourcingSlot
                                key={slot.uuid}
                                slot={slot}
                                filed={sourcing.filed}
                                candidates={sourcing.candidates}
                                match={match}
                                open={unfolded === slot.uuid}
                                onToggle={() => setUnfolded(unfolded === slot.uuid ? null : slot.uuid)}
                                onTake={(_, candidate, quantity) => void take(candidate, quantity)}
                                onBuy={(bought) => void fill(bought.uuid)}
                                onProxy={(proxied, quantity) => void putProxies(proxied.uuid, quantity)}
                                busy={busy}
                            />
                        ))}
                    </StackedList>
                )}
            </section>

            {proxies.length > 0 && (
                <>
                    <Divider />

                    <section className={"flex flex-col gap-4"}>
                        <div className={"flex flex-col gap-1"}>
                            <Subheading>{t("heading.replace-proxies")}</Subheading>
                            <Text>{t("description.replace-proxies")}</Text>
                            {values.physical != null && values.physical.proxy_replacement_cents > 0 && (
                                <Text className={"tabular-nums"}>
                                    {t("label.replacement-cost", {
                                        value: formatCurrency(values.physical.proxy_replacement_cents / 100),
                                    })}
                                </Text>
                            )}
                        </div>
                        <StackedList>
                            {proxies.map((replacement) => (
                                <DeckProxyRow
                                    key={replacement.proxy.uuid}
                                    replacement={replacement}
                                    open={unfolded === replacement.proxy.uuid}
                                    onToggle={() =>
                                        setUnfolded(unfolded === replacement.proxy.uuid ? null : replacement.proxy.uuid)
                                    }
                                    onReplace={(proxy, candidate, quantity) =>
                                        void replaceProxy(proxy, candidate, quantity)
                                    }
                                    onDiscard={(proxy) => void discardProxies(proxy)}
                                    busy={busy}
                                />
                            ))}
                        </StackedList>
                    </section>
                </>
            )}

            <Divider />

            <section className={"flex flex-col gap-4"}>
                <div className={"flex flex-wrap items-start justify-between gap-3"}>
                    <div className={"flex flex-col gap-1"}>
                        <Subheading>{t("heading.in-deck")}</Subheading>
                        <Text>{t("description.in-deck")}</Text>
                    </div>
                    <div className={"flex flex-wrap items-center gap-2"}>
                        <Button outline={true} disabled={busy} onClick={() => void fill()}>
                            <ClipboardDocumentCheckIcon />
                            {t("button.fill-from-list")}
                        </Button>
                        {sourcing.physical_deck != null && (
                            <Button outline={true} disabled={busy} onClick={() => setDissolving(true)}>
                                <ArrowUturnLeftIcon />
                                {t("button.take-apart")}
                            </Button>
                        )}
                    </div>
                </div>

                {real.length === 0 ? (
                    <Text>{t("description.physical-deck-empty")}</Text>
                ) : (
                    groupByOrigin(real).map((group) => (
                        <section key={group.origin ?? "none"} className={"flex flex-col gap-2"}>
                            <div className={"flex items-center gap-2"}>
                                <CollectionMarker
                                    color={group.color ?? "zinc"}
                                    icon={group.icon ?? "box"}
                                    size={"sm"}
                                />
                                <h3 className={"text-sm font-semibold text-zinc-950 dark:text-white"}>
                                    {group.name ?? t("label.no-origin")}
                                </h3>
                                <span className={"h-px flex-1 bg-zinc-950/5 dark:bg-white/10"} />
                            </div>
                            <StackedList>
                                {group.stacks.map((stack) => (
                                    <DeckInventoryRow
                                        key={stack.uuid}
                                        stack={stack}
                                        collections={shelf}
                                        wanted={stack.card?.oracle_id == null || wanted.has(stack.card.oracle_id)}
                                        onReturn={(target, into) => void returnStack(target, into)}
                                        onDelete={setDeleting}
                                        busy={busy}
                                    />
                                ))}
                            </StackedList>
                        </section>
                    ))
                )}
            </section>

            <DeckWantsDialog open={shopping} rows={wants} onClose={() => setShopping(false)} />

            <ConfirmDialog
                open={deleting !== null}
                onClose={() => setDeleting(null)}
                onConfirm={async () => {
                    if (deleting !== null) await destroy(deleting);
                }}
                title={t("heading.delete-cards")}
                description={t("description.delete-cards", {
                    count: deleting?.quantity ?? 0,
                    name: deleting?.card?.name ?? t("label.unknown-printing"),
                })}
                confirmLabel={t("button.delete-card")}
            />

            <DeckDissolveDialog
                deck={dissolving ? { uuid: deckUuid, name: deck.name } : null}
                onClose={() => setDissolving(false)}
                onDissolved={refresh}
            />
        </div>
    );
}
