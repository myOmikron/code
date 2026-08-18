import { createFileRoute, useLoaderData, useNavigate, useRouter } from "@tanstack/react-router";
import { Button, EmptyState, notify } from "components";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import type { DeckCardResponse, DeckTagResponse, DeckZone } from "src/api/generated";
import { AddCardsDialog } from "src/components/add-cards-dialog";
import { ShortcutHelpDialog } from "src/components/shortcut-help-dialog";
import { CardDetailDialog } from "src/components/card-detail-dialog";
import { DeckCardGrid } from "src/components/deck-card-grid";
import { DeckCardList } from "src/components/deck-card-list";
import { DeckColorDialog } from "src/components/deck-color-dialog";
import { DeckTagsDialog } from "src/components/deck-tags-dialog";
import { useDeckLabels, ZONE_ORDER } from "src/components/deck-labels";
import { DeckHeaderBar } from "src/components/deck-header-bar";
import { DECK_VIEWS } from "src/components/deck-view-controls";
import type { DeckView } from "src/components/deck-view-controls";
import { DECK_GROUPINGS, DECK_SORTS, groupDeck } from "src/utils/deck-grouping";
import type { DeckGrouping, DeckSort } from "src/utils/deck-grouping";
import { checkDeck } from "src/utils/deck-rules";
import type { TagColor } from "src/utils/deck-tags";
import { useShortcuts } from "src/utils/use-shortcuts";
import { formatCurrency } from "src/utils/format";
import { resolvePrintings } from "src/utils/scryfall";
import type { Printing } from "src/utils/scryfall";

/**
 * Search params of a deck's card list
 */
export type DeckSearch = {
    /** What the list is broken up by */
    group?: DeckGrouping;
    /** What the cards inside a group are ordered by */
    sort?: DeckSort;
    /** How the cards are laid out */
    view?: DeckView;
    /** Which zone a picked card goes into */
    zone?: DeckZone;
    /** The slot whose dialog is open, by its id */
    card?: string;
};

export const Route = createFileRoute("/_menu/decks/$deckUuid/_deck/cards")({
    validateSearch: (search: Record<string, unknown>): DeckSearch => ({
        group: DECK_GROUPINGS.find((option) => option === search.group),
        sort: DECK_SORTS.find((option) => option === search.sort),
        view: DECK_VIEWS.find((option) => option === search.view),
        zone: ZONE_ORDER.find((option) => option === search.zone),
        card: typeof search.card === "string" && search.card !== "" ? search.card : undefined,
    }),
    loader: ({ params }) => Api.decks.cards.list(params.deckUuid),
    component: RouteComponent,
});

/**
 * Building a deck: the search on one side, what is in it on the other.
 *
 * @returns the page
 */
function RouteComponent() {
    const { deckUuid } = Route.useParams();
    const { cards, tags } = Route.useLoaderData();
    const { deck, formats, brackets } = useLoaderData({ from: "/_menu/decks/$deckUuid/_deck" });
    const search = Route.useSearch();
    const router = useRouter();
    const navigate = useNavigate();
    const [t] = useTranslation("deck");
    const [tg] = useTranslation();
    const labels = useDeckLabels();

    const [inspected, setInspected] = useState<Printing | null>(null);
    const [editingColors, setEditingColors] = useState(false);
    const [adding, setAdding] = useState(false);
    const [managingTags, setManagingTags] = useState(false);
    // Which card the pointer or the focus is on, so a number key knows what it
    // is tagging without anything having to be selected first.
    const [active, setActive] = useState<string | null>(null);
    const [helping, setHelping] = useState(false);
    // Held while a write is in flight, so the counter moves with the click
    // instead of a round trip later.
    const [pending, setPending] = useState<Map<string, number>>(new Map());
    const [pendingTags, setPendingTags] = useState<Map<string, Array<string>>>(new Map());

    const grouping = search.group ?? "type";
    const sort = search.sort ?? "name";
    const view = search.view ?? "grid";
    const zone = search.zone ?? "Main";

    const resolved = cards.map((card) => {
        const quantity = pending.get(card.uuid) ?? card.quantity;
        const slotTags = pendingTags.get(card.uuid) ?? card.tags;
        return quantity === card.quantity && slotTags === card.tags ? card : { ...card, quantity, tags: slotTags };
    });
    const rules = formats.find((format) => format.slug === deck.format);
    // Brackets are a Commander thing; every other format leaves the picker out.
    const offered = deck.format === "commander" ? brackets : [];
    const claimed = brackets.find((entry) => entry.number === deck.bracket);
    const legality = checkDeck(deck, resolved, rules, claimed);
    const target = rules?.deck_size.kind === "exactly" ? rules.deck_size.cards : (rules?.deck_size.cards ?? null);
    const groups = groupDeck(resolved, grouping, sort, tags);
    const inspecting = search.card === undefined ? null : (resolved.find((card) => card.uuid === search.card) ?? null);

    // One key each, live only while no dialog has the screen. The first nine
    // tags answer to their number, which is what makes tagging a deck a matter
    // of running the pointer down it.
    useShortcuts(
        {
            ...Object.fromEntries(tags.slice(0, 9).map((tag, index) => [String(index + 1), () => void quickTag(tag)])),
            a: () => setAdding(true),
            v: () => go({ view: view === "grid" ? "list" : undefined }),
            g: () => go({ group: nextGrouping(grouping) }),
            t: () => setManagingTags(true),
            "?": () => setHelping(true),
        },
        !adding && !helping && !editingColors && !managingTags && search.card === undefined,
    );

    /**
     * Writes new search params, keeping the ones not mentioned
     *
     * @param next what to change
     */
    function go(next: Partial<DeckSearch>) {
        void navigate({
            to: "/decks/$deckUuid/cards",
            params: { deckUuid },
            search: { ...search, ...next },
            resetScroll: false,
        });
    }

    // Optimistic values are dropped one at a time, each when the answer that
    // carries it has arrived. Clearing them all the moment the loader resolves
    // shows the state from before the write for one frame, which reads as the
    // tag blinking off and back on.
    useEffect(() => {
        setPending((previous) => prune(previous, cards, (card, quantity) => card.quantity === quantity));
        setPendingTags((previous) => prune(previous, cards, (card, slotTags) => sameTags(card.tags, slotTags)));
    }, [cards]);

    useEffect(() => {
        if (inspecting === null) {
            setInspected(null);
            return;
        }
        let dropped = false;
        const printing = inspecting.printing;
        void resolvePrintings([printing]).then((found) => {
            if (!dropped) setInspected(found.get(printing) ?? null);
        });
        return () => {
            dropped = true;
        };
    }, [inspecting]);

    /**
     * Re-runs the loader and drops the optimistic counts it has caught up with
     *
     * @returns a promise resolving once the loader has finished
     */
    async function refresh() {
        await router.invalidate();
    }

    /**
     * Puts a printing into the deck, in the zone the search is filing into
     *
     * @param printing the card to add
     */
    async function add(printing: Printing) {
        await Api.decks.cards.add(deckUuid, { printing: printing.id, quantity: 1, zone });
        notify.success(t("toast.card-added", { name: printing.name }));
        await refresh();
    }

    /**
     * Records a new count, taking the card out when it would drop below one
     *
     * @param card the slot to change
     * @param quantity the count to show
     */
    async function changeQuantity(card: DeckCardResponse, quantity: number) {
        if (quantity < 1) {
            await remove(card);
            return;
        }
        setPending((previous) => new Map(previous).set(card.uuid, quantity));
        await Api.decks.cards.update(deckUuid, card.uuid, { quantity });
        await refresh();
    }

    /**
     * Takes a card out of the deck
     *
     * No confirmation: cutting cards is what building a deck *is*, and a dialog
     * per cut would be a hundred dialogs an evening. The toast carries an undo
     * instead, which puts the card back with the same count in the same zone.
     *
     * @param card the slot to remove
     */
    async function remove(card: DeckCardResponse) {
        await Api.decks.cards.delete(deckUuid, card.uuid);
        await refresh();

        notify.success(
            <span className={"flex flex-wrap items-center gap-3"}>
                {t("toast.card-removed-name", { name: card.card?.name ?? t("label.unknown-printing") })}
                <button
                    type={"button"}
                    className={"font-semibold underline underline-offset-2"}
                    onClick={() => void undo(card)}
                >
                    {tg("button.undo")}
                </button>
            </span>,
        );
    }

    /**
     * Puts a card the toast just removed back into the deck
     *
     * A fresh slot with the same count in the same zone: the old one is gone,
     * and nothing hangs off a slot that was alive for four seconds.
     *
     * @param card the slot that was removed
     */
    async function undo(card: DeckCardResponse) {
        notify.dismiss();
        await Api.decks.cards.add(deckUuid, {
            printing: card.printing,
            quantity: card.quantity,
            zone: card.zone,
        });
        await refresh();
    }

    /**
     * Moves a card into another zone
     *
     * @param card the slot to move
     * @param next the zone it goes to
     */
    async function moveTo(card: DeckCardResponse, next: DeckZone) {
        await Api.decks.cards.update(deckUuid, card.uuid, { zone: next });
        notify.success(t("toast.card-moved", { zone: labels.zone(next) }));
        await refresh();
    }

    /**
     * Puts a tag on a card or takes it off again
     *
     * @param card the slot
     * @param tag the tag
     * @param on whether it should sit on the card
     */
    async function toggleTag(card: DeckCardResponse, tag: DeckTagResponse, on: boolean) {
        setPendingTags((previous) =>
            new Map(previous).set(
                card.uuid,
                on ? [...card.tags, tag.uuid] : card.tags.filter((uuid) => uuid !== tag.uuid),
            ),
        );
        if (on) await Api.decks.cards.tag(deckUuid, card.uuid, tag.uuid);
        else await Api.decks.cards.untag(deckUuid, card.uuid, tag.uuid);
        await refresh();
    }

    /**
     * Puts a tag on whichever card the pointer or the focus is on
     *
     * @param tag the tag the pressed number stands for
     */
    async function quickTag(tag: DeckTagResponse) {
        const card = active === null ? null : resolved.find((slot) => slot.uuid === active);
        if (card === undefined || card === null) {
            notify.error(t("toast.no-card-under-pointer"));
            return;
        }
        await toggleTag(card, tag, !card.tags.includes(tag.uuid));
    }

    /**
     * Writes new tags, one request each and one reload for all of them
     *
     * @param wanted the tags to write, each with the decks it is offered on
     */
    async function createTags(wanted: Array<{ name: string; color: TagColor; global: boolean }>) {
        for (const tag of wanted) {
            await Api.decks.tags.create(deckUuid, { name: tag.name, color: tag.color, global: tag.global });
        }
        notify.success(t("toast.tags-created", { count: wanted.length }));
        await refresh();
    }

    /**
     * Writes a changed tag
     *
     * @param tag the tag to change
     * @param name what it is called
     * @param color the colour it is drawn in
     * @param global whether it is offered on every deck
     */
    async function saveTag(tag: DeckTagResponse, name: string, color: TagColor, global: boolean) {
        await Api.decks.tags.update(deckUuid, tag.uuid, { name, color, global });
        await refresh();
    }

    /**
     * Throws a tag away, taking it off every card it sat on
     *
     * @param tag the tag to delete
     */
    async function deleteTag(tag: DeckTagResponse) {
        await Api.decks.tags.delete(deckUuid, tag.uuid);
        notify.success(t("toast.tag-deleted", { name: tag.name }));
        await refresh();
    }

    /**
     * Writes which bracket the deck claims to be built to
     *
     * @param bracket the bracket, `null` to leave it unsaid
     */
    async function saveBracket(bracket: number | null) {
        await Api.decks.setBracket(deckUuid, bracket);
        notify.success(t("toast.bracket-changed"));
        await router.invalidate();
    }

    /**
     * Writes which colours the deck may play
     *
     * @param colors the letters, empty to follow the commander again
     */
    async function saveColors(colors: string) {
        setEditingColors(false);
        await Api.decks.setColors(deckUuid, colors === "" ? null : colors);
        notify.success(t("toast.colors-changed"));
        await router.invalidate();
    }

    return (
        <div className={"flex flex-col gap-6"}>
            <DeckHeaderBar
                legality={legality}
                format={deck.format}
                target={target}
                brackets={offered}
                bracket={deck.bracket ?? null}
                view={view}
                grouping={grouping}
                sort={sort}
                onChangeView={(next) => go({ view: next === "grid" ? undefined : next })}
                onChangeGrouping={(next) => go({ group: next === "type" ? undefined : next })}
                onChangeSort={(next) => go({ sort: next === "name" ? undefined : next })}
                onAdd={() => setAdding(true)}
                onEditColors={() => setEditingColors(true)}
                onManageTags={() => setManagingTags(true)}
                onChangeBracket={(next) => void saveBracket(next)}
            />

            <div className={"flex flex-col gap-4"}>
                {resolved.length === 0 ? (
                    <EmptyState title={t("heading.no-cards")} description={t("description.no-cards")} />
                ) : view === "grid" ? (
                    <DeckCardGrid
                        groups={groups}
                        grouping={grouping}
                        violations={legality.slots}
                        tags={tags}
                        onInspect={(card) => go({ card: card.uuid })}
                        onChangeQuantity={(card, quantity) => void changeQuantity(card, quantity)}
                        onDelete={(card) => void remove(card)}
                        onToggleTag={(card, tag, on) => void toggleTag(card, tag, on)}
                        onManageTags={() => setManagingTags(true)}
                        onActivate={(card) => setActive(card?.uuid ?? null)}
                    />
                ) : (
                    <DeckCardList
                        groups={groups}
                        grouping={grouping}
                        violations={legality.slots}
                        tags={tags}
                        onInspect={(card) => go({ card: card.uuid })}
                        onChangeQuantity={(card, quantity) => void changeQuantity(card, quantity)}
                        onDelete={(card) => void remove(card)}
                        onToggleTag={(card, tag, on) => void toggleTag(card, tag, on)}
                        onManageTags={() => setManagingTags(true)}
                        onActivate={(card) => setActive(card?.uuid ?? null)}
                    />
                )}
            </div>

            <AddCardsDialog
                open={adding}
                zone={zone}
                onChangeZone={(next) => go({ zone: next === "Main" ? undefined : next })}
                onPick={add}
                onClose={() => setAdding(false)}
            />

            <CardDetailDialog
                printing={inspected}
                market={inspecting?.card ?? null}
                details={
                    inspecting === null
                        ? []
                        : [
                              { label: t("label.quantity"), value: inspecting.quantity },
                              { label: t("label.zone"), value: labels.zone(inspecting.zone) },
                              ...(inspecting.card?.price_eur_cents == null
                                  ? []
                                  : [
                                        {
                                            label: t("label.value"),
                                            value: formatCurrency(
                                                (inspecting.card.price_eur_cents * inspecting.quantity) / 100,
                                            ),
                                        },
                                    ]),
                          ]
                }
                actions={
                    inspecting === null ? undefined : (
                        <>
                            {ZONE_ORDER.filter((option) => option !== inspecting.zone).map((option) => (
                                <Button key={option} outline onClick={() => void moveTo(inspecting, option)}>
                                    {t("button.move-to", { zone: labels.zone(option) })}
                                </Button>
                            ))}
                            <Button plain onClick={() => go({ card: undefined })}>
                                {tg("button.close")}
                            </Button>
                        </>
                    )
                }
                onClose={() => go({ card: undefined })}
            />

            <ShortcutHelpDialog
                open={helping}
                shortcuts={[
                    { keys: "A", description: t("button.add-cards") },
                    { keys: "V", description: t("label.view") },
                    { keys: "G", description: t("label.grouping") },
                    { keys: "T", description: t("button.manage-tags") },
                    { keys: "1-9", description: t("description.quick-tag") },
                    { keys: "?", description: t("heading.shortcuts") },
                ]}
                onClose={() => setHelping(false)}
            />

            <DeckTagsDialog
                open={managingTags}
                tags={tags}
                onCreate={(wanted) => void createTags(wanted)}
                onUpdate={(tag, name, color, global) => void saveTag(tag, name, color, global)}
                onDelete={(tag) => void deleteTag(tag)}
                onClose={() => setManagingTags(false)}
            />

            <DeckColorDialog
                open={editingColors}
                colors={legality.allowedColors}
                overruled={legality.colorsOverruled}
                onClose={() => setEditingColors(false)}
                onSave={(colors) => void saveColors(colors)}
            />
        </div>
    );
}

/**
 * Drop the optimistic values the answer has caught up with
 *
 * @param pending what is being held
 * @param cards the slots as they came back
 * @param settled whether the answer already says what the held value says
 *
 * @returns the ones still worth holding, the same map when none were dropped
 */
function prune<T>(
    pending: Map<string, T>,
    cards: Array<DeckCardResponse>,
    settled: (card: DeckCardResponse, value: T) => boolean,
): Map<string, T> {
    if (pending.size === 0) return pending;

    const next = new Map(pending);
    for (const [uuid, value] of pending) {
        const card = cards.find((slot) => slot.uuid === uuid);
        if (card === undefined || settled(card, value)) next.delete(uuid);
    }
    return next.size === pending.size ? pending : next;
}

/**
 * Whether two sets of tags hold the same tags
 *
 * @param left one set
 * @param right the other
 *
 * @returns whether they agree
 */
function sameTags(left: Array<string>, right: Array<string>): boolean {
    return left.length === right.length && left.every((uuid) => right.includes(uuid));
}

/**
 * The grouping after this one, wrapping round at the end
 *
 * @param grouping what the list is broken up by now
 *
 * @returns what it should be broken up by next
 */
function nextGrouping(grouping: DeckGrouping): DeckGrouping | undefined {
    const index = DECK_GROUPINGS.indexOf(grouping);
    const next = DECK_GROUPINGS[(index + 1) % DECK_GROUPINGS.length];
    return next === "type" ? undefined : next;
}
