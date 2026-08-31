import { createFileRoute, useLoaderData, useNavigate, useRouter } from "@tanstack/react-router";
import {
    Button,
    Dialog,
    DialogActions,
    DialogBody,
    DialogTitle,
    EmptyState,
    Label,
    Radio,
    RadioField,
    RadioGroup,
    notify,
} from "components";
import type { CSSProperties } from "react";
import { startTransition, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CardFocus } from "src/components/deck-header-bar";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import type {
    CollectionOverviewResponse,
    DeckCardResponse,
    DeckSourcingResponse,
    DeckTagResponse,
    DeckZone,
} from "src/api/generated";
import { AddCardsDialog } from "src/components/add-cards-dialog";
import type { SearchConstraint } from "src/components/card-search-panel";
import { CardDetailDialog } from "src/components/card-detail-dialog";
import { DeckCardGrid } from "src/components/deck-card-grid";
import { DeckCardList } from "src/components/deck-card-list";
import { DeckCardTable } from "src/components/deck-card-table";
import { DeckCardMenu } from "src/components/deck-card-menu";
import { DeckCardPreview } from "src/components/deck-card-preview";
import type { MenuAt } from "src/components/context-menu";
import { DeckRuleZeroDialog } from "src/components/deck-rule-zero-dialog";
import { PrintingDialog } from "src/components/printing-dialog";
import { DeckPrintingSwitchDialog } from "src/components/deck-printing-switch-dialog";
import { DeckTagDock } from "src/components/deck-tag-dock";
import { DeckTagsDialog } from "src/components/deck-tags-dialog";
import { useDeckLabels, ZONE_ORDER } from "src/components/deck-labels";
import { DeckHeaderBar } from "src/components/deck-header-bar";
import { DECK_TILE_SIZES, DECK_VIEWS } from "src/components/deck-view-controls";
import type { DeckTileSize, DeckView } from "src/components/deck-view-controls";
import { DECK_GROUPINGS, DECK_SORTS, groupDeck } from "src/utils/deck-grouping";
import { useCollapsedGroups } from "src/utils/use-collapsed-groups";
import type { DeckGrouping, DeckSort } from "src/utils/deck-grouping";
import { checkDeck, deckRuleZero, playedBracket } from "src/utils/deck-rules";
import { DeckReplaceDialog } from "src/components/deck-replace-dialog";
import { advisorDeck, bracketSpeed, playedNames } from "src/utils/deck-advisor";
import { useDeckCombos } from "src/utils/use-deck-combos";
import { canFoil, onlyFoil } from "src/utils/deck-foil";
import type { TagColor, TagIconName } from "src/utils/deck-tags";
import { useShortcuts } from "src/utils/use-shortcuts";
import { formatCurrency } from "src/utils/format";
import { parseCardUrl, resolveCardUrl, resolvePrintings } from "src/utils/scryfall";
import { provisionalPrinting } from "src/utils/provisional-printing";
import type { Printing } from "src/utils/scryfall";
import { canBeCommander } from "src/utils/commander";
import { useAccount } from "src/context/account";
import { useDeckViewSettings } from "src/utils/deck-view-settings";
import { useFlippedCards } from "src/utils/use-flipped-cards";
import { usePointerCard } from "src/utils/use-pointer-card";
import { useShortcutHelpOpen } from "src/context/shortcut-help-context";

/**
 * The zones the search's "already in" filter looks through.
 *
 * Everything a card can meaningfully occupy: the deck proper, the command
 * zone, the sideboard and the maybeboard. Only the companion slot stays out,
 * because a companion sits beside the deck by rule and does not preclude
 * running further copies of the same card inside it.
 */
const INCLUDED_ZONES: Array<DeckZone> = ["Main", "Commander", "Side", "Maybe"];

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
    const { account } = useAccount();
    const [viewSettings, setViewSettings] = useDeckViewSettings(account?.uuid ?? null);
    const flippedCards = useFlippedCards();
    const shortcutHelpOpen = useShortcutHelpOpen();

    const [inspected, setInspected] = useState<Printing | null>(null);
    const [editingRuleZero, setEditingRuleZero] = useState(false);
    const [adding, setAdding] = useState(false);
    const [managingTags, setManagingTags] = useState(false);
    const [choosing, setChoosing] = useState<"view" | "group" | null>(null);
    // Which card the pointer or the focus is on, so a number key knows what it
    // is tagging without anything having to be selected first.
    const [active, setActive] = useState<string | null>(null);
    const [menu, setMenu] = useState<{ card: string; at: MenuAt } | null>(null);
    const [menuPrinting, setMenuPrinting] = useState<Printing | null>(null);
    const [printingFor, setPrintingFor] = useState<string | null>(null);
    // Where this deck's cards lie, and every shelf they could be sorted onto.
    // Read the first time somebody opens the print picker rather than with the
    // deck: a builder who never asks about editions should not pay for it.
    const [sourcing, setSourcing] = useState<DeckSourcingResponse | null>(null);
    const [shelf, setShelf] = useState<Array<CollectionOverviewResponse>>([]);
    const [switching, setSwitching] = useState<{ card: DeckCardResponse; printing: Printing } | null>(null);
    const [replacing, setReplacing] = useState<DeckCardResponse | null>(null);
    const [dragOver, setDragOver] = useState(false);
    // How tall the sticky bar is, so the column beside the deck can begin below
    // it instead of sliding underneath it.
    const bar = useRef<HTMLDivElement>(null);
    const [barHeight, setBarHeight] = useState(0);
    const [finding, setFinding] = useState(false);
    const [deckQuery, setDeckQuery] = useState("");
    // The remark whose cards the list is narrowed to — set by clicking a
    // warning in the legality dropdown, cleared from its chip.
    const [focus, setFocus] = useState<CardFocus | null>(null);
    const deckSearch = useRef<HTMLInputElement>(null);
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
    const sort = search.sort ?? viewSettings.sort;
    const view = search.view ?? viewSettings.view;
    const size = search.size ?? viewSettings.size;
    const zones = ZONE_ORDER.filter((option) => deck.format !== "commander" || option !== "Side");
    const requestedZone = search.zone ?? "Main";
    const zone = zones.includes(requestedZone) ? requestedZone : "Main";

    // Everything derived from the deck is memoised, and not as a micro
    // optimisation. This route re-renders on far more than a change to the
    // deck: the pointer correction reports a card after every render, opening a
    // dialog writes a search parameter, and a hover moves the preview. Each of
    // those used to rebuild `resolved` — a new array of new objects — and with
    // it re-run the legality check and the grouping over the whole deck, and
    // hand every row a new object so nothing downstream could bail out either.
    // A profile of one click spent three and a half of four seconds in
    // scripting doing exactly this, over and over.
    const resolved = useMemo(
        () =>
            cards
                .filter((card) => !dropped.includes(card.uuid))
                .map((card) => {
                    const quantity = pending.get(card.uuid) ?? card.quantity;
                    const slotTags = pendingTags.get(card.uuid) ?? card.tags;
                    return quantity === card.quantity && slotTags === card.tags
                        ? card
                        : { ...card, quantity, tags: slotTags };
                }),
        [cards, dropped, pending, pendingTags],
    );
    const needle = deckQuery.trim().toLocaleLowerCase();
    const needled = useMemo(
        () =>
            needle === ""
                ? resolved
                : resolved.filter((card) => card.card?.name.toLocaleLowerCase().includes(needle) === true),
        [resolved, needle],
    );
    // A clicked remark narrows the list to its cards, on top of whatever the
    // text search already kept. Either handle matches — remarks about slots
    // send uuids, remarks about cards send names.
    const shown = useMemo(
        () =>
            focus === null
                ? needled
                : needled.filter(
                      (slot) =>
                          focus.uuids.includes(slot.uuid) ||
                          (slot.card != null && focus.names.includes(slot.card.name)),
                  ),
        [needled, focus],
    );
    const rules = formats.find((format) => format.slug === deck.format);
    // Brackets are a Commander thing; every other format leaves the picker out.
    const offered = brackets;
    const claimed = brackets.find((entry) => entry.number === deck.bracket);
    const ruleZero = deckRuleZero(deck);
    // An agreed size is what the deck is actually built to, so the counter and
    // the strip read against it rather than against the format's number —
    // exactly the way `checkDeck` reads it.
    const target = ruleZero.deckSize ?? rules?.deck_size.cards ?? null;
    // The advisor's projection of the deck, shared by the combo lookup below
    // and the replace dialog. Memoized — the map-build-and-sort inside must
    // not run per pointer-crossed card, which is how often this renders.
    const advisor = useMemo(
        () => advisorDeck(resolved, { allowedColorIdentity: deck.allowed_color_identity, targetSize: target }),
        [resolved, deck.allowed_color_identity, target],
    );
    const played = useMemo(() => playedNames(resolved), [resolved]);
    // The one bracket rule the catalog cannot answer, asked of the graph. The
    // ignore list stays out: it filters recommendations, and `complete` is a
    // statement of fact about the deck.
    const combos = useDeckCombos(advisor, played, [], deck.format === "commander");
    // A stale answer describes the deck before the last edit — or another deck
    // entirely, right after a switch. Reading it as "unanswered" keeps the
    // band honest and, more importantly, keeps the automatic bracket raise
    // below from acting on cards that are no longer there. Memoized so the
    // legality check below keeps its own memo across renders that changed
    // nothing about the answer.
    const twoCardCombos = useMemo(
        () =>
            combos.data === null || combos.stale
                ? null
                : combos.data.complete
                      .filter((combo) => combo.card_names.length === 2)
                      .map((combo) => combo.card_names),
        [combos.data, combos.stale],
    );
    const legality = useMemo(
        () => checkDeck(deck, resolved, rules, claimed, twoCardCombos),
        [deck, resolved, rules, claimed, twoCardCombos],
    );
    const plays = playedBracket(legality, offered);
    const groups = useMemo(() => groupDeck(shown, grouping, sort, tags), [shown, grouping, sort, tags]);
    const collapsedGroups = useCollapsedGroups(deckUuid);
    // What the card search is held to: a deck is built inside its format and
    // inside its colours, so a hit that could never go in is noise.
    const commanded = resolved.some((slot) => slot.zone === "Commander");
    const bound = rules?.color_identity_locked === true && (deck.allowed_color_identity != null || commanded);
    const constraints: Array<SearchConstraint> = [
        {
            key: "format",
            label: t("label.constraint-format", { format: labels.format(deck.format) }),
            // A table that agreed to the banned list is still building inside
            // its format — the pool is simply the format plus what it bans, so
            // the chip widens rather than dropping away. It stays dismissible
            // either way; only the commander chip is fixed.
            query: ruleZero.banned ? `(f:${deck.format} or banned:${deck.format})` : `f:${deck.format}`,
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
        ...(deck.format === "commander" && zone === "Commander"
            ? [
                  {
                      key: "commander",
                      label: t("label.constraint-commander"),
                      query: "is:commander",
                      exclude: (printing: Printing) => !canBeCommander(printing),
                      fixed: true,
                  },
              ]
            : []),
        // A commander search is a question about the format, so the hits come
        // in the order the format plays them. The chip's directive stands in
        // front of the typed words and the last directive wins, so typing
        // another `sort:` overrides it without switching the chip off.
        ...(deck.format === "commander"
            ? [
                  {
                      key: "edhrec",
                      label: t("label.constraint-edhrec"),
                      query: "sort:edhrec",
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
        !adding &&
        !shortcutHelpOpen &&
        choosing === null &&
        !editingRuleZero &&
        !managingTags &&
        printingFor === null &&
        replacing === null &&
        search.card === undefined;
    const previewed = menued ?? (quiet ? (hovered ?? leader) : null);

    // Tagging a card files it into another group, and the card that slides into
    // its place under the resting pointer gets no `mouseenter` of its own. The
    // keys would go on editing the card that left, so what is under the pointer
    // is read back after every render.
    usePointerCard(setActive);

    // One key each, live only while no dialog has the screen. The first nine
    // tags answer to their number, which is what makes tagging a deck a matter
    // of running the pointer down it.
    useShortcuts(
        {
            ...Object.fromEntries(tags.slice(0, 9).map((tag, index) => [String(index + 1), () => void quickTag(tag)])),
            a: () => setAdding(true),
            "mod+f": openDeckSearch,
            v: () => setChoosing("view"),
            g: () => setChoosing("group"),
            t: () => setManagingTags(true),
            p: () => {
                const card = resolved.find((slot) => slot.uuid === active);
                if (card !== undefined) pickPrinting(card);
            },
            f: () => {
                const card = hovered;
                if (card !== null) void toggleFoil(card, !card.foil);
            },
            x: () => {
                const card = hovered;
                if (card !== null) void toggleProxy(card, !card.proxy);
            },
        },
        quiet,
    );

    useShortcuts(
        {
            v: () => setChoosing(choosing === "view" ? null : "view"),
            g: () => setChoosing(choosing === "group" ? null : "group"),
        },
        choosing !== null && !shortcutHelpOpen,
        true,
    );

    /** Opens the search within this deck and puts the next keystroke into it */
    function openDeckSearch() {
        setFinding(true);
        requestAnimationFrame(() => {
            deckSearch.current?.focus();
            deckSearch.current?.select();
        });
    }

    /** Closes the search within this deck and shows every card again */
    function closeDeckSearch() {
        setFinding(false);
        setDeckQuery("");
    }

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

    /**
     * Persists and applies a different card layout
     *
     * @param next the selected layout
     */
    function changeView(next: DeckView) {
        setViewSettings({ sort, size, view: next });
        go({ view: next === "grid" ? undefined : next });
    }

    /**
     * Persists and applies a different grid tile size
     *
     * @param next the selected tile size
     */
    function changeSize(next: DeckTileSize) {
        setViewSettings({ sort, size: next, view });
        go({ size: next === "m" ? undefined : next });
    }

    /**
     * Persists and applies a different order within groups
     *
     * @param next the selected order
     */
    function changeSort(next: DeckSort) {
        setViewSettings({ sort: next, size, view });
        go({ sort: next === "name" ? undefined : next });
    }

    // The claimed bracket follows the cards upward on its own: a deck that
    // provably plays above its claim is re-labelled rather than left warning
    // forever, and the toast says so. Only upward — the detection can prove a
    // deck plays over a bracket, never that it plays under one, and a claim
    // deliberately set high must not be argued down by an incomplete read.
    useEffect(() => {
        if (deck.bracket == null || plays === null || plays <= deck.bracket) return;
        void saveBracket(plays, t("toast.bracket-raised", { number: plays }));
    }, [plays, deck.bracket, deckUuid]);

    // A filter about one deck's remarks means nothing on another deck.
    useEffect(() => {
        setFocus(null);
    }, [deckUuid]);

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

    useEffect(() => {
        if (menued === null) {
            setMenuPrinting(null);
            return;
        }
        let dropped = false;
        void resolvePrintings([menued.printing]).then((found) => {
            if (!dropped) setMenuPrinting(found.get(menued.printing) ?? null);
        });
        return () => {
            dropped = true;
        };
    }, [menued]);

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
    /**
     * Reads a dropped Scryfall link and files the card into the current zone.
     *
     * The same payload the search hits and the collection page speak: a public
     * Scryfall url, which is also what a card dragged straight out of a
     * scryfall.com or EDHREC tab hands over.
     *
     * @param event the drop event
     */
    async function drop(event: React.DragEvent) {
        event.preventDefault();
        setDragOver(false);
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
        if (!(await add(printing))) return;
        notify.success(t("toast.card-dropped", { name: printing.name }));
    }

    /**
     * Files one copy of a printing into the current zone
     *
     * @param printing the card to file
     *
     * @returns whether the card was actually filed — `false` when the zone's
     *   own rules rejected it, so a caller that also toasts on success knows
     *   not to follow a rejection with one
     */
    async function add(printing: Printing): Promise<boolean> {
        if (deck.format === "commander" && zone === "Commander" && !canBeCommander(printing)) {
            notify.error(t("toast.not-a-commander"));
            return false;
        }
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
        return true;
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
     * Whether a card already sits in the deck, whichever zone holds it
     *
     * What the search's "already in" filter hides. Deliberately wider than
     * {@link copiesOf}: a card commanding the deck or parked in the maybeboard
     * is already accounted for, and offering it as a fresh hit while filing
     * into the main deck invites a second copy nobody wanted. Counted by name,
     * for the same reason as there.
     *
     * @param printing the card as the search found it
     *
     * @returns whether some zone of {@link INCLUDED_ZONES} holds it
     */
    function isIncluded(printing: Printing): boolean {
        return resolved.some((slot) => INCLUDED_ZONES.includes(slot.zone) && slot.card?.name === printing.name);
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
        if (deck.format === "commander" && next === "Side") return;
        if (deck.format === "commander" && next === "Commander") {
            const found = await resolvePrintings([card.printing]);
            const printing = found.get(card.printing);
            if (printing === undefined || !canBeCommander(printing)) {
                notify.error(t("toast.not-a-commander"));
                return;
            }
        }
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
     * Marks a slot as a proxy, or clears the mark again
     *
     * @param card the slot
     * @param proxy whether the copies are stand-ins
     */
    async function toggleProxy(card: DeckCardResponse, proxy: boolean) {
        await Api.decks.cards.update(deckUuid, card.uuid, { proxy });
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
    async function createTags(wanted: Array<{ name: string; color: TagColor; icon: TagIconName; global: boolean }>) {
        for (const tag of wanted) {
            await Api.decks.tags.create(deckUuid, {
                name: tag.name,
                color: tag.color,
                icon: tag.icon,
                global: tag.global,
            });
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
     * @param icon the pictogram drawn inside the colour
     * @param global whether it is offered on every deck
     */
    async function saveTag(tag: DeckTagResponse, name: string, color: TagColor, icon: TagIconName, global: boolean) {
        await Api.decks.tags.update(deckUuid, tag.uuid, { name, color, icon, global });
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
     * Opens the print picker for a slot, with what is in the collections at hand
     *
     * @param card the slot whose print is being changed
     */
    function pickPrinting(card: DeckCardResponse) {
        setPrintingFor(card.uuid);
        if (sourcing !== null) return;
        void Api.decks.sourcing.read(deckUuid).then(setSourcing);
        void Api.collections
            .list()
            .then((collections) => setShelf(collections.filter((entry) => entry.collection.deck == null)));
    }

    /**
     * The copies of a slot's current print that are lying in the deck
     *
     * Empty for a deck that keeps no collection, and that is the whole test:
     * nothing is asked when there is no cardboard the switch could strand.
     *
     * @param card the slot being switched
     * @param where what the deck holds, as it was last read
     *
     * @returns the stacks under it
     */
    function filedUnder(card: DeckCardResponse, where: DeckSourcingResponse | null = sourcing) {
        return (where?.filed ?? []).filter((stack) => stack.printing === card.printing);
    }

    /**
     * Puts a slot on another print of the same card
     *
     * A deck that keeps a collection is a box of cardboard, and the list moving
     * on does not reach into it: when copies of the old print are lying in the
     * deck, the switch stops and asks what should happen to them.
     *
     * @param card the slot to change
     * @param printing the print run it should hold
     */
    async function switchPrinting(card: DeckCardResponse, printing: Printing) {
        setPrintingFor(null);
        if (printing.id === card.printing) return;

        // Picked before the read the picker started came back: waiting on it is
        // the difference between asking the question and skipping it silently.
        let where = sourcing;
        if (where === null) {
            where = await Api.decks.sourcing.read(deckUuid);
            setSourcing(where);
        }

        if (filedUnder(card, where).length > 0) {
            setSwitching({ card, printing });
            return;
        }
        await writePrinting(card, printing);
    }

    /**
     * Writes the new print and says so
     *
     * @param card the slot to change
     * @param printing the print run it should hold
     */
    async function writePrinting(card: DeckCardResponse, printing: Printing) {
        await Api.decks.cards.update(deckUuid, card.uuid, { printing: printing.id });
        notify.success(t("toast.printing-changed"));
        await reloadSourcing();
        await refresh();
    }

    /**
     * Sorts the copies of the old print out of the deck, then switches the slot
     *
     * @param target where they go, `null` to send each stack back where it came from
     */
    async function returnAndSwitch(target: string | null) {
        if (switching === null) return;
        const { card, printing } = switching;
        setSwitching(null);
        for (const stack of filedUnder(card)) {
            await Api.decks.sourcing.returnCards(deckUuid, stack.uuid, stack.quantity, target);
        }
        notify.success(t("toast.printing-returned"));
        await writePrinting(card, printing);
    }

    /**
     * Reads where the deck's cards lie again, so the next switch asks about the
     * cardboard as it is now rather than as it was when the picker first opened
     */
    async function reloadSourcing() {
        if (sourcing === null) return;
        setSourcing(await Api.decks.sourcing.read(deckUuid));
    }

    /**
     * Writes which bracket the deck claims to be built to
     *
     * @param bracket the bracket, `null` to leave it unsaid
     * @param message the toast, when "changed" is not the whole story
     */
    async function saveBracket(bracket: number | null, message = t("toast.bracket-changed")) {
        await Api.decks.setBracket(deckUuid, bracket);
        notify.success(message);
        await router.invalidate();
    }

    return (
        <div
            className={tags.length > 0 ? "flex flex-col gap-6 pb-16" : "flex flex-col gap-6"}
            style={{ "--deck-bar": `${barHeight}px` } as CSSProperties}
        >
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
                searchOpen={finding}
                searchQuery={deckQuery}
                searchRef={deckSearch}
                onOpenSearch={openDeckSearch}
                onChangeSearch={(query) => {
                    setDeckQuery(query);
                    setActive(null);
                }}
                onCloseSearch={closeDeckSearch}
                onChangeView={changeView}
                onChangeSize={changeSize}
                onChangeGrouping={(next) => go({ group: next === "type" ? undefined : next })}
                onChangeSort={changeSort}
                onAdd={() => setAdding(true)}
                onEditRuleZero={() => setEditingRuleZero(true)}
                focus={focus}
                onFocus={setFocus}
                onClearFocus={() => setFocus(null)}
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
                        flipped={previewed !== null && flippedCards.isFlipped(previewed.uuid)}
                    />
                </aside>

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
                            ? "flex min-w-0 flex-1 flex-col gap-4 rounded-lg outline-2 outline-offset-4 outline-blue-500 outline-dashed"
                            : "flex min-w-0 flex-1 flex-col gap-4 rounded-lg"
                    }
                >
                    {resolved.length === 0 ? (
                        <EmptyState title={t("heading.no-cards")} description={t("description.no-cards")} />
                    ) : shown.length === 0 ? (
                        <EmptyState title={t("heading.no-cards-found")} description={t("description.no-cards-found")} />
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
                            isFlipped={(card) => flippedCards.isFlipped(card.uuid)}
                            onFlip={(card) => flippedCards.toggle(card.uuid)}
                            onMenu={(card, at) => setMenu({ card: card.uuid, at })}
                            isCollapsed={collapsedGroups.isCollapsed}
                            onToggleGroup={collapsedGroups.toggle}
                        />
                    ) : view === "list" ? (
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
                            isFlipped={(card) => flippedCards.isFlipped(card.uuid)}
                            onFlip={(card) => flippedCards.toggle(card.uuid)}
                            onMenu={(card, at) => setMenu({ card: card.uuid, at })}
                            isCollapsed={collapsedGroups.isCollapsed}
                            onToggleGroup={collapsedGroups.toggle}
                        />
                    ) : (
                        <DeckCardTable
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
                            isFlipped={(card) => flippedCards.isFlipped(card.uuid)}
                            onFlip={(card) => flippedCards.toggle(card.uuid)}
                            onMenu={(card, at) => setMenu({ card: card.uuid, at })}
                            isCollapsed={collapsedGroups.isCollapsed}
                            onToggleGroup={collapsedGroups.toggle}
                        />
                    )}
                </div>
            </div>

            <DeckTagDock tags={tags} onManage={() => setManagingTags(true)} />

            <Dialog open={choosing !== null} onClose={() => setChoosing(null)} size={"sm"}>
                <DialogTitle>{choosing === "view" ? t("label.view") : t("label.grouping")}</DialogTitle>
                <DialogBody>
                    {choosing === "view" ? (
                        <RadioGroup
                            value={view}
                            onChange={(next: string) => {
                                setChoosing(null);
                                requestAnimationFrame(() => {
                                    startTransition(() => changeView(next as DeckView));
                                });
                            }}
                        >
                            {DECK_VIEWS.map((option) => (
                                <RadioField key={option}>
                                    <Radio value={option} color={"blue"} />
                                    <Label>{t(`label.view-${option}`)}</Label>
                                </RadioField>
                            ))}
                        </RadioGroup>
                    ) : (
                        <RadioGroup
                            value={grouping}
                            onChange={(next: string) => {
                                const group = next as DeckGrouping;
                                setChoosing(null);
                                requestAnimationFrame(() => {
                                    startTransition(() => go({ group: group === "type" ? undefined : group }));
                                });
                            }}
                        >
                            {DECK_GROUPINGS.map((option) => (
                                <RadioField key={option}>
                                    <Radio value={option} color={"blue"} />
                                    <Label>{labels.grouping(option)}</Label>
                                </RadioField>
                            ))}
                        </RadioGroup>
                    )}
                </DialogBody>
                <DialogActions>
                    <Button plain onClick={() => setChoosing(null)}>
                        {tg("button.close")}
                    </Button>
                </DialogActions>
            </Dialog>

            <AddCardsDialog
                open={adding}
                zone={zone}
                zones={zones}
                onChangeZone={(next) => go({ zone: next === "Main" ? undefined : next })}
                constraints={constraints}
                countOf={copiesOf}
                includedOf={isIncluded}
                onAdd={async (printing) => {
                    await add(printing);
                }}
                onRemove={subtract}
                onClose={() => setAdding(false)}
                // The graph's corpus is commander-legal; its filters follow the
                // advisor and stay commander-only for now. That cut is made on
                // the server, so a deck that agreed to the banned list will not
                // find those cards among the graph's hits — the Scryfall half
                // of the search is where they turn up.
                graph={deck.format === "commander"}
                graphIdentity={bound ? legality.allowedColors : undefined}
                // A commander deck is singletons, so a name search ends with
                // its card; in a 4-of format the query has to survive the
                // first copy.
                clearNameSearches={deck.format === "commander"}
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
                            {zones
                                .filter(
                                    (option) =>
                                        option !== inspecting.zone &&
                                        (option !== "Commander" || (inspected !== null && canBeCommander(inspected))),
                                )
                                .map((option) => (
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
            ></CardDetailDialog>

            <DeckTagsDialog
                open={managingTags}
                tags={tags}
                onCreate={(wanted) => void createTags(wanted)}
                onUpdate={(tag, name, color, icon, global) => saveTag(tag, name, color, icon, global)}
                onDelete={(tag) => void deleteTag(tag)}
                onClose={() => setManagingTags(false)}
            />

            <DeckCardMenu
                card={menued}
                at={menu?.at ?? null}
                tags={tags}
                zones={zones.filter(
                    (option) =>
                        option !== "Commander" ||
                        menued?.zone === "Commander" ||
                        (menuPrinting !== null && canBeCommander(menuPrinting)),
                )}
                onInspect={(card) => go({ card: card.uuid })}
                onChangeQuantity={(card, quantity) => void changeQuantity(card, quantity)}
                onMoveTo={(card, next) => void moveTo(card, next)}
                onChangePrinting={pickPrinting}
                onReplace={
                    deck.format === "commander"
                        ? (card) => {
                              if (card.card?.oracle_id != null) setReplacing(card);
                          }
                        : undefined
                }
                onToggleFoil={(card, foil) => void toggleFoil(card, foil)}
                onToggleProxy={(card, proxy) => void toggleProxy(card, proxy)}
                onToggleTag={(card, tag, on) => void toggleTag(card, tag, on)}
                onDelete={(card) => void remove(card)}
                onClose={() => setMenu(null)}
            />

            <PrintingDialog
                owned={
                    sourcing === null ? undefined : new Set(sourcing.candidates.map((candidate) => candidate.printing))
                }
                card={printed?.card == null ? null : { name: printed.card.name, printing: printed.printing }}
                onPick={(printing) => {
                    if (printed !== null) void switchPrinting(printed, printing);
                }}
                proxy={printed?.proxy}
                onToggleProxy={(proxy) => {
                    if (printed !== null) void toggleProxy(printed, proxy);
                }}
                onClose={() => setPrintingFor(null)}
            />

            <DeckPrintingSwitchDialog
                change={
                    switching === null
                        ? null
                        : {
                              name: switching.card.card?.name ?? switching.printing.name,
                              to: `${switching.printing.setCode} ${switching.printing.collectorNumber}`,
                              stacks: filedUnder(switching.card),
                          }
                }
                collections={shelf}
                busy={false}
                onReturn={(target) => void returnAndSwitch(target)}
                onKeep={() => {
                    const pending = switching;
                    setSwitching(null);
                    if (pending !== null) void writePrinting(pending.card, pending.printing);
                }}
                onClose={() => setSwitching(null)}
            />

            {/* Mounted only while open: this component re-renders on every
                card the pointer crosses, and there is no reason to hold the
                dialog's own settings query and graph request live until a
                slot is actually marked. */}
            {replacing !== null && (
                <DeckReplaceDialog
                    card={replacing}
                    onClose={() => setReplacing(null)}
                    deckUuid={deckUuid}
                    deck={advisor}
                    speed={bracketSpeed(deck.bracket)}
                    onReplaced={() => void router.invalidate()}
                />
            )}

            <DeckRuleZeroDialog
                open={editingRuleZero}
                deck={deck}
                colors={legality.allowedColors}
                formatSize={rules?.deck_size.cards ?? null}
                onClose={() => setEditingRuleZero(false)}
                onSaved={() => router.invalidate()}
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
