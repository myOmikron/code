import { Badge } from "components";
import clsx from "clsx";
import { Fragment, useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CardFinish } from "src/api/generated";
import { LineEntry, LineReportResponse, LinePieceEntry, RedundancyBlock } from "src/api/graph-generated";
import { CardThumbnail } from "src/components/card-thumbnail";
import { DeckAdvisorNotes } from "src/components/deck-advisor-notes";
import { ManaCost } from "src/components/mana-cost";
import { SplitToggle } from "src/components/charts/split-toggle";
import { DiagramFamily, layoutLineDiagram } from "src/utils/line-diagram";
import { LineFamily, lineFamilies } from "src/utils/line-families";
import { Printing } from "src/utils/scryfall";
import { useSuggestionCards } from "src/utils/use-suggestion-cards";

/** The two ways the lines panel can be read — strips is the default, the mockup's other variant sits behind it */
type LinesVariant = "strips" | "diagram";

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

/** One line's card, with its zone badge and the deck's own artwork when it has any */
function LinePiece({ piece, printing }: { piece: LinePieceEntry; printing?: Printing }) {
    const [t] = useTranslation("advisor");
    const zoneNames = piece.zones
        .map((zone) => t(`accessibility.zone-${zone.toLowerCase()}`, { defaultValue: zone }))
        .join("/");

    return (
        <div className={"flex flex-col items-center gap-1"}>
            <CardThumbnail
                name={piece.name}
                image={printing?.largeImageUrl ?? null}
                thumbnail={printing?.imageUrl ?? null}
                sizes={"64px"}
                finish={CardFinish.Nonfoil}
                compact
                // Faded and dashed unconditionally — this is "missing from the
                // deck", not the proxy-fade preference `muted` otherwise reads
                // (`src/utils/proxy-fade.ts`), which a reader can turn off. A
                // near-miss line's absent piece must stay legible as missing
                // whatever that switch is set to.
                className={clsx(
                    "w-12 rounded-(--radius-card)",
                    !piece.in_deck &&
                        "opacity-60 outline-2 outline-offset-2 outline-zinc-400 saturate-50 outline-dashed dark:outline-zinc-500",
                )}
            />
            {piece.zones.length > 0 && (
                <Badge color={"zinc"} title={zoneNames} aria-label={zoneNames}>
                    {piece.zones.join("/")}
                </Badge>
            )}
            {!piece.in_deck && (
                <span className={"sr-only"}>{t("accessibility.line-piece-missing", { name: piece.name })}</span>
            )}
        </div>
    );
}

/** One line, drawn as a card strip — the mockup's default reading */
function LineStrip({
    line,
    cards,
    tutors,
    dim = false,
}: {
    line: LineEntry;
    cards: ReadonlyMap<string, Printing>;
    tutors: ReadonlyArray<string>;
    dim?: boolean;
}) {
    const [t] = useTranslation("advisor");
    const extra = manaExtra(line.mana_needed);
    const hasCost = line.mana_needed !== "" || line.mana_value_needed > 0;

    return (
        <div
            className={clsx(
                "flex flex-wrap items-center justify-between gap-3 rounded-(--radius-card) bg-(--surface-card) p-3 ring-1 ring-zinc-950/5 dark:ring-white/10",
                dim && "opacity-70",
            )}
        >
            <div className={"flex flex-wrap items-center gap-2"}>
                {line.cards.map((piece, index) => (
                    <Fragment key={piece.oracle_id + index}>
                        {index > 0 && <span className={"text-zinc-400 dark:text-zinc-600"}>+</span>}
                        <LinePiece piece={piece} printing={cards.get(piece.name)} />
                    </Fragment>
                ))}
            </div>
            <div className={"flex flex-col items-end gap-1.5"}>
                <div className={"flex flex-wrap items-center justify-end gap-2"}>
                    {hasCost && (
                        <span className={"flex items-center gap-1.5"} title={extra === "" ? undefined : extra}>
                            {line.mana_needed !== "" && <ManaCost value={line.mana_needed} />}
                            {line.mana_value_needed > 0 && (
                                <Badge color={"zinc"}>
                                    {t("label.line-mana-value", { value: line.mana_value_needed })}
                                </Badge>
                            )}
                        </span>
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
                </div>
                <div
                    className={"flex flex-wrap items-center justify-end gap-2 text-xs text-zinc-500 dark:text-zinc-400"}
                >
                    {tutors.length > 0 && (
                        <span title={tutors.join(", ")}>{t("label.tutor-count", { count: tutors.length })}</span>
                    )}
                    <span>{t("label.combo-popularity", { count: line.popularity })}</span>
                </div>
            </div>
        </div>
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
 * Strips are the default reading (`SplitToggle` — the app's own segmented
 * idiom, `charts/split-toggle.tsx`), the diagram sits behind it. Both read
 * the same `report`; the diagram adds nothing the strips do not already say,
 * it just draws the shared-piece structure instead of listing it.
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
    const [variant, setVariant] = useState<LinesVariant>("strips");

    const allNames = useMemo(
        () => [...new Set(report.lines.flatMap((line) => line.cards.map((card) => card.name)))].sort(),
        [report.lines],
    );
    const { cards } = useSuggestionCards(allNames);

    const complete = useMemo(() => report.lines.filter((line) => line.complete), [report.lines]);
    const nearMiss = useMemo(
        () => [...report.lines.filter((line) => !line.complete)].sort((a, b) => b.popularity - a.popularity),
        [report.lines],
    );
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
                    options={["strips", "diagram"]}
                    value={variant}
                    onChange={setVariant}
                    nameOf={(option) => t(option === "strips" ? "label.lines-view-strips" : "label.lines-view-diagram")}
                />
            </div>

            {variant === "strips" ? (
                <div className={"flex flex-col gap-5"}>
                    {families.map((family) => (
                        <section key={family.key} className={"flex flex-col gap-2"}>
                            <h4 className={"flex items-baseline gap-2"}>
                                <span className={"text-sm font-medium text-zinc-950 dark:text-white"}>
                                    {family.hub}
                                </span>
                                <span className={"text-xs text-zinc-500 dark:text-zinc-400"}>
                                    {t("label.line-family-complete", { count: family.lines.length })}
                                </span>
                            </h4>
                            <div className={"flex flex-col gap-2"}>
                                {family.lines.map((line) => (
                                    <LineStrip
                                        key={line.id}
                                        line={line}
                                        cards={cards}
                                        tutors={tutorsByLine.get(line.id) ?? []}
                                    />
                                ))}
                            </div>
                        </section>
                    ))}
                    {nearMiss.length > 0 && (
                        <div className={"flex flex-col gap-2"}>
                            {nearMiss.map((line) => (
                                <LineStrip
                                    key={line.id}
                                    line={line}
                                    cards={cards}
                                    tutors={tutorsByLine.get(line.id) ?? []}
                                    dim
                                />
                            ))}
                        </div>
                    )}
                </div>
            ) : (
                <LinesDiagram families={families} lines={report.lines} tutorsByLine={tutorsByLine} cards={cards} />
            )}

            <RedundancyStrip redundancy={report.redundancy} />
        </div>
    );
}
