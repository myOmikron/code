import {
    ArchiveBoxIcon,
    ArrowPathIcon,
    ArrowRightStartOnRectangleIcon,
    HandRaisedIcon,
    MagnifyingGlassMinusIcon,
    MagnifyingGlassPlusIcon,
    RectangleGroupIcon,
    RectangleStackIcon,
    StarIcon,
} from "@heroicons/react/20/solid";
import { Badge, Button } from "components";
import clsx from "clsx";
import { Fragment, ReactNode, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CardFinish } from "src/api/generated";
import { LineEntry, LineReportResponse, LinePieceEntry, RedundancyBlock } from "src/api/graph-generated";
import { CardDetailDialog } from "src/components/card-detail-dialog";
import { CardThumbnail } from "src/components/card-thumbnail";
import { DeckAdvisorNotes } from "src/components/deck-advisor-notes";
import { ManaCost } from "src/components/mana-cost";
import { SplitToggle } from "src/components/charts/split-toggle";
import { DiagramFamily, layoutLineDiagram } from "src/utils/line-diagram";
import { LineFamily, NearMissGroup, lineFamilies, nearMissGroups } from "src/utils/line-families";
import { Printing } from "src/utils/scryfall";
import { useSuggestionCards } from "src/utils/use-suggestion-cards";

/** The two ways the lines panel can be read — compact rows are the default, the mockup's diagram sits behind them */
type LinesVariant = "compact" | "diagram";

/** How many near-miss groups show before the rest sit behind a button */
const NEAR_MISS_SHOWN = 4;

/**
 * How far the diagram zooms, and how big it opens.
 *
 * The layout module sizes a family's canvas to just fit its ring of 44px
 * cards, which is legible but small in a panel this wide, so the diagram
 * opens filling its window rather than at that natural size — but never
 * below it, and never so magnified that a lone two-card family becomes a
 * wall. Past the opening zoom the canvas is larger than the window, which
 * is the point: the window is panned by dragging.
 */
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 4;
const ZOOM_OPEN_MIN = 1;
const ZOOM_OPEN_MAX = 2.5;
/** One press of a zoom button */
const ZOOM_STEP = 1.25;
/** Zoom per unit of wheel delta, applied exponentially so every notch feels the same */
const ZOOM_PER_WHEEL = 0.0015;
/** How far a pointer travels before a press counts as a drag rather than a click on a card */
const DRAG_THRESHOLD = 4;

/** Where the diagram canvas sits inside its viewport, and how big it is drawn */
type DiagramView = { zoom: number; x: number; y: number };

/**
 * The box the drawn clusters actually occupy inside the canvas, in canvas
 * pixels.
 *
 * Not the canvas's own size: the canvas is held at the window's width so the
 * clusters wrap the way they would unzoomed, which leaves empty margin either
 * side of a diagram narrower than the window. Fitting against the canvas would
 * therefore always answer "it already fits". The clusters' own union is what
 * the opening view has to fill.
 *
 * @param canvas the transformed canvas element
 *
 * @returns the union of the clusters' layout boxes, or `null` when there are
 *   none to measure yet
 */
function contentBounds(canvas: HTMLElement): { x: number; y: number; width: number; height: number } | null {
    const row = canvas.firstElementChild;
    if (row === null || row.children.length === 0) return null;
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    for (const child of row.children) {
        if (!(child instanceof HTMLElement)) continue;
        left = Math.min(left, child.offsetLeft);
        top = Math.min(top, child.offsetTop);
        right = Math.max(right, child.offsetLeft + child.offsetWidth);
        bottom = Math.max(bottom, child.offsetTop + child.offsetHeight);
    }
    if (!Number.isFinite(left)) return null;
    return { x: left, y: top, width: right - left, height: bottom - top };
}

/** Opens a card's detail dialog — every piece in the panel gets the same one the combos panel uses */
type OpenCard = (printing: Printing) => void;

/**
 * The zone a piece has to be in when the line goes off, drawn as an icon.
 *
 * The backend sends single letters (B/H/G/C/E/L) and they were rendered as
 * such; at the size a row draws a card, a 8px "B" is a smudge, and "H/G" is
 * two smudges. Each letter gets a picture instead, in a circle that sits on
 * the artwork, with the zone's own name as its tooltip. A letter with no
 * icon falls back to the letter — a zone the backend adds later shows up
 * unreadable rather than not at all.
 */
const ZONE_ICONS: Record<string, typeof RectangleGroupIcon> = {
    // The battlefield is permanents laid out side by side; the hand is a
    // hand; the graveyard is the pile cards are put away in (an archive box,
    // not a bin — a graveyard is a resource in this format, not a delete);
    // the command zone belongs to the one card that starts there; exile
    // leaves the box entirely; the library is the deck as a stack.
    B: RectangleGroupIcon,
    H: HandRaisedIcon,
    G: ArchiveBoxIcon,
    C: StarIcon,
    E: ArrowRightStartOnRectangleIcon,
    L: RectangleStackIcon,
};

/**
 * The properties for {@link DeckAdvisorLines}
 */
export type DeckAdvisorLinesProps = {
    /** The `/lines` report */
    report: LineReportResponse;
};

/**
 * Strips a Commander Spellbook `manaNeeded` string down to its plain-English
 * tail — "plus enough mana to cast the additional instant or sorcery", "each
 * turn", "at most" — for the hover title. `ManaCost` already ignores
 * anything that is not a `{...}` token when rendering the pips themselves,
 * so this only has to recover what it drops.
 *
 * @param manaNeeded the raw `mana_needed` string
 *
 * @returns the English remainder, or an empty string
 */
function manaExtra(manaNeeded: string): string {
    return manaNeeded.replace(/\{[^}]+\}/g, "").trim();
}

/**
 * One line's card, drawn small with its zone badge in the corner — the name
 * and zone live in the hover title, which is where the layout round moved
 * everything the row does not need at a glance
 */
function LinePiece({
    piece,
    printing,
    onOpen,
    large = false,
}: {
    piece: LinePieceEntry;
    printing?: Printing;
    onOpen: OpenCard;
    large?: boolean;
}) {
    const [t] = useTranslation("advisor");
    const zoneNames = piece.zones
        .map((zone) => t(`accessibility.zone-${zone.toLowerCase()}`, { defaultValue: zone }))
        .join("/");

    return (
        // The same clickable artwork the combos panel draws (`ComboThumbnails`):
        // a button around the thumbnail, opening the card's detail dialog,
        // inert until the catalog has placed the name.
        <button
            type={"button"}
            disabled={printing === undefined}
            onClick={() => printing !== undefined && onOpen(printing)}
            aria-label={t("accessibility.open-card", { name: piece.name })}
            title={zoneNames === "" ? piece.name : `${piece.name} · ${zoneNames}`}
            className={
                "relative block cursor-zoom-in rounded-sm transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-accent) disabled:cursor-default"
            }
        >
            <CardThumbnail
                name={piece.name}
                image={printing?.largeImageUrl ?? null}
                thumbnail={printing?.imageUrl ?? null}
                sizes={large ? "56px" : "30px"}
                finish={CardFinish.Nonfoil}
                compact
                // Faded and dashed unconditionally — this is "missing from the
                // deck", not the proxy-fade preference `muted` otherwise reads
                // (`src/utils/proxy-fade.ts`), which a reader can turn off. A
                // near-miss line's absent piece must stay legible as missing
                // whatever that switch is set to.
                className={clsx(
                    "rounded-sm",
                    large ? "w-14" : "w-[30px]",
                    !piece.in_deck &&
                        "opacity-60 outline-2 outline-offset-2 outline-zinc-400 saturate-50 outline-dashed dark:outline-zinc-500",
                )}
            />
            {piece.zones.length > 0 && (
                <span className={"absolute -right-1 -bottom-1 flex gap-0.5"}>
                    {piece.zones.map((zone) => {
                        const Icon = ZONE_ICONS[zone.toUpperCase()];
                        const name = t(`accessibility.zone-${zone.toLowerCase()}`, { defaultValue: zone });
                        return (
                            <span
                                key={zone}
                                role={"img"}
                                aria-label={name}
                                title={name}
                                className={
                                    "flex size-4 items-center justify-center rounded-full bg-(--surface-card) text-zinc-700 shadow-sm ring-1 ring-zinc-950/10 dark:text-zinc-200 dark:ring-white/15"
                                }
                            >
                                {Icon === undefined ? (
                                    <span className={"text-[9px]/none font-semibold"}>{zone}</span>
                                ) : (
                                    <Icon className={"size-3"} />
                                )}
                            </span>
                        );
                    })}
                </span>
            )}
            {!piece.in_deck && (
                <span className={"sr-only"}>{t("accessibility.line-piece-missing", { name: piece.name })}</span>
            )}
        </button>
    );
}

/** The right-hand side of a row: cost, fold classes, and the muted counts */
function LineMeta({
    line,
    tutors = [],
    lineCount = 1,
}: {
    line: LineEntry;
    tutors?: ReadonlyArray<string>;
    lineCount?: number;
}) {
    const [t, i18n] = useTranslation("advisor");
    const extra = manaExtra(line.mana_needed);

    return (
        <div className={"flex flex-wrap items-center justify-end gap-1.5 sm:ml-auto"}>
            {line.mana_needed !== "" ? (
                <span title={extra === "" ? undefined : extra}>
                    <ManaCost value={line.mana_needed} />
                </span>
            ) : (
                line.mana_value_needed > 0 && (
                    <Badge color={"zinc"}>{t("label.line-mana-value", { value: line.mana_value_needed })}</Badge>
                )
            )}
            {line.folds_to.length === 0 ? (
                <Badge color={"zinc"}>{t("label.fold-none")}</Badge>
            ) : (
                line.folds_to.map((fold) => (
                    <Badge key={fold} color={"zinc"}>
                        {t(`label.fold-${fold.replace(/_/g, "-")}`, { defaultValue: fold })}
                    </Badge>
                ))
            )}
            <span className={"flex items-center gap-1.5 text-xs whitespace-nowrap text-zinc-500 dark:text-zinc-400"}>
                {tutors.length > 0 && (
                    <span title={tutors.join(", ")}>{t("label.tutor-count", { count: tutors.length })}</span>
                )}
                {lineCount > 1 && <span>{t("label.line-group-count", { count: lineCount })}</span>}
                <span title={t("label.combo-popularity", { count: line.popularity })}>
                    {line.popularity.toLocaleString(i18n.language)}
                </span>
            </span>
        </div>
    );
}

/** A row of pieces joined by "+", one of them optionally dimmed because the column beside the row already names it */
function PieceRow({
    pieces,
    cards,
    onOpen,
    dimmed,
}: {
    pieces: ReadonlyArray<LinePieceEntry>;
    cards: ReadonlyMap<string, Printing>;
    onOpen: OpenCard;
    dimmed?: string;
}) {
    return (
        <div className={"flex flex-wrap items-center gap-1.5"}>
            {pieces.map((piece, index) => (
                <Fragment key={piece.oracle_id + index}>
                    {index > 0 && <span className={"text-xs text-zinc-400 dark:text-zinc-600"}>+</span>}
                    <span className={clsx(piece.name === dimmed && "opacity-40")}>
                        <LinePiece piece={piece} printing={cards.get(piece.name)} onOpen={onOpen} />
                    </span>
                </Fragment>
            ))}
        </div>
    );
}

/** The shared frame of a family block and the near-miss block: a narrow left column, rows on the right */
function LineBlock({ column, children }: { column: ReactNode; children: ReactNode }) {
    return (
        <div
            className={
                "flex items-start gap-3 border-t border-zinc-950/5 pt-2 first:border-t-0 first:pt-0 dark:border-white/10"
            }
        >
            {/* Narrower on phones: at 96px the column ate a quarter of the
                row's width and pushed the fold badges onto more lines than
                it saved. */}
            <div className={"flex w-20 shrink-0 flex-col items-center gap-0.5 text-center sm:w-24"}>{column}</div>
            <div className={"flex min-w-0 flex-1 flex-col gap-0.5"}>{children}</div>
        </div>
    );
}

/** One family: the hub drawn once, every line one row of its remaining pieces */
function FamilyBlock({
    family,
    cards,
    onOpen,
}: {
    family: LineFamily;
    cards: ReadonlyMap<string, Printing>;
    onOpen: OpenCard;
}) {
    const [t] = useTranslation("advisor");
    const hubPiece = family.lines.flatMap((line) => line.cards).find((card) => card.name === family.hub);
    // The hub leaves the rows only when every line has it — a family joined
    // through a chain (Breach–Frantic Search–Narset on Kess) holds lines the
    // hub is not part of, and a two-piece row there must not read as "plus
    // the hub". In that case every row lists all its pieces, the hub dimmed
    // so the eye still skips what the column already names.
    const hubInEveryLine = family.lines.every((line) => line.cards.some((card) => card.name === family.hub));

    return (
        <LineBlock
            column={
                <>
                    {hubPiece !== undefined && (
                        <LinePiece
                            piece={{ ...hubPiece, zones: [] }}
                            printing={cards.get(family.hub)}
                            onOpen={onOpen}
                            large
                        />
                    )}
                    <span className={"text-xs leading-tight font-medium text-zinc-950 dark:text-white"}>
                        {family.hub}
                    </span>
                    <span className={"text-xs text-zinc-500 dark:text-zinc-400"}>
                        {t("label.line-family-complete", { count: family.lines.length })}
                    </span>
                </>
            }
        >
            {family.lines.map((line) => (
                <div
                    key={line.id}
                    className={
                        "flex flex-wrap items-center gap-2 rounded-(--radius-control) px-1.5 py-1 hover:bg-zinc-950/5 dark:hover:bg-white/5"
                    }
                >
                    <PieceRow
                        pieces={hubInEveryLine ? line.cards.filter((card) => card.name !== family.hub) : line.cards}
                        cards={cards}
                        onOpen={onOpen}
                        dimmed={hubInEveryLine ? undefined : family.hub}
                    />
                    <LineMeta line={line} />
                </div>
            ))}
        </LineBlock>
    );
}

/** The near-misses, one row per missing card, the first few shown and the rest behind a count */
function NearMissBlock({
    groups,
    cards,
    tutorsByLine,
    onOpen,
}: {
    groups: ReadonlyArray<NearMissGroup>;
    cards: ReadonlyMap<string, Printing>;
    tutorsByLine: ReadonlyMap<string, Array<string>>;
    onOpen: OpenCard;
}) {
    const [t] = useTranslation("advisor");
    const [expanded, setExpanded] = useState(false);
    const shown = expanded ? groups : groups.slice(0, NEAR_MISS_SHOWN);
    const total = groups.reduce((sum, group) => sum + group.lines.length, 0);

    return (
        <LineBlock
            column={
                <>
                    <span className={"text-xs leading-tight font-medium text-zinc-950 dark:text-white"}>
                        {t("label.near-miss-heading")}
                    </span>
                    <span className={"text-xs text-zinc-500 dark:text-zinc-400"}>
                        {t("label.line-group-count", { count: total })}
                    </span>
                </>
            }
        >
            {shown.map((group) => {
                const tutors = [...new Set(group.lines.flatMap((line) => tutorsByLine.get(line.id) ?? []))];
                return (
                    <div
                        key={group.key}
                        className={
                            "flex flex-wrap items-center gap-2 rounded-(--radius-control) px-1.5 py-1 opacity-70 hover:bg-zinc-950/5 hover:opacity-100 dark:hover:bg-white/5"
                        }
                    >
                        <PieceRow pieces={[...group.missing, ...group.partners]} cards={cards} onOpen={onOpen} />
                        <LineMeta line={group.lines[0]} tutors={tutors} lineCount={group.lines.length} />
                    </div>
                );
            })}
            {!expanded && groups.length > NEAR_MISS_SHOWN && (
                <button
                    type={"button"}
                    onClick={() => setExpanded(true)}
                    className={"self-start px-1.5 py-1 text-xs text-(--color-accent) hover:underline"}
                >
                    {t("label.near-miss-more", { count: groups.length - NEAR_MISS_SHOWN })}
                </button>
            )}
        </LineBlock>
    );
}

/** "No single point of failure" or the one card that is — the redundancy read at a glance */
function RedundancyStrip({ redundancy }: { redundancy: RedundancyBlock }) {
    const [t] = useTranslation("advisor");
    if (redundancy.shared_pieces.length === 0 && redundancy.single_points.length === 0) return null;

    const shared = [...redundancy.shared_pieces].sort((a, b) => b.line_ids.length - a.line_ids.length);

    return (
        <div className={"flex flex-col gap-1 border-t border-zinc-950/5 pt-3 dark:border-white/10"}>
            {shared.length > 0 && (
                <p className={"text-xs text-zinc-500 dark:text-zinc-400"}>
                    {t("label.shared-pieces-prefix")}{" "}
                    {shared.map((piece, index) => (
                        <span key={piece.oracle_id}>
                            {index > 0 && " · "}
                            {t("label.shared-piece-count", { name: piece.name, count: piece.line_ids.length })}
                        </span>
                    ))}
                </p>
            )}
            <p
                className={clsx(
                    "text-xs font-medium",
                    redundancy.single_points.length === 0 ? "text-(--color-success)" : "text-(--color-warning)",
                )}
            >
                {redundancy.single_points.length === 0
                    ? t("label.no-single-point")
                    : t("label.single-point-holds", { names: redundancy.single_points.map((p) => p.name).join(", ") })}
            </p>
        </div>
    );
}

/** One family's circular node-link graph */
function DiagramCluster({
    family,
    cards,
    onOpen,
}: {
    family: DiagramFamily;
    cards: ReadonlyMap<string, Printing>;
    onOpen: OpenCard;
}) {
    const [t] = useTranslation("advisor");
    const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
    const nodeSize = 44;

    return (
        <div className={"flex flex-col items-center gap-1"}>
            {/* Drawn at its natural size — the viewport around every cluster
                owns the zoom, as one transform over all of them. */}
            <svg
                viewBox={`0 0 ${family.width} ${family.height}`}
                width={family.width}
                height={family.height}
                role={"img"}
                aria-label={t("accessibility.lines-diagram-family", { hub: family.hub, count: family.completeCount })}
            >
                <g stroke={"currentColor"} className={"text-zinc-300 dark:text-zinc-600"}>
                    {family.edges.map((edge, index) => {
                        const from = family.nodes.find((node) => node.name === edge.from);
                        const to = family.nodes.find((node) => node.name === edge.to);
                        if (from === undefined || to === undefined) return null;
                        return (
                            <line
                                key={index}
                                x1={from.x}
                                y1={from.y}
                                x2={to.x}
                                y2={to.y}
                                strokeWidth={1.5}
                                strokeDasharray={edge.dashed ? "5 4" : undefined}
                                opacity={edge.dashed ? 0.6 : 0.8}
                            />
                        );
                    })}
                </g>
                {family.nodes.map((node) => {
                    const printing = cards.get(node.name);
                    const image = printing?.imageUrl ?? printing?.largeImageUrl ?? null;
                    const clipId = `${uid}-${node.name.replace(/[^a-zA-Z0-9]/g, "")}`;
                    const x = node.x - nodeSize / 2;
                    const y = node.y - nodeSize / 2;
                    return (
                        <g
                            key={node.name}
                            opacity={node.ghost ? 0.55 : 1}
                            role={printing === undefined ? undefined : "button"}
                            tabIndex={printing === undefined ? undefined : 0}
                            aria-label={t("accessibility.open-card", { name: node.name })}
                            className={clsx(printing !== undefined && "cursor-pointer focus-visible:outline-none")}
                            onClick={() => printing !== undefined && onOpen(printing)}
                            onKeyDown={(event) => {
                                if (printing !== undefined && (event.key === "Enter" || event.key === " ")) {
                                    event.preventDefault();
                                    onOpen(printing);
                                }
                            }}
                        >
                            <clipPath id={clipId}>
                                <rect x={x} y={y} width={nodeSize} height={nodeSize * 1.4} rx={5} />
                            </clipPath>
                            {image !== null ? (
                                <image
                                    href={image}
                                    x={x}
                                    y={y}
                                    width={nodeSize}
                                    height={nodeSize * 1.4}
                                    preserveAspectRatio={"xMidYMid slice"}
                                    clipPath={`url(#${clipId})`}
                                />
                            ) : (
                                <rect
                                    x={x}
                                    y={y}
                                    width={nodeSize}
                                    height={nodeSize * 1.4}
                                    rx={5}
                                    className={"fill-zinc-200 dark:fill-zinc-700"}
                                />
                            )}
                            <rect
                                x={x}
                                y={y}
                                width={nodeSize}
                                height={nodeSize * 1.4}
                                rx={5}
                                fill={"none"}
                                strokeWidth={node.ghost ? 1.5 : 1}
                                strokeDasharray={node.ghost ? "4 3" : undefined}
                                className={"stroke-zinc-950/15 dark:stroke-white/20"}
                            />
                            <title>
                                {node.ghost && node.tutors.length > 0
                                    ? `${node.name} — ${t("label.tutor-count", { count: node.tutors.length })}: ${node.tutors.join(", ")}`
                                    : node.name}
                            </title>
                            <text
                                x={node.x}
                                y={y + nodeSize * 1.4 + 12}
                                textAnchor={"middle"}
                                fontSize={9}
                                className={"fill-current text-zinc-600 dark:text-zinc-300"}
                            >
                                {node.name.length > 16 ? `${node.name.slice(0, 15)}…` : node.name}
                            </text>
                        </g>
                    );
                })}
            </svg>
            <span className={"text-xs font-medium text-zinc-950 dark:text-white"}>{family.hub}</span>
        </div>
    );
}

/** The diagram variant: one node-link cluster per family */
function LinesDiagram({
    families,
    lines,
    tutorsByLine,
    cards,
    onOpen,
}: {
    families: ReadonlyArray<LineFamily>;
    lines: ReadonlyArray<LineEntry>;
    tutorsByLine: ReadonlyMap<string, Array<string>>;
    cards: ReadonlyMap<string, Printing>;
    onOpen: OpenCard;
}) {
    const [t] = useTranslation("advisor");
    const diagrams = useMemo(() => layoutLineDiagram(families, lines, tutorsByLine), [families, lines, tutorsByLine]);
    const [view, setView] = useState<DiagramView>({ zoom: ZOOM_OPEN_MIN, x: 0, y: 0 });
    const viewport = useRef<HTMLDivElement>(null);
    const content = useRef<HTMLDivElement>(null);
    // The canvas is held at the viewport's own width so the clusters wrap
    // exactly as they would unzoomed, and the transform then scales that
    // whole arrangement. Sizing it to its content instead would let the row
    // grow to whatever the widest zoom needs and re-wrap on every step.
    const [canvasWidth, setCanvasWidth] = useState(0);
    /** The drag in progress, `null` between presses */
    const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
    /** Whether the press that is ending moved far enough to have been a drag */
    const dragged = useRef(false);
    // Where the pointer last was inside the viewport, and whether it got
    // there by moving. Scrolling the page dispatches the wheel event *after*
    // the scroll, so a diagram that slides under a resting pointer receives
    // the rest of that gesture and starts zooming — a reader scrolling past
    // the panel gets caught by it. Chrome reports the slide as pointer
    // events at unchanged coordinates, which is what tells the two apart:
    // only real movement counts as hovering, and only hovering takes the
    // wheel.
    const at = useRef<{ x: number; y: number } | null>(null);
    const hovering = useRef(false);

    /** Fills the window with the whole diagram, centred */
    const resetView = useCallback(() => {
        const box = viewport.current;
        const inner = content.current;
        if (box === null || inner === null) return;
        // Layout sizes, so they report the canvas at 1× whatever transform is
        // on it at the moment.
        const bounds = contentBounds(inner);
        if (bounds === null) return;
        const zoom = Math.min(
            ZOOM_OPEN_MAX,
            Math.max(ZOOM_OPEN_MIN, Math.min(box.clientWidth / bounds.width, box.clientHeight / bounds.height)),
        );
        setView({
            zoom,
            x: (box.clientWidth - bounds.width * zoom) / 2 - bounds.x * zoom,
            y: (box.clientHeight - bounds.height * zoom) / 2 - bounds.y * zoom,
        });
    }, []);

    useEffect(() => {
        const node = viewport.current;
        if (node === null) return;
        const observer = new ResizeObserver(([entry]) => setCanvasWidth(entry.contentRect.width));
        observer.observe(node);
        return () => observer.disconnect();
    }, []);

    // Centre once, as soon as there is a width to centre against. Not on
    // every resize: a reader who has panned somewhere should keep looking at
    // what they panned to when the window changes.
    const centred = useRef(false);
    useEffect(() => {
        if (canvasWidth > 0 && !centred.current) {
            centred.current = true;
            resetView();
        }
    }, [canvasWidth, resetView]);

    /**
     * Zooms by `factor` about one point of the viewport, so whatever sits
     * under the pointer stays under it
     *
     * @param factor what to multiply the zoom by
     * @param px the anchor's x, in viewport pixels
     * @param py the anchor's y, in viewport pixels
     */
    const zoomAround = useCallback((factor: number, px: number, py: number) => {
        setView((held) => {
            const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, held.zoom * factor));
            const scale = zoom / held.zoom;
            return { zoom, x: px - (px - held.x) * scale, y: py - (py - held.y) * scale };
        });
    }, []);

    // The wheel zooms the diagram whenever the pointer is over it, rather
    // than scrolling the page past it. A native non-passive listener: React
    // registers `onWheel` passively, and a passive listener may not call
    // `preventDefault`, so the page would scroll as well.
    useEffect(() => {
        const node = viewport.current;
        if (node === null) return;
        /**
         * Zooms about the pointer
         *
         * @param event the wheel event
         */
        function onWheel(event: WheelEvent) {
            if (node === null || !hovering.current) return;
            event.preventDefault();
            const rect = node.getBoundingClientRect();
            zoomAround(Math.exp(-event.deltaY * ZOOM_PER_WHEEL), event.clientX - rect.left, event.clientY - rect.top);
        }
        node.addEventListener("wheel", onWheel, { passive: false });
        return () => node.removeEventListener("wheel", onWheel);
    }, [zoomAround]);

    /**
     * Zooms a button's worth, about the middle of the viewport
     *
     * @param factor what to multiply the zoom by
     */
    function zoomFromButton(factor: number) {
        const node = viewport.current;
        zoomAround(factor, (node?.clientWidth ?? 0) / 2, (node?.clientHeight ?? 0) / 2);
    }

    return (
        <div className={"flex flex-col gap-3"}>
            <div className={"flex items-center justify-end gap-1 text-xs text-zinc-500 dark:text-zinc-400"}>
                <Button plain onClick={resetView} aria-label={t("accessibility.diagram-reset")}>
                    <ArrowPathIcon />
                </Button>
                <Button
                    plain
                    disabled={view.zoom <= ZOOM_MIN}
                    onClick={() => zoomFromButton(1 / ZOOM_STEP)}
                    aria-label={t("accessibility.diagram-zoom-out")}
                >
                    <MagnifyingGlassMinusIcon />
                </Button>
                <span className={"w-10 text-center tabular-nums"}>{Math.round(view.zoom * 100)}%</span>
                <Button
                    plain
                    disabled={view.zoom >= ZOOM_MAX}
                    onClick={() => zoomFromButton(ZOOM_STEP)}
                    aria-label={t("accessibility.diagram-zoom-in")}
                >
                    <MagnifyingGlassPlusIcon />
                </Button>
            </div>
            {/* A window onto the canvas rather than the canvas itself: it is
                dragged with a mouse or a finger (`touch-none` is what lets a
                finger drag it instead of scrolling the page), and the wheel
                over it zooms. */}
            <div
                ref={viewport}
                className={
                    "relative h-80 cursor-grab touch-none overflow-hidden rounded-(--radius-card) bg-zinc-950/[0.02] select-none active:cursor-grabbing sm:h-[28rem] dark:bg-white/[0.03]"
                }
                onPointerEnter={(event) => (at.current = { x: event.clientX, y: event.clientY })}
                onPointerLeave={() => {
                    at.current = null;
                    hovering.current = false;
                }}
                onPointerDown={(event) => {
                    hovering.current = true;
                    if (event.pointerType === "mouse" && event.button !== 0) return;
                    event.currentTarget.setPointerCapture(event.pointerId);
                    drag.current = { x: event.clientX, y: event.clientY, moved: false };
                }}
                onPointerMove={(event) => {
                    const was = at.current;
                    if (was === null || was.x !== event.clientX || was.y !== event.clientY) hovering.current = true;
                    at.current = { x: event.clientX, y: event.clientY };
                    const held = drag.current;
                    if (held === null) return;
                    const dx = event.clientX - held.x;
                    const dy = event.clientY - held.y;
                    if (!held.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
                    held.moved = true;
                    dragged.current = true;
                    held.x = event.clientX;
                    held.y = event.clientY;
                    setView((current) => ({ ...current, x: current.x + dx, y: current.y + dy }));
                }}
                onPointerUp={() => (drag.current = null)}
                onPointerCancel={() => (drag.current = null)}
                // A drag that happens to end on a card must not also open it.
                // Caught here on the way down rather than asked about in every
                // node, so the nodes know nothing about panning.
                onClickCapture={(event) => {
                    if (!dragged.current) return;
                    dragged.current = false;
                    event.stopPropagation();
                    event.preventDefault();
                }}
            >
                <div
                    ref={content}
                    className={"absolute top-0 left-0 origin-top-left"}
                    style={{
                        width: canvasWidth === 0 ? undefined : canvasWidth,
                        transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
                    }}
                >
                    <div className={"flex flex-wrap justify-center gap-6"}>
                        {diagrams.map((family) => (
                            <DiagramCluster key={family.key} family={family} cards={cards} onOpen={onOpen} />
                        ))}
                    </div>
                </div>
            </div>
            {/* The legend carries what the mockup's refinement round moved out
                of in-diagram captions: solid means co-occurrence, dashed means
                missing. */}
            <div
                className={"flex flex-wrap items-center justify-center gap-4 text-xs text-zinc-500 dark:text-zinc-400"}
            >
                <span className={"flex items-center gap-1.5"}>
                    <svg width={20} height={8} aria-hidden={"true"}>
                        <line x1={0} y1={4} x2={20} y2={4} stroke={"currentColor"} strokeWidth={1.5} />
                    </svg>
                    {t("label.diagram-legend-solid")}
                </span>
                <span className={"flex items-center gap-1.5"}>
                    <svg width={20} height={8} aria-hidden={"true"}>
                        <line
                            x1={0}
                            y1={4}
                            x2={20}
                            y2={4}
                            stroke={"currentColor"}
                            strokeWidth={1.5}
                            strokeDasharray={"4 3"}
                        />
                    </svg>
                    {t("label.diagram-legend-dashed")}
                </span>
            </div>
        </div>
    );
}

/**
 * The lines-first cEDH cockpit's lead panel: complete combo lines grouped
 * into families that share pieces, near-misses dimmed below them, and the
 * deck's redundancy read at a glance.
 *
 * Compact rows are the default reading (`SplitToggle` — the app's own
 * segmented idiom, `charts/split-toggle.tsx`), the diagram sits behind them.
 * The first cut drew every line as a full card strip and repeated a family's
 * shared pieces on every line; on Kess that was 2,400 px for the panel. The
 * hub is now drawn once per family and each line is one row of what is left,
 * near-misses collapse onto the card they miss — the same fixture at 930 px.
 * Both read the same `report`; the diagram adds nothing the rows do not
 * already say, it just draws the shared-piece structure instead of listing
 * it.
 *
 * Family grouping is a frontend derivation (`src/utils/line-families.ts`,
 * connected components over `redundancy.shared_pieces`), generalising the
 * mockup's hand-grouped families — see that module's own doc comment.
 *
 * @returns the panel body (title and toggle included — this is the whole
 *   "Lines" panel, meant to sit directly under a bare heading with no
 *   further chrome around it)
 */
export function DeckAdvisorLines({ report }: DeckAdvisorLinesProps) {
    const [t] = useTranslation("advisor");
    const [variant, setVariant] = useState<LinesVariant>("compact");
    const [opened, setOpened] = useState<Printing | null>(null);

    const allNames = useMemo(
        () => [...new Set(report.lines.flatMap((line) => line.cards.map((card) => card.name)))].sort(),
        [report.lines],
    );
    const { cards } = useSuggestionCards(allNames);

    const complete = useMemo(() => report.lines.filter((line) => line.complete), [report.lines]);
    const nearMiss = useMemo(() => nearMissGroups(report.lines), [report.lines]);
    const families = useMemo(
        () => lineFamilies(report.lines, report.redundancy.shared_pieces),
        [report.lines, report.redundancy.shared_pieces],
    );
    const tutorsByLine = useMemo(() => {
        const map = new Map<string, Array<string>>();
        for (const line of report.lines) map.set(line.id, []);
        for (const entry of report.tutor_map) {
            for (const lineId of entry.reaches) map.get(lineId)?.push(entry.tutor);
        }
        return map;
    }, [report.lines, report.tutor_map]);

    if (report.lines.length === 0) {
        return <DeckAdvisorNotes notes={report.notes} />;
    }

    return (
        <div className={"flex flex-col gap-4"}>
            <DeckAdvisorNotes notes={report.notes} />
            <div className={"flex flex-wrap items-center justify-between gap-3"}>
                <span className={"text-xs text-zinc-500 dark:text-zinc-400"}>
                    {t("label.lines-count", { total: report.lines.length, complete: complete.length })}
                </span>
                <SplitToggle<LinesVariant>
                    options={["compact", "diagram"]}
                    value={variant}
                    onChange={setVariant}
                    nameOf={(option) =>
                        t(option === "compact" ? "label.lines-view-compact" : "label.lines-view-diagram")
                    }
                />
            </div>

            {variant === "compact" ? (
                <div className={"flex flex-col gap-2"}>
                    {families.map((family) => (
                        <FamilyBlock key={family.key} family={family} cards={cards} onOpen={setOpened} />
                    ))}
                    {nearMiss.length > 0 && (
                        <NearMissBlock groups={nearMiss} cards={cards} tutorsByLine={tutorsByLine} onOpen={setOpened} />
                    )}
                </div>
            ) : (
                <LinesDiagram
                    families={families}
                    lines={report.lines}
                    tutorsByLine={tutorsByLine}
                    cards={cards}
                    onOpen={setOpened}
                />
            )}

            <RedundancyStrip redundancy={report.redundancy} />
            <CardDetailDialog printing={opened} onClose={() => setOpened(null)} />
        </div>
    );
}
