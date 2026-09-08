import { Badge } from "components";
import clsx from "clsx";
import { Fragment, ReactNode, useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CardFinish } from "src/api/generated";
import { LineEntry, LineReportResponse, LinePieceEntry, RedundancyBlock } from "src/api/graph-generated";
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
    large = false,
}: {
    piece: LinePieceEntry;
    printing?: Printing;
    large?: boolean;
}) {
    const [t] = useTranslation("advisor");
    const zoneNames = piece.zones
        .map((zone) => t(`accessibility.zone-${zone.toLowerCase()}`, { defaultValue: zone }))
        .join("/");

    return (
        <div className={"relative"} title={zoneNames === "" ? piece.name : `${piece.name} · ${zoneNames}`}>
            <CardThumbnail
                name={piece.name}
                image={printing?.largeImageUrl ?? null}
                thumbnail={printing?.imageUrl ?? null}
                sizes={large ? "44px" : "30px"}
                finish={CardFinish.Nonfoil}
                compact
                // Faded and dashed unconditionally — this is "missing from the
                // deck", not the proxy-fade preference `muted` otherwise reads
                // (`src/utils/proxy-fade.ts`), which a reader can turn off. A
                // near-miss line's absent piece must stay legible as missing
                // whatever that switch is set to.
                className={clsx(
                    "rounded-sm",
                    large ? "w-11" : "w-[30px]",
                    !piece.in_deck &&
                        "opacity-60 outline-2 outline-offset-2 outline-zinc-400 saturate-50 outline-dashed dark:outline-zinc-500",
                )}
            />
            {piece.zones.length > 0 && (
                <Badge
                    color={"zinc"}
                    aria-label={zoneNames}
                    className={"absolute -right-1 -bottom-1 px-1 py-0 text-[8px]/3 shadow-sm sm:text-[8px]/3"}
                >
                    {piece.zones.join("/")}
                </Badge>
            )}
            {!piece.in_deck && (
                <span className={"sr-only"}>{t("accessibility.line-piece-missing", { name: piece.name })}</span>
            )}
        </div>
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
    dimmed,
}: {
    pieces: ReadonlyArray<LinePieceEntry>;
    cards: ReadonlyMap<string, Printing>;
    dimmed?: string;
}) {
    return (
        <div className={"flex flex-wrap items-center gap-1.5"}>
            {pieces.map((piece, index) => (
                <Fragment key={piece.oracle_id + index}>
                    {index > 0 && <span className={"text-xs text-zinc-400 dark:text-zinc-600"}>+</span>}
                    <span className={clsx(piece.name === dimmed && "opacity-40")}>
                        <LinePiece piece={piece} printing={cards.get(piece.name)} />
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
            <div className={"flex w-16 shrink-0 flex-col items-center gap-0.5 text-center"}>{column}</div>
            <div className={"flex min-w-0 flex-1 flex-col gap-0.5"}>{children}</div>
        </div>
    );
}

/** One family: the hub drawn once, every line one row of its remaining pieces */
function FamilyBlock({ family, cards }: { family: LineFamily; cards: ReadonlyMap<string, Printing> }) {
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
                        <LinePiece piece={{ ...hubPiece, zones: [] }} printing={cards.get(family.hub)} large />
                    )}
                    <span className={"text-[10px]/tight text-zinc-600 dark:text-zinc-300"}>{family.hub}</span>
                    <span className={"text-[10px] text-zinc-500 dark:text-zinc-400"}>
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
}: {
    groups: ReadonlyArray<NearMissGroup>;
    cards: ReadonlyMap<string, Printing>;
    tutorsByLine: ReadonlyMap<string, Array<string>>;
}) {
    const [t] = useTranslation("advisor");
    const [expanded, setExpanded] = useState(false);
    const shown = expanded ? groups : groups.slice(0, NEAR_MISS_SHOWN);
    const total = groups.reduce((sum, group) => sum + group.lines.length, 0);

    return (
        <LineBlock
            column={
                <>
                    <span className={"text-[10px]/tight text-zinc-600 dark:text-zinc-300"}>
                        {t("label.near-miss-heading")}
                    </span>
                    <span className={"text-[10px] text-zinc-500 dark:text-zinc-400"}>
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
                        <PieceRow pieces={[...group.missing, ...group.partners]} cards={cards} />
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
function DiagramCluster({ family, cards }: { family: DiagramFamily; cards: ReadonlyMap<string, Printing> }) {
    const [t] = useTranslation("advisor");
    const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
    const nodeSize = 44;

    return (
        <div className={"flex flex-col items-center gap-1"}>
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
                        <g key={node.name} opacity={node.ghost ? 0.55 : 1}>
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
}: {
    families: ReadonlyArray<LineFamily>;
    lines: ReadonlyArray<LineEntry>;
    tutorsByLine: ReadonlyMap<string, Array<string>>;
    cards: ReadonlyMap<string, Printing>;
}) {
    const [t] = useTranslation("advisor");
    const diagrams = useMemo(() => layoutLineDiagram(families, lines, tutorsByLine), [families, lines, tutorsByLine]);

    return (
        <div className={"flex flex-col gap-3"}>
            <div className={"flex flex-wrap justify-center gap-6"}>
                {diagrams.map((family) => (
                    <DiagramCluster key={family.key} family={family} cards={cards} />
                ))}
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
                        <FamilyBlock key={family.key} family={family} cards={cards} />
                    ))}
                    {nearMiss.length > 0 && (
                        <NearMissBlock groups={nearMiss} cards={cards} tutorsByLine={tutorsByLine} />
                    )}
                </div>
            ) : (
                <LinesDiagram families={families} lines={report.lines} tutorsByLine={tutorsByLine} cards={cards} />
            )}

            <RedundancyStrip redundancy={report.redundancy} />
        </div>
    );
}
