import {
    ArrowPathIcon,
    ArrowsPointingOutIcon,
    ArrowUturnLeftIcon,
    ArrowUturnUpIcon,
    ArrowsRightLeftIcon,
    DocumentPlusIcon,
    EyeIcon,
    FireIcon,
    ForwardIcon,
    HandRaisedIcon,
    MagnifyingGlassIcon,
    RectangleStackIcon,
    SparklesIcon,
    XMarkIcon,
} from "@heroicons/react/20/solid";
import { createFileRoute, useLoaderData, useNavigate } from "@tanstack/react-router";
import clsx from "clsx";
import { Button, EmptyState, Field, Heading, Input, Label, PrimaryButton, Text } from "components";
import { AnimatePresence, LayoutGroup, MotionConfig } from "motion/react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { CardZoomDialog } from "src/components/card-zoom-dialog";
import { ContextMenu, useContextMenu } from "src/components/context-menu";
import type { MenuAt } from "src/components/context-menu";
import { GoldfishCard as TableCard } from "src/components/goldfish-card";
import type { ScreenPoint } from "src/components/goldfish-card";
import { GoldfishCardMenu } from "src/components/goldfish-card-menu";
import { CAST_DURATION, GoldfishCastStage } from "src/components/goldfish-cast-stage";
import { GoldfishCounterDialog } from "src/components/goldfish-counter-dialog";
import { GoldfishDrawDialog } from "src/components/goldfish-draw-dialog";
import { useGoldfishZoneLabel } from "src/components/goldfish-labels";
import { GoldfishLife } from "src/components/goldfish-life";
import { GoldfishPile } from "src/components/goldfish-pile";
import { GoldfishPreview } from "src/components/goldfish-preview";
import { GoldfishRotateNotice } from "src/components/goldfish-rotate-notice";
import { GoldfishTokenDialog } from "src/components/goldfish-token-dialog";
import { GoldfishZoneOverlay } from "src/components/goldfish-zone-overlay";
import { QuietButton } from "src/components/quiet-button";
import type {
    GoldfishCard as GoldfishCard,
    GoldfishGame,
    GoldfishZone,
    LibraryEnd,
    TokenSource,
} from "src/utils/goldfish";
import {
    changeCounter,
    changeLife,
    copyCard,
    createToken,
    draw,
    inZone,
    isLand,
    loadGame,
    moveCard,
    mulligan,
    newGame,
    nextTurn,
    saveGame,
    shuffleLibrary,
    startingLifeFor,
    toggleFlipped,
    toggleTapped,
    untapAll,
} from "src/utils/goldfish";
import type { Printing } from "src/utils/scryfall";
import { relatedTokens, resolvePrintings } from "src/utils/scryfall";
import type { CardRecord } from "src/types";
import { usePointerCard } from "src/utils/use-pointer-card";
import { useShortcuts } from "src/utils/use-shortcuts";
import { useBareChrome } from "src/context/chrome-context";
import { usePageShortcuts } from "src/context/shortcut-help-context";
import { useFullscreen } from "src/utils/use-fullscreen";
import { useMediaQuery } from "src/utils/use-media-query";
import { useTableOrientation } from "src/utils/use-table-orientation";
import { useWakeLock } from "src/utils/use-wake-lock";

/** The sizes cards can be drawn at, smallest first */
const SIZES = ["s", "m", "l"] as const;

/** One of the card sizes */
type CardSize = (typeof SIZES)[number];

/** How wide a card on the battlefield is drawn, per size */
const TABLE_CARD: Record<CardSize, string> = {
    s: "w-20 sm:w-24",
    m: "w-24 sm:w-28 lg:w-32",
    l: "w-28 sm:w-36 lg:w-40",
};

/** How many moves can be taken back */
const HISTORY_LIMIT = 100;

/** How wide a card in hand is drawn, per size */
const HAND_CARD: Record<CardSize, string> = {
    s: "w-16 sm:w-20",
    m: "w-20 sm:w-24 lg:w-28",
    l: "w-24 sm:w-32",
};

/** Where the chosen size is kept */
const SIZE_KEY = "mtg.goldfish.size";

/**
 * The size cards were last drawn at
 *
 * @returns the size, medium when none was chosen
 */
function loadSize(): CardSize {
    try {
        const stored = window.localStorage.getItem(SIZE_KEY);
        return SIZES.find((size) => size === stored) ?? "m";
    } catch {
        return "m";
    }
}

/**
 * A table card as the zoom viewer wants it
 *
 * @param card the card
 *
 * @returns the record, or `null` when the card has no scan
 */
function recordOf(card: GoldfishCard | null): CardRecord | null {
    if (card === null) return null;
    const image = card.flipped ? card.backImage : card.image;
    if (image === null) return null;
    return {
        id: card.id,
        name: card.name,
        setName: "",
        setCode: "",
        collectorNumber: "",
        manaCost: card.manaCost,
        typeLine: card.typeLine,
        colors: [],
        imageUrl: image,
        priceEur: null,
    };
}

export const Route = createFileRoute("/_menu/decks/$deckUuid/_deck/goldfish")({
    loader: async ({ params }) => {
        const { cards } = await Api.decks.cards.list(params.deckUuid);
        const missing = [...new Set(cards.filter((card) => card.card == null).map((card) => card.printing))];
        const printings = missing.length > 0 ? await resolvePrintings(missing) : new Map<string, Printing>();
        return { cards, printings };
    },
    component: RouteComponent,
});

/**
 * Playing the deck against nobody.
 *
 * @returns the page
 */
function RouteComponent() {
    const { cards, printings } = Route.useLoaderData();
    const { deck } = useLoaderData({ from: "/_menu/decks/$deckUuid/_deck" });
    const [t] = useTranslation("goldfish");
    const zoneLabel = useGoldfishZoneLabel();
    const navigate = useNavigate();

    const [game, setGame] = useState<GoldfishGame | null>(() => loadGame(deck.uuid));
    const [startingLife, setStartingLife] = useState(() => String(startingLifeFor(deck.format)));
    const [deckTokens, setDeckTokens] = useState<Array<Printing> | null>(null);
    const [tokensOpen, setTokensOpen] = useState(false);
    const [countersOn, setCountersOn] = useState<GoldfishCard | null>(null);
    const [zoneOpen, setZoneOpen] = useState<GoldfishZone | null>(null);
    const [zoomed, setZoomed] = useState<GoldfishCard | null>(null);
    const [hovered, setHovered] = useState<string | null>(null);
    const [size, setSize] = useState<CardSize>(loadSize);
    const menu = useContextMenu<GoldfishCard>();
    const [libraryMenuAt, setLibraryMenuAt] = useState<MenuAt | null>(null);
    const [drawing, setDrawing] = useState(false);
    const [over, setOver] = useState<GoldfishZone | null>(null);
    const [shakes, setShakes] = useState(0);
    const [history, setHistory] = useState<Array<GoldfishGame>>([]);
    const [casting, setCasting] = useState<GoldfishCard | null>(null);
    const latest = useRef(game);
    latest.current = game;
    const mobile = useMediaQuery("(max-width: 1023px), (pointer: coarse) and (max-height: 600px)");
    const orientation = useTableOrientation();
    const fullscreen = useFullscreen(true);
    const playing = game !== null;
    useBareChrome(mobile && playing);
    useWakeLock();
    const tokensAsked = useRef(false);

    usePointerCard(setHovered);

    useEffect(() => saveGame(deck.uuid, game), [deck.uuid, game]);

    useEffect(() => {
        if (!tokensOpen || tokensAsked.current) return;
        tokensAsked.current = true;
        const ids = cards
            .filter((card) => card.zone === "Main" || card.zone === "Commander")
            .map((card) => card.printing);
        void relatedTokens(ids).then(setDeckTokens);
    }, [tokensOpen, cards]);

    const playable = cards.some((card) => card.zone === "Main");

    /**
     * Applies a move to the game in progress
     *
     * @param step the move
     */
    function apply(step: (game: GoldfishGame) => GoldfishGame) {
        const current = latest.current;
        if (current === null) return;
        const next = step(current);
        if (next === current) return;
        latest.current = next;
        setHistory((past) => [...past.slice(-(HISTORY_LIMIT - 1)), current]);
        setGame(next);
    }

    /**
     * Brings a commander onto the table with the ceremony it deserves
     *
     * @param card the card, from the command zone
     */
    function cast(card: GoldfishCard) {
        if (casting !== null) return;
        setCasting(card);
        window.setTimeout(() => {
            apply((current) => moveCard(current, card.id, "battlefield"));
            setCasting(null);
        }, CAST_DURATION);
    }

    /**
     * Takes the last move back
     */
    function undo() {
        const past = history[history.length - 1];
        if (past === undefined) return;
        setHistory((entries) => entries.slice(0, -1));
        latest.current = past;
        setGame(past);
    }

    /**
     * Starts over from a given game, forgetting every move so far
     *
     * @param next the game, `null` for none
     */
    function reset(next: GoldfishGame | null) {
        setHistory([]);
        latest.current = next;
        setGame(next);
    }

    /**
     * Draws the cards at another size, and remembers it
     *
     * @param next the size
     */
    function changeSize(next: CardSize) {
        setSize(next);
        try {
            window.localStorage.setItem(SIZE_KEY, next);
        } catch {
            return;
        }
    }

    /**
     * Deals a fresh game
     */
    function start() {
        const life = Math.max(1, Math.min(999, Number(startingLife) || startingLifeFor(deck.format)));
        reset(newGame(cards, printings, life));
        if (mobile && fullscreen.supported) fullscreen.enter();
    }

    /**
     * Sends a card somewhere
     *
     * @param card the card
     * @param zone where to
     * @param end which end of the library
     */
    function move(card: GoldfishCard, zone: GoldfishZone, end?: LibraryEnd) {
        apply((current) => moveCard(current, card.id, zone, end));
        if (zoneOpen === "hand") setZoneOpen(null);
    }

    /**
     * Mixes the library, visibly
     */
    function shuffle() {
        apply((current) => shuffleLibrary(current));
        setShakes((count) => count + 1);
    }

    /**
     * The zone under a point on the screen
     *
     * @param at the point
     *
     * @returns the zone and, for the library, which end of it
     */
    function zoneAt(at: ScreenPoint): { zone: GoldfishZone; end?: LibraryEnd } | null {
        const target = document.elementFromPoint(at.x, at.y)?.closest<HTMLElement>("[data-drop-zone]");
        if (target == null) return null;
        const zone = target.dataset.dropZone as GoldfishZone;
        const end = target.dataset.dropEnd as LibraryEnd | undefined;
        return { zone, end };
    }

    /**
     * Lights up the zone a dragged card is over
     *
     * @param at where the card is, `null` once it was let go
     */
    function dragMove(at: ScreenPoint | null) {
        setOver(at === null ? null : (zoneAt(at)?.zone ?? null));
    }

    /**
     * Sends a dropped card where it was dropped
     *
     * @param card the card
     * @param at where it landed
     */
    function drop(card: GoldfishCard, at: ScreenPoint) {
        setOver(null);
        const target = zoneAt(at);
        if (target === null) return;
        if (target.zone === card.zone && target.zone !== "library") return;
        if (card.zone === "command" && target.zone === "battlefield") {
            cast(card);
            return;
        }
        move(card, target.zone, target.end);
    }

    /**
     * Puts tokens onto the battlefield
     *
     * @param token what they are
     * @param count how many
     */
    function make(token: TokenSource, count: number) {
        apply((current) => createToken(current, token, count));
    }

    const focused = hovered === null ? null : (game?.cards.find((card) => card.id === hovered) ?? null);

    /**
     * Sends the card under the pointer somewhere
     *
     * @param zone where to
     * @param end which end of the library
     *
     * @returns the handler
     */
    function focusedTo(zone: GoldfishZone, end?: LibraryEnd): () => void {
        return () => {
            if (focused !== null) move(focused, zone, end);
        };
    }

    useShortcuts(
        {
            d: () => apply((current) => draw(current, 1)),
            n: () => apply(nextTurn),
            u: () => apply(untapAll),
            s: shuffle,
            t: () => setTokensOpen(true),
            M: () => apply((current) => (current.turn === 1 ? mulligan(current) : current)),
            m: () =>
                apply((current) => {
                    const top = inZone(current, "library")[0];
                    return top === undefined ? current : moveCard(current, top.id, "graveyard");
                }),
            Z: () => setZoomed(game === null ? null : (inZone(game, "library")[0] ?? null)),
            l: () => setZoneOpen("library"),
            D: () => setDrawing(true),
            G: () => setZoneOpen("graveyard"),
            X: () => setZoneOpen("exile"),
            "+": () => apply((current) => changeLife(current, 1)),
            "=": () => apply((current) => changeLife(current, 1)),
            "-": () => apply((current) => changeLife(current, -1)),
            "mod+z": undo,
            " ": () => {
                if (focused?.zone === "battlefield") apply((current) => toggleTapped(current, focused.id));
            },
            p: () => {
                if (focused === null) return;
                if (focused.zone === "command") cast(focused);
                else move(focused, "battlefield");
            },
            escape: () => setZoneOpen(null),
            h: focusedTo("hand"),
            g: focusedTo("graveyard"),
            x: focusedTo("exile"),
            o: focusedTo("library", "top"),
            b: focusedTo("library", "bottom"),
            k: focusedTo("command"),
            c: () => {
                if (focused?.zone === "battlefield") setCountersOn(focused);
            },
            "1": () => {
                if (focused?.zone === "battlefield") apply((current) => changeCounter(current, focused.id, "+1/+1", 1));
            },
            "!": () => {
                if (focused?.zone === "battlefield")
                    apply((current) => changeCounter(current, focused.id, "+1/+1", -1));
            },
            f: () => {
                if (focused !== null) apply((current) => toggleFlipped(current, focused.id));
            },
            v: () => {
                if (focused?.zone === "battlefield") apply((current) => copyCard(current, focused.id));
            },
            z: () => setZoomed(focused),
        },
        game !== null,
    );

    const shortcutRows = [
        { keys: "D", description: t("button.draw") },
        { keys: "⇧ D", description: t("button.draw-many") },
        { keys: "N", description: t("button.next-turn") },
        { keys: "U", description: t("button.untap-all") },
        { keys: "S", description: t("button.shuffle") },
        { keys: "T", description: t("button.token") },
        { keys: "M", description: t("button.mill-top") },
        { keys: "⇧ Z", description: t("button.peek-top") },
        { keys: "⇧ M", description: t("button.mulligan") },
        { keys: "L", description: t("button.look-library") },
        { keys: "⇧ G", description: t("description.shortcut-open", { zone: zoneLabel("graveyard") }) },
        { keys: "⇧ X", description: t("description.shortcut-open", { zone: zoneLabel("exile") }) },
        { keys: "+ −", description: t("description.shortcut-life") },
        { keys: "Ctrl/⌘ Z", description: t("button.undo") },
        { keys: "Leertaste", description: t("description.shortcut-tap") },
        { keys: "P", description: t("description.shortcut-card", { action: t("button.to-battlefield") }) },
        { keys: "H", description: t("description.shortcut-card", { action: t("button.to-hand") }) },
        { keys: "G", description: t("description.shortcut-card", { action: t("button.to-graveyard") }) },
        { keys: "X", description: t("description.shortcut-card", { action: t("button.to-exile") }) },
        { keys: "O", description: t("description.shortcut-card", { action: t("button.to-library-top") }) },
        { keys: "B", description: t("description.shortcut-card", { action: t("button.to-library-bottom") }) },
        { keys: "K", description: t("description.shortcut-card", { action: t("button.to-command") }) },
        { keys: "C", description: t("description.shortcut-card", { action: t("button.counters") }) },
        { keys: "1 / ⇧1", description: t("description.shortcut-card", { action: t("description.plus-counter") }) },
        { keys: "F", description: t("description.shortcut-card", { action: t("button.flip") }) },
        { keys: "V", description: t("description.shortcut-card", { action: t("button.copy") }) },
        { keys: "Z", description: t("description.shortcut-card", { action: t("button.zoom") }) },
        { keys: "Esc", description: t("description.shortcut-close-zone") },
        { keys: "?", description: t("button.shortcuts") },
    ];
    usePageShortcuts(shortcutRows);

    if (game === null) {
        if (!playable) {
            return <EmptyState title={t("heading.no-cards")} description={t("description.no-cards")} />;
        }
        return (
            <div className={"flex flex-col gap-6"}>
                <div className={"flex flex-col gap-2"}>
                    <Heading>{t("heading.start")}</Heading>
                    <Text>{t("description.start")}</Text>
                </div>
                <div className={"flex flex-col gap-4 sm:flex-row sm:items-end"}>
                    <Field className={"sm:w-40"}>
                        <Label>{t("label.starting-life")}</Label>
                        <Input
                            type={"number"}
                            inputMode={"numeric"}
                            min={1}
                            max={999}
                            value={startingLife}
                            onChange={(event) => setStartingLife(event.target.value)}
                        />
                    </Field>
                    <PrimaryButton onClick={start}>{t("button.start")}</PrimaryButton>
                </div>
                <Text>{t("description.shortcuts")}</Text>
            </div>
        );
    }

    const library = inZone(game, "library");
    const hand = inZone(game, "hand");
    const battlefield = inZone(game, "battlefield");
    const graveyard = inZone(game, "graveyard").reverse();
    const exile = inZone(game, "exile").reverse();
    const command = inZone(game, "command");
    const lands = battlefield.filter(isLand);
    const tableCard = mobile ? "w-14" : TABLE_CARD[size];
    const handCard = mobile ? "w-12" : HAND_CARD[size];
    const spells = battlefield.filter((card) => !isLand(card));
    const previewedId = menu.open?.item.id ?? hovered;
    const previewed = previewedId === null ? null : (game.cards.find((card) => card.id === previewedId) ?? null);

    /**
     * A row of permanents
     *
     * @param entries the permanents
     * @param empty what to say when there are none
     *
     * @returns the row
     */
    function row(entries: Array<GoldfishCard>, empty: string) {
        return (
            <div className={clsx("flex flex-wrap items-start", mobile ? "min-h-14 gap-2 p-2" : "min-h-24 gap-5 p-4")}>
                {entries.length === 0 && (
                    <div
                        className={clsx(
                            "w-full self-center text-center text-white/40",
                            mobile ? "py-1 text-xs" : "py-2 text-sm",
                        )}
                    >
                        {empty}
                    </div>
                )}
                <AnimatePresence mode={"popLayout"}>
                    {entries.map((card) => (
                        <TableCard
                            key={card.id}
                            card={card}
                            className={tableCard}
                            hint={card.tapped ? t("button.untap") : t("button.tap")}
                            onClick={() => apply((current) => toggleTapped(current, card.id))}
                            onOpenMenu={(at) => menu.openAt(card, at)}
                            onHover={(hovering) => setHovered(hovering ? card.id : null)}
                            onDragMove={dragMove}
                            onDrop={drop}
                            onCounter={(kind, amount) =>
                                apply((current) => changeCounter(current, card.id, kind, amount))
                            }
                        />
                    ))}
                </AnimatePresence>
            </div>
        );
    }

    const zoneCards =
        zoneOpen === null
            ? []
            : zoneOpen === "library"
              ? library
              : zoneOpen === "graveyard"
                ? graveyard
                : zoneOpen === "exile"
                  ? exile
                  : inZone(game, zoneOpen);

    /**
     * Shows a zone over the table, or the table again for the zone already shown
     *
     * @param zone the zone
     */
    function showZone(zone: GoldfishZone) {
        setZoneOpen((current) => (current === zone ? null : zone));
    }

    /**
     * An icon button of the action cluster
     *
     * @param icon the mark
     * @param label what it does
     * @param keys the key that does the same
     * @param onClick what it does
     * @param disabled whether it cannot be used right now
     *
     * @returns the button
     */
    function action(icon: ReactNode, label: string, keys: string, onClick: () => void, disabled = false) {
        return (
            <Button
                outline={true}
                size={mobile ? "sm" : "md"}
                disabled={disabled}
                aria-label={label}
                title={keys === "" ? label : `${label} · ${keys}`}
                onClick={onClick}
                className={mobile ? "justify-center" : "justify-start"}
            >
                {icon}
                {!mobile && label}
            </Button>
        );
    }

    const actions = (
        <div className={clsx("grid shrink-0 gap-1", mobile ? "grid-cols-5" : "grid-cols-2 gap-1.5 sm:w-max")}>
            {action(<DocumentPlusIcon />, t("button.draw"), "D", () => apply((current) => draw(current, 1)))}
            {action(<RectangleStackIcon />, t("button.draw-many"), "⇧ D", () => setDrawing(true))}
            {action(<ForwardIcon />, t("button.next-turn"), "N", () => apply(nextTurn))}
            {action(<ArrowUturnUpIcon />, t("button.untap-all"), "U", () => apply(untapAll))}
            {action(<SparklesIcon />, t("button.token"), "T", () => setTokensOpen(true))}
            {action(<ArrowsRightLeftIcon />, t("button.shuffle"), "S", shuffle)}
            {game.turn === 1
                ? action(<ArrowPathIcon />, t("button.mulligan"), "⇧ M", () => apply((current) => mulligan(current)))
                : action(<MagnifyingGlassIcon />, t("button.look-library"), "L", () => showZone("library"))}
            {action(<ArrowUturnLeftIcon />, t("button.undo"), "Ctrl/⌘ Z", undo, history.length === 0)}
            {mobile &&
                action(<ArrowPathIcon />, t("button.restart"), "", () =>
                    reset(newGame(cards, printings, game.startingLife)),
                )}
            {mobile && action(<XMarkIcon />, t("button.end"), "", () => reset(null))}
        </div>
    );

    if (mobile && orientation === "portrait") {
        return (
            <GoldfishRotateNotice
                onBack={() => void navigate({ to: "/decks/$deckUuid/cards", params: { deckUuid: deck.uuid } })}
            />
        );
    }

    return (
        <MotionConfig reducedMotion={"user"}>
            <LayoutGroup>
                <div className={clsx("flex flex-col", mobile ? "h-svh gap-1.5 p-1.5" : "gap-3")}>
                    {!mobile && (
                        <div className={"flex items-center justify-end gap-2"}>
                            <input
                                type={"range"}
                                min={0}
                                max={SIZES.length - 1}
                                step={1}
                                value={SIZES.indexOf(size)}
                                aria-label={t("label.card-size")}
                                title={t("label.card-size")}
                                onChange={(event) => changeSize(SIZES[Number(event.target.value)] ?? "m")}
                                className={clsx(
                                    "mr-auto h-1 w-20 cursor-pointer accent-(--color-accent)",
                                    mobile && "hidden",
                                )}
                            />
                            {mobile && fullscreen.supported && !fullscreen.active && (
                                <QuietButton onClick={fullscreen.enter}>
                                    <ArrowsPointingOutIcon className={"size-3.5"} />
                                    {t("button.fullscreen")}
                                </QuietButton>
                            )}
                            <QuietButton onClick={() => reset(newGame(cards, printings, game.startingLife))}>
                                <ArrowPathIcon className={"size-3.5"} />
                                {t("button.restart")}
                            </QuietButton>
                            <QuietButton onClick={() => reset(null)}>{t("button.end")}</QuietButton>
                        </div>
                    )}
                    <div className={clsx("flex items-start gap-6", mobile && "min-h-0 flex-1")}>
                        <aside className={"sticky top-6 hidden w-72 shrink-0 flex-col gap-3 xl:flex 2xl:w-80"}>
                            <GoldfishLife
                                life={game.life}
                                turn={game.turn}
                                mulligans={game.mulligans}
                                onChange={(amount) => apply((current) => changeLife(current, amount))}
                            />
                            <GoldfishPreview card={previewed} />
                        </aside>
                        <div
                            className={clsx(
                                "flex min-w-0 flex-1 flex-col",
                                mobile ? "h-full min-h-0 gap-1.5" : "gap-3",
                            )}
                        >
                            <div
                                className={clsx(
                                    "relative flex flex-col rounded-3xl bg-[radial-gradient(ellipse_at_50%_-20%,#2d6a4f_0%,#1b4332_45%,#0b2a1e_100%)] shadow-[inset_0_2px_24px_rgba(0,0,0,0.55),0_20px_50px_-30px_rgba(0,0,0,0.9)] ring-1 ring-black/40",
                                    mobile ? "min-h-0 flex-1 p-2.5" : "p-2 sm:p-3",
                                )}
                            >
                                <div
                                    className={
                                        "pointer-events-none absolute inset-0 rounded-3xl bg-[url('data:image/svg+xml;utf8,<svg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%22120%22%20height=%22120%22><filter%20id=%22n%22><feTurbulence%20type=%22fractalNoise%22%20baseFrequency=%220.9%22%20numOctaves=%222%22/></filter><rect%20width=%22120%22%20height=%22120%22%20filter=%22url(%23n)%22%20opacity=%220.35%22/></svg>')] opacity-[0.12] mix-blend-overlay"
                                    }
                                />
                                <div
                                    className={clsx(
                                        "pointer-events-none absolute rounded-2xl border border-white/10 [box-shadow:inset_0_0_0_1px_rgba(0,0,0,0.25)]",
                                        mobile ? "inset-1.5" : "inset-3",
                                    )}
                                />
                                <div
                                    className={clsx(
                                        "relative flex",
                                        mobile ? "min-h-0 flex-1 gap-1.5" : "min-h-[26rem] gap-2 sm:gap-3",
                                    )}
                                >
                                    {command.length > 0 && (
                                        <div
                                            data-drop-zone={"command"}
                                            title={zoneLabel("command")}
                                            className={clsx(
                                                "flex shrink-0 flex-col items-center rounded-2xl border border-dashed border-amber-200/25 bg-black/10 transition",
                                                mobile ? "gap-1 self-start p-1.5" : "gap-2 p-2",
                                                over === "command" && "bg-blue-500/10 ring-2 ring-blue-400",
                                            )}
                                        >
                                            <span
                                                className={clsx(
                                                    "font-semibold tracking-[0.2em] text-amber-100/70 uppercase",
                                                    mobile ? "text-[8px]/3" : "text-[10px]/4",
                                                )}
                                            >
                                                {zoneLabel("command")}
                                            </span>
                                            <div className={clsx("flex", mobile ? "flex-row gap-1" : "flex-col gap-2")}>
                                                <AnimatePresence mode={"popLayout"}>
                                                    {command
                                                        .filter((card) => card.id !== casting?.id)
                                                        .map((card) => (
                                                            <TableCard
                                                                key={card.id}
                                                                card={card}
                                                                className={handCard}
                                                                hint={t("button.to-battlefield")}
                                                                onClick={() => cast(card)}
                                                                onOpenMenu={(at) => menu.openAt(card, at)}
                                                                onHover={(hovering) =>
                                                                    setHovered(hovering ? card.id : null)
                                                                }
                                                                onDragMove={dragMove}
                                                                onDrop={drop}
                                                            />
                                                        ))}
                                                </AnimatePresence>
                                            </div>
                                        </div>
                                    )}
                                    <div
                                        data-drop-zone={"battlefield"}
                                        className={clsx(
                                            "flex min-w-0 grow flex-col divide-y divide-white/10 rounded-2xl transition",
                                            mobile && "min-h-0 overflow-y-auto",
                                            over === "battlefield" && "bg-blue-500/10 ring-2 ring-blue-400",
                                        )}
                                    >
                                        <div className={"grow"}>{row(spells, t("description.empty-battlefield"))}</div>
                                        <div>
                                            <div
                                                className={clsx(
                                                    "font-semibold tracking-[0.2em] text-white/40 uppercase",
                                                    mobile ? "px-2 pt-1 text-[8px]/3" : "px-3 pt-2 text-[10px]/4",
                                                )}
                                            >
                                                {t("label.lands")}
                                            </div>
                                            {row(lands, t("description.empty-lands"))}
                                        </div>
                                    </div>
                                    <div
                                        className={clsx(
                                            "flex shrink-0 flex-col items-center",
                                            mobile ? "justify-start gap-1 self-start" : "justify-between gap-2",
                                        )}
                                    >
                                        <div className={clsx("flex flex-col", mobile ? "gap-1" : "gap-2")}>
                                            <GoldfishPile
                                                zone={"exile"}
                                                over={over === "exile"}
                                                label={zoneLabel("exile")}
                                                cards={exile}
                                                hint={t("description.open-zone")}
                                                onClick={() => showZone("exile")}
                                                className={mobile ? "w-10" : undefined}
                                                compact={mobile}
                                            />
                                            <GoldfishPile
                                                zone={"graveyard"}
                                                over={over === "graveyard"}
                                                label={zoneLabel("graveyard")}
                                                cards={graveyard}
                                                hint={t("description.open-zone")}
                                                onClick={() => showZone("graveyard")}
                                                className={mobile ? "w-10" : undefined}
                                                compact={mobile}
                                            />
                                        </div>
                                        <GoldfishPile
                                            zone={"library"}
                                            over={over === "library"}
                                            shakes={shakes}
                                            label={zoneLabel("library")}
                                            cards={library}
                                            faceDown={true}
                                            hint={t("description.draw-hint")}
                                            onClick={() => apply((current) => draw(current, 1))}
                                            onOpenMenu={setLibraryMenuAt}
                                            className={mobile ? "w-10" : undefined}
                                            compact={mobile}
                                        />
                                    </div>
                                </div>
                                <AnimatePresence>
                                    {zoneOpen !== null && (
                                        <GoldfishZoneOverlay
                                            key={zoneOpen}
                                            zone={zoneOpen}
                                            cards={zoneCards}
                                            menued={menu.open?.item.id ?? null}
                                            onZoom={setZoomed}
                                            onPick={
                                                zoneOpen === "hand" ? (card) => move(card, "battlefield") : undefined
                                            }
                                            hint={zoneOpen === "hand" ? t("description.pick-hand") : undefined}
                                            onOpenMenu={menu.openAt}
                                            onHover={(card) => setHovered(card?.id ?? null)}
                                            onShuffle={shuffle}
                                            onClose={() => setZoneOpen(null)}
                                            fullscreen={mobile && zoneOpen === "hand"}
                                        />
                                    )}
                                </AnimatePresence>
                                <AnimatePresence>
                                    {casting !== null && <GoldfishCastStage card={casting} />}
                                </AnimatePresence>
                            </div>

                            <div className={clsx("flex flex-wrap items-start", mobile ? "shrink-0 gap-1.5" : "gap-3")}>
                                <div className={"flex items-stretch gap-1.5 xl:hidden"}>
                                    <GoldfishLife
                                        life={game.life}
                                        turn={game.turn}
                                        mulligans={game.mulligans}
                                        compact={mobile}
                                        onChange={(amount) => apply((current) => changeLife(current, amount))}
                                    />
                                    {mobile && (
                                        <button
                                            type={"button"}
                                            onClick={() => showZone("hand")}
                                            aria-label={t("button.show-hand")}
                                            title={t("button.show-hand")}
                                            className={clsx(
                                                "flex w-10 flex-col items-center justify-center gap-0.5 rounded-xl ring-1 ring-zinc-950/10 transition dark:ring-white/15",
                                                zoneOpen === "hand"
                                                    ? "bg-blue-500/15 text-blue-600 dark:text-blue-300"
                                                    : "bg-zinc-950/5 text-zinc-600 hover:bg-zinc-950/10 dark:bg-white/5 dark:text-zinc-300 dark:hover:bg-white/10",
                                            )}
                                        >
                                            <HandRaisedIcon className={"size-5"} />
                                            <span className={"text-[10px]/3 font-semibold tabular-nums"}>
                                                {hand.length}
                                            </span>
                                        </button>
                                    )}
                                </div>
                                <div
                                    data-drop-zone={"hand"}
                                    className={clsx(
                                        "flex min-w-0 flex-1 rounded-2xl bg-zinc-950/5 transition dark:bg-white/5",
                                        mobile
                                            ? "min-h-16 overflow-x-auto overscroll-x-contain p-1"
                                            : "min-h-28 flex-wrap p-2 pt-3",
                                        over === "hand" && "bg-blue-500/10 ring-2 ring-blue-400",
                                    )}
                                >
                                    {hand.length === 0 && (
                                        <div
                                            className={
                                                "w-full self-center py-3 text-center text-sm text-zinc-500 dark:text-zinc-400"
                                            }
                                        >
                                            {t("description.empty-hand")}
                                        </div>
                                    )}
                                    <div
                                        className={clsx(
                                            "flex items-start",
                                            mobile ? "w-max gap-1" : "w-full flex-wrap gap-2",
                                        )}
                                    >
                                        <AnimatePresence mode={"popLayout"}>
                                            {hand.map((card) => (
                                                <TableCard
                                                    key={card.id}
                                                    card={card}
                                                    className={clsx(handCard, "hover:z-10")}
                                                    hint={t("button.to-battlefield")}
                                                    onClick={() => move(card, "battlefield")}
                                                    onOpenMenu={(at) => menu.openAt(card, at)}
                                                    onHover={(hovering) => setHovered(hovering ? card.id : null)}
                                                    onDragMove={mobile ? undefined : dragMove}
                                                    onDrop={mobile ? undefined : drop}
                                                />
                                            ))}
                                        </AnimatePresence>
                                    </div>
                                </div>
                                {actions}
                            </div>
                        </div>
                    </div>

                    <ContextMenu
                        title={zoneLabel("library")}
                        at={libraryMenuAt}
                        sections={[
                            {
                                key: "library",
                                items: [
                                    {
                                        key: "draw",
                                        label: t("button.draw"),
                                        icon: <DocumentPlusIcon />,
                                        shortcut: "D",
                                        keepOpen: true,
                                        disabled: library.length === 0,
                                        onSelect: () => apply((current) => draw(current, 1)),
                                    },
                                    {
                                        key: "draw-many",
                                        label: t("button.draw-many"),
                                        icon: <RectangleStackIcon />,
                                        shortcut: "⇧ D",
                                        disabled: library.length === 0,
                                        onSelect: () => {
                                            setDrawing(true);
                                            setLibraryMenuAt(null);
                                        },
                                    },
                                    {
                                        key: "peek",
                                        label: t("button.peek-top"),
                                        icon: <EyeIcon />,
                                        shortcut: "⇧ Z",
                                        disabled: library.length === 0,
                                        onSelect: () => {
                                            setZoomed(library[0] ?? null);
                                            setLibraryMenuAt(null);
                                        },
                                    },
                                    {
                                        key: "mill",
                                        label: t("button.mill-top"),
                                        icon: <FireIcon />,
                                        shortcut: "M",
                                        keepOpen: true,
                                        disabled: library.length === 0,
                                        onSelect: () => {
                                            const top = library[0];
                                            if (top !== undefined) move(top, "graveyard");
                                        },
                                    },
                                    {
                                        key: "exile-top",
                                        label: t("button.exile-top"),
                                        icon: <SparklesIcon />,
                                        keepOpen: true,
                                        disabled: library.length === 0,
                                        onSelect: () => {
                                            const top = library[0];
                                            if (top !== undefined) move(top, "exile");
                                        },
                                    },
                                    {
                                        key: "search",
                                        label: t("button.look-library"),
                                        icon: <MagnifyingGlassIcon />,
                                        shortcut: "L",
                                        onSelect: () => {
                                            setZoneOpen("library");
                                            setLibraryMenuAt(null);
                                        },
                                    },
                                    {
                                        key: "shuffle",
                                        label: t("button.shuffle"),
                                        icon: <ArrowsRightLeftIcon />,
                                        shortcut: "S",
                                        onSelect: () => {
                                            shuffle();
                                            setLibraryMenuAt(null);
                                        },
                                    },
                                ],
                            },
                        ]}
                        onClose={() => setLibraryMenuAt(null)}
                    />
                    <GoldfishCardMenu
                        control={menu}
                        onMove={(card, zone, end) => {
                            if (card.zone === "command" && zone === "battlefield") cast(card);
                            else move(card, zone, end);
                        }}
                        onTap={(card) => apply((current) => toggleTapped(current, card.id))}
                        onFlip={(card) => apply((current) => toggleFlipped(current, card.id))}
                        onCounters={setCountersOn}
                        onCopy={(card) => apply((current) => copyCard(current, card.id))}
                        onZoom={setZoomed}
                    />
                    <CardZoomDialog card={recordOf(zoomed)} onClose={() => setZoomed(null)} />
                    <GoldfishCounterDialog
                        card={
                            countersOn === null ? null : (game.cards.find((card) => card.id === countersOn.id) ?? null)
                        }
                        onChange={(card, kind, amount) =>
                            apply((current) => changeCounter(current, card.id, kind, amount))
                        }
                        onClose={() => setCountersOn(null)}
                    />
                    <GoldfishTokenDialog
                        open={tokensOpen}
                        deckTokens={deckTokens}
                        onCreate={make}
                        onClose={() => setTokensOpen(false)}
                    />
                    <GoldfishDrawDialog
                        open={drawing}
                        available={library.length}
                        onDraw={(count) => apply((current) => draw(current, count))}
                        onClose={() => setDrawing(false)}
                    />
                </div>
            </LayoutGroup>
        </MotionConfig>
    );
}
