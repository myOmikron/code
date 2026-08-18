import { createFileRoute, useLoaderData, useNavigate, useRouter } from "@tanstack/react-router";
import { Button, EmptyState, notify } from "components";
import type { CSSProperties } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import type { DeckCardResponse, DeckTagResponse, DeckZone } from "src/api/generated";
import { AddCardsDialog } from "src/components/add-cards-dialog";
import type { SearchConstraint } from "src/components/card-search-panel";
import { ShortcutHelpDialog } from "src/components/shortcut-help-dialog";
import { CardDetailDialog } from "src/components/card-detail-dialog";
import { DeckCardGrid } from "src/components/deck-card-grid";
import { DeckCardList } from "src/components/deck-card-list";
import { DeckCardMenu } from "src/components/deck-card-menu";
import { DeckCardPreview } from "src/components/deck-card-preview";
import type { MenuAt } from "src/components/deck-card-menu";
import { DeckColorDialog } from "src/components/deck-color-dialog";
import { DeckPrintingDialog } from "src/components/deck-printing-dialog";
import { DeckPrintingPicker } from "src/components/deck-printing-picker";
import { DeckTagsDialog } from "src/components/deck-tags-dialog";
import { useDeckLabels, ZONE_ORDER } from "src/components/deck-labels";
import { DeckHeaderBar } from "src/components/deck-header-bar";
import { DECK_TILE_SIZES, DECK_VIEWS } from "src/components/deck-view-controls";
import type { DeckTileSize, DeckView } from "src/components/deck-view-controls";
import { DECK_GROUPINGS, DECK_SORTS, groupDeck } from "src/utils/deck-grouping";
import type { DeckGrouping, DeckSort } from "src/utils/deck-grouping";
import { checkDeck } from "src/utils/deck-rules";
import { canFoil, onlyFoil } from "src/utils/deck-foil";
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
    /** How big the cards are drawn */
    size?: DeckTileSize;
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
        size: DECK_TILE_SIZES.find((option) => option === search.size),
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
    const [menu, setMenu] = useState<{ card: string; at: MenuAt } | null>(null);
    const [printingFor, setPrintingFor] = useState<string | null>(null);
    // How tall the sticky bar is, so the column beside the deck can begin below
    // it instead of sliding underneath it.
    const bar = useRef<HTMLDivElement>(null);
    const [barHeight, setBarHeight] = useState(0);
    const [helping, setHelping] = useState(false);
    // Held while a write is in flight, so the counter moves with the click
    // instead of a round trip later.
    const [pending, setPending] = useState<Map<string, number>>(new Map());
    const [pendingTags, setPendingTags] = useState<Map<string, Array<string>>>(new Map());
    // Slots whose deletion is on its way out. They leave the list at once, which
    // is what stops a second click from deleting a slot that is already gone —
    // the answer to that is a refusal, and a refusal is the error screen.
    const [dropped, setDropped] = useState<Array<string>>([]);
    // Writes go out one after another. Clicking minus four times in a second is
    // four requests, and out of order they leave the deck holding whichever one
    // the server happened to finish last.
    const queue = useRef<Promise<void>>(Promise.resolve());

    const grouping = search.group ?? "type";
    const sort = search.sort ?? "name";
    const view = search.view ?? "grid";
    const size = search.size ?? "m";
    const zone = search.zone ?? "Main";

    const resolved = cards
        .filter((card) => !dropped.includes(card.uuid))
        .map((card) => {
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
    // What the card search is held to: a deck is built inside its format and
    // inside its colours, so a hit that could never go in is noise.
    const commanded = resolved.some((slot) => slot.zone === "Commander");
    const bound = rules?.color_identity_locked === true && (deck.allowed_color_identity != null || commanded);
    const constraints: Array<SearchConstraint> = [
        {
            key: "format",
            label: t("label.constraint-format", { format: labels.format(deck.format) }),
            query: `f:${deck.format}`,
        },
        ...(bound
            ? [
                  {
                      key: "identity",
                      label: t("label.constraint-identity", {
                          colors: legality.allowedColors.join("") === "" ? "C" : legality.allowedColors.join(""),
                      }),
                      query: `id<=${legality.allowedColors.join("").toLowerCase() === "" ? "c" : legality.allowedColors.join("").toLowerCase()}`,
                  },
              ]
            : []),
    ];
    const hovered = active === null ? null : (resolved.find((slot) => slot.uuid === active) ?? null);
    const leader = resolved.find((slot) => slot.zone === "Commander") ?? null;
    const menued = menu === null ? null : (resolved.find((slot) => slot.uuid === menu.card) ?? null);
    const printed = printingFor === null ? null : (resolved.find((slot) => slot.uuid === printingFor) ?? null);
    const inspecting = search.card === undefined ? null : (resolved.find((card) => card.uuid === search.card) ?? null);

    // Nothing is on top of the deck: no dialog, no menu. The keys are live and
    // the card under the pointer is worth showing large.
    const quiet =
        !adding && !helping && !editingColors && !managingTags && printingFor === null && search.card === undefined;

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
            p: () => setPrintingFor(active),
            f: () => {
                const card = hovered;
                if (card !== null) void toggleFoil(card, !card.foil);
            },
            "?": () => setHelping(true),
        },
        quiet,
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
        setDropped((previous) => {
            const left = previous.filter((uuid) => cards.some((card) => card.uuid === uuid));
            return left.length === previous.length ? previous : left;
        });
    }, [cards]);

    useLayoutEffect(() => {
        const element = bar.current;
        if (element === null) return;

        const observer = new ResizeObserver(() => setBarHeight(element.offsetHeight));
        observer.observe(element);
        setBarHeight(element.offsetHeight);
        return () => observer.disconnect();
    }, []);

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
     * Puts a write at the end of the queue
     *
     * @param work the write
     *
     * @returns a promise resolving once it has run
     */
    function serial(work: () => Promise<void>): Promise<void> {
        const next = queue.current.catch(() => undefined).then(work);
        queue.current = next;
        return next;
    }

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
        // A second copy raises the count of the slot that is already there
        // rather than opening another one beside it: two rows of the same card
        // in the same zone is never what was meant.
        const existing = resolved.find((slot) => slot.zone === zone && slot.printing === printing.id);
        if (existing !== undefined) {
            setPending((previous) => new Map(previous).set(existing.uuid, existing.quantity + 1));
        }

        await serial(async () => {
            if (existing === undefined) {
                await Api.decks.cards.add(deckUuid, { printing: printing.id, quantity: 1, zone });
            } else {
                await Api.decks.cards.update(deckUuid, existing.uuid, { quantity: existing.quantity + 1 });
            }
            await refresh();
        });
    }

    /**
     * Takes one copy of a card back out of the zone being filed into
     *
     * @param printing the card to take out
     */
    async function subtract(printing: Printing) {
        const slot =
            resolved.find((entry) => entry.zone === zone && entry.printing === printing.id) ??
            resolved.find((entry) => entry.zone === zone && entry.card?.name === printing.name);
        if (slot === undefined) return;
        await changeQuantity(slot, slot.quantity - 1);
    }

    /**
     * How many copies of a card sit in the zone being filed into
     *
     * Counted by name rather than by printing: a second copy of the same card
     * in another print is still a second copy, which is what a singleton format
     * cares about.
     *
     * @param printing the card as the search found it
     *
     * @returns how many copies are in
     */
    function copiesOf(printing: Printing): number {
        return resolved
            .filter((slot) => slot.zone === zone && slot.card?.name === printing.name)
            .reduce((sum, slot) => sum + slot.quantity, 0);
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
        await serial(async () => {
            await Api.decks.cards.update(deckUuid, card.uuid, { quantity });
            await refresh();
        });
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
        if (dropped.includes(card.uuid)) return;
        setDropped((previous) => [...previous, card.uuid]);

        await serial(async () => {
            await Api.decks.cards.delete(deckUuid, card.uuid);
            await refresh();
        });

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
        await serial(async () => {
            if (on) await Api.decks.cards.tag(deckUuid, card.uuid, tag.uuid);
            else await Api.decks.cards.untag(deckUuid, card.uuid, tag.uuid);
            await refresh();
        });
    }

    /**
     * Sleeves a slot in foil, or takes the sheen off again
     *
     * @param card the slot
     * @param foil whether the copies should be the foil ones
     */
    async function toggleFoil(card: DeckCardResponse, foil: boolean) {
        if (!canFoil(card) || onlyFoil(card)) return;
        await Api.decks.cards.update(deckUuid, card.uuid, { foil });
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
     * Puts a slot on another print of the same card
     *
     * @param card the slot to change
     * @param printing the print run it should hold
     */
    async function switchPrinting(card: DeckCardResponse, printing: Printing) {
        setPrintingFor(null);
        await Api.decks.cards.update(deckUuid, card.uuid, { printing: printing.id });
        notify.success(t("toast.printing-changed"));
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
        <div className={"flex flex-col gap-6"} style={{ "--deck-bar": `${barHeight}px` } as CSSProperties}>
            <DeckHeaderBar
                ref={bar}
                legality={legality}
                format={deck.format}
                target={target}
                brackets={offered}
                bracket={deck.bracket ?? null}
                view={view}
                grouping={grouping}
                sort={sort}
                size={size}
                onChangeView={(next) => go({ view: next === "grid" ? undefined : next })}
                onChangeSize={(next) => go({ size: next === "m" ? undefined : next })}
                onChangeGrouping={(next) => go({ group: next === "type" ? undefined : next })}
                onChangeSort={(next) => go({ sort: next === "name" ? undefined : next })}
                onAdd={() => setAdding(true)}
                onEditColors={() => setEditingColors(true)}
                onManageTags={() => setManagingTags(true)}
                onChangeBracket={(next) => void saveBracket(next)}
            />

            <div className={"flex items-start gap-6"}>
                <aside
                    className={"sticky hidden w-72 shrink-0 xl:block 2xl:w-80"}
                    style={{ top: "calc(var(--deck-bar) + 1.5rem)" }}
                >
                    <DeckCardPreview
                        card={menued ?? (quiet ? hovered : null)}
                        commander={quiet ? leader : null}
                        tags={tags}
                    />
                </aside>

                <div className={"flex min-w-0 flex-1 flex-col gap-4"}>
                    {resolved.length === 0 ? (
                        <EmptyState title={t("heading.no-cards")} description={t("description.no-cards")} />
                    ) : view === "grid" ? (
                        <DeckCardGrid
                            groups={groups}
                            size={size}
                            grouping={grouping}
                            violations={legality.slots}
                            tags={tags}
                            onInspect={(card) => go({ card: card.uuid })}
                            onChangeQuantity={(card, quantity) => void changeQuantity(card, quantity)}
                            onDelete={(card) => void remove(card)}
                            onToggleTag={(card, tag, on) => void toggleTag(card, tag, on)}
                            onManageTags={() => setManagingTags(true)}
                            onActivate={(card) => setActive(card?.uuid ?? null)}
                            onMenu={(card, at) => setMenu({ card: card.uuid, at })}
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
                            onMenu={(card, at) => setMenu({ card: card.uuid, at })}
                        />
                    )}
                </div>
            </div>

            <AddCardsDialog
                open={adding}
                zone={zone}
                onChangeZone={(next) => go({ zone: next === "Main" ? undefined : next })}
                constraints={constraints}
                countOf={copiesOf}
                onAdd={add}
                onRemove={subtract}
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
                onClose={() => go({ card: undefined })}
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
            >
                {inspecting?.card == null ? undefined : (
                    <DeckPrintingPicker
                        name={inspecting.card.name}
                        current={inspecting.printing}
                        onPick={(printing) => void switchPrinting(inspecting, printing)}
                    />
                )}
            </CardDetailDialog>

            <ShortcutHelpDialog
                open={helping}
                shortcuts={[
                    { keys: "A", description: t("button.add-cards") },
                    { keys: "V", description: t("label.view") },
                    { keys: "G", description: t("label.grouping") },
                    { keys: "T", description: t("button.manage-tags") },
                    { keys: "1-9", description: t("description.quick-tag") },
                    { keys: "P", description: t("button.change-printing") },
                    { keys: "F", description: t("button.use-foil") },
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

            <DeckCardMenu
                card={menued}
                at={menu?.at ?? null}
                tags={tags}
                onInspect={(card) => go({ card: card.uuid })}
                onChangeQuantity={(card, quantity) => void changeQuantity(card, quantity)}
                onMoveTo={(card, next) => void moveTo(card, next)}
                onChangePrinting={(card) => setPrintingFor(card.uuid)}
                onToggleFoil={(card, foil) => void toggleFoil(card, foil)}
                onToggleTag={(card, tag, on) => void toggleTag(card, tag, on)}
                onDelete={(card) => void remove(card)}
                onClose={() => setMenu(null)}
            />

            <DeckPrintingDialog
                card={printed}
                onPick={(card, printing) => void switchPrinting(card, printing)}
                onClose={() => setPrintingFor(null)}
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
