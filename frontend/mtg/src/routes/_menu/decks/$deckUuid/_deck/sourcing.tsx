import {
    ArchiveBoxIcon,
    ArrowUturnLeftIcon,
    ClipboardDocumentCheckIcon,
    ShoppingCartIcon,
} from "@heroicons/react/20/solid";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import {
    Button,
    Divider,
    EmptyState,
    Label,
    PrimaryButton,
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
import type { SourcedStackResponse, SourcingCandidateResponse, SourcingSlotResponse } from "src/api/generated";
import { CollectionMarker } from "src/components/collection-marker";
import { DeckDissolveDialog } from "src/components/deck-dissolve-dialog";
import { DeckInventoryRow } from "src/components/deck-inventory-row";
import { DeckSourcingSlot } from "src/components/deck-sourcing-slot";
import { DeckWantsDialog } from "src/components/deck-wants-dialog";
import { countSlot, groupByOrigin } from "src/utils/deck-sourcing";
import type { SourcingMatch } from "src/utils/deck-sourcing";
import { formatCurrency } from "src/utils/format";

export const Route = createFileRoute("/_menu/decks/$deckUuid/_deck/sourcing")({
    loader: async ({ params }) => ({
        sourcing: await Api.decks.sourcing.read(params.deckUuid),
        collections: await Api.collections.list(),
    }),
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
    const { sourcing, collections } = Route.useLoaderData();
    const router = useRouter();
    // Both on to start with: the strict reading is the one that tells the truth
    // about the deck as it is written down, and loosening it is a deliberate
    // "any copy will do" that the hints under each card offer when it applies.
    const [match, setMatch] = useState<SourcingMatch>({ exactPrinting: true, matchFinish: true });
    const [busy, setBusy] = useState(false);
    const [dissolving, setDissolving] = useState(false);
    const [shopping, setShopping] = useState(false);
    const [unfolded, setUnfolded] = useState<string | null>(null);

    const shelf = collections.filter((collection) => collection.collection.deck == null);
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
    const bill = counted.reduce((sum, row) => {
        const card = row.slot.card;
        const price = row.slot.foil ? (card?.price_eur_foil_cents ?? card?.price_eur_cents) : card?.price_eur_cents;
        return sum + (price ?? 0) * row.count.missing;
    }, 0);

    /**
     * Reloads the page after a move, so both sides of it are the server's word
     *
     * @returns a promise resolving once the loader has finished
     */
    const refresh = () => router.invalidate();

    /**
     * Starts keeping the cards that are physically in this deck
     */
    async function attach() {
        setBusy(true);
        try {
            await Api.decks.collection.attach(deckUuid);
            notify.success(t("toast.deck-collection-created"));
            await refresh();
        } finally {
            setBusy(false);
        }
    }

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
     * Moves copies out of a collection and into the deck
     *
     * The slot goes along: sourcing another edition than the list names is what
     * the deck is really sleeved with, so the list follows the cardboard.
     *
     * @param slot the slot they are being sourced for
     * @param candidate the stack they come out of
     * @param quantity how many to take
     */
    async function take(slot: SourcingSlotResponse, candidate: SourcingCandidateResponse, quantity: number) {
        setBusy(true);
        try {
            await Api.decks.sourcing.take(deckUuid, candidate.uuid, quantity, slot.uuid);
            notify.success(t("toast.cards-taken", { count: quantity }));
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

    if (sourcing.collection == null) {
        return (
            <div className={"flex flex-col gap-6"}>
                <EmptyState
                    icon={<ArchiveBoxIcon />}
                    title={t("heading.no-deck-collection")}
                    description={t("description.no-deck-collection")}
                />
                <div className={"flex justify-center"}>
                    <PrimaryButton disabled={busy} onClick={() => void attach()}>
                        {t("button.keep-deck-collection")}
                    </PrimaryButton>
                </div>
            </div>
        );
    }

    return (
        <div className={"flex flex-col gap-8"}>
            <section className={"flex flex-col gap-4"}>
                <div className={"flex flex-wrap items-start justify-between gap-3"}>
                    <div className={"flex flex-col gap-1"}>
                        <Subheading>{t("heading.sourcing")}</Subheading>
                        <Text>{t("description.sourcing")}</Text>
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
                                color={"blue"}
                                checked={match.exactPrinting}
                                onChange={(exactPrinting) => setMatch({ ...match, exactPrinting })}
                            />
                        </SwitchField>
                        <SwitchField>
                            <Label>{t("label.match-finish")}</Label>
                            <Switch
                                color={"blue"}
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
                                onTake={(taken, candidate, quantity) => void take(taken, candidate, quantity)}
                                onBuy={(bought) => void fill(bought.uuid)}
                                busy={busy}
                            />
                        ))}
                    </StackedList>
                )}
            </section>

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
                        {sourcing.filed.length > 0 && (
                            <Button outline={true} disabled={busy} onClick={() => setDissolving(true)}>
                                <ArrowUturnLeftIcon />
                                {t("button.return-all")}
                            </Button>
                        )}
                    </div>
                </div>

                {sourcing.filed.length === 0 ? (
                    <Text>{t("description.deck-collection-empty")}</Text>
                ) : (
                    groupByOrigin(sourcing.filed).map((group) => (
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
                                        busy={busy}
                                    />
                                ))}
                            </StackedList>
                        </section>
                    ))
                )}
            </section>

            <DeckWantsDialog open={shopping} rows={wants} onClose={() => setShopping(false)} />

            <DeckDissolveDialog
                deck={dissolving ? { uuid: deckUuid, name: sourcing.collection.name } : null}
                onClose={() => setDissolving(false)}
                onDissolved={refresh}
            />
        </div>
    );
}
