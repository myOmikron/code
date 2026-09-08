import { ArrowUturnLeftIcon } from "@heroicons/react/16/solid";
import { useTranslation } from "react-i18next";
import { TypeReport } from "src/api/graph-generated";
import { DeckAdvisorCountCards } from "src/components/deck-advisor-count-cards";
import { TargetCorridor } from "src/components/target-corridor";
import { CardArt } from "src/utils/deck-art";
import { Corridor, MAX_CORRIDOR } from "src/utils/deck-targets";
import { parseTypeSource, typeSourceLabel } from "src/utils/type-source";

/**
 * The properties for {@link DeckAdvisorTypes}
 */
export type DeckAdvisorTypesProps = {
    /** The primary-type counts as the advisor reports them */
    types: Array<TypeReport>;
    /**
     * The corridors the builder set, by primary type.
     *
     * Preferred over the report's own numbers while both exist, for the same
     * reason the role meters do it: the report is fetched on a debounce, and
     * a handle drawn from it would sit still for half a second after every
     * drag and read as a broken control.
     */
    custom: Record<string, Corridor>;
    /** Moves one type's corridor */
    onSet: (type: string, corridor: Corridor) => void;
    /** Puts one type back on the archetype's measured corridor */
    onReset: (type: string) => void;
    /** The deck's own artwork, for the cards behind each count */
    art: Map<string, CardArt>;
    /**
     * Which corpus the corridors above were resolved from — the graph
     * service's `Diagnostics.type_source`. Absent on an older report; a deck
     * held to a page that never resolved (an uncached, unknown commander).
     */
    source?: string;
};

/**
 * Formats a weighted count without a pointless `.0`
 *
 * @param value the count, possibly fractional
 *
 * @returns the count with at most one decimal
 */
function count(value: number): string {
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/**
 * What the deck is made of, against targets measured from decks like it.
 *
 * The material axis beside the functional one: a creature can be ramp, so a
 * deck can sit inside every role quota while holding forty creatures. The
 * rows read like the role meters and behave like them — the same green for a
 * count inside its corridor, the same faded green for one that runs past it
 * while nothing here is short, the same phrase only where there is something
 * to do, and the same two handles.
 *
 * What the handles move is measured rather than bracketed: each corridor is
 * one commander page's own distribution. That makes it an argument worth
 * showing, not a rule — a deck that runs thirty-four lands on purpose says so
 * here, and every suggestion, cut and fill is then graded against that. The
 * archetype's own numbers stay behind the edit as a dashed outline, so what
 * was measured is never lost behind what was chosen. Dragging the Land row
 * moves the mana-source quota with it, service-side: the two panels are one
 * decision about the same cards.
 *
 * @returns the meter list
 */
export function DeckAdvisorTypes({ types, custom, onSet, onReset, art, source }: DeckAdvisorTypesProps) {
    const [t] = useTranslation("advisor");
    // Same reading as the role meters: running long on a type costs nothing
    // while no other type is starved, so it is drawn as a choice rather than
    // a fault.
    const anyShort = types.some((report) => report.status === "low");
    // Parsed once for the whole panel: every row is graded against the same
    // corpus, so this is one line under the list, not one per row. `null`
    // for an absent field renders nothing — see `parseTypeSource`.
    const sourceInfo = parseTypeSource(source);
    const sourceLabel = sourceInfo === null ? null : typeSourceLabel(sourceInfo);

    return (
        <div className={"flex flex-col gap-4"}>
            {types.map((report) => {
                const preset = { low: report.default_low ?? report.low, high: report.default_high ?? report.high };
                const edited = custom[report.type];
                const corridor = edited ?? { low: report.low, high: report.high };
                // The role meters' scale, on the same terms — the same
                // numbers should land at the same spot on either tab,
                // including the ceiling the service will take.
                const scale = Math.min(
                    MAX_CORRIDOR,
                    Math.ceil(Math.max(preset.high * 1.6, corridor.high * 1.1, report.count * 1.15, 6)),
                );
                const label = t(`label.type-${report.type.toLowerCase()}`, { defaultValue: report.type });
                // The optional-face slice of the count — MDFC land faces and
                // transform halves. Served by the graph since the back-face
                // rule landed; typed here until the next gen-api run carries
                // the field into the generated client.
                const flexible = (report as TypeReport & { flexible?: number }).flexible ?? 0;
                const firm = report.count - flexible;
                const verdict =
                    report.status === "ok"
                        ? t("label.quota-inside")
                        : report.status === "low"
                          ? t("label.quota-short", { amount: count(report.deviation) })
                          : t("label.quota-over", { amount: count(report.deviation) });
                const tone =
                    report.status === "ok" ? "inside" : report.status === "high" && !anyShort ? "over" : "missing";
                const say = tone === "missing";

                return (
                    <div key={report.type} className={"group flex flex-col gap-2"}>
                        <div className={"flex items-baseline justify-between gap-x-3"}>
                            <span className={"truncate text-sm/6 font-medium text-zinc-950 dark:text-white"}>
                                {label}
                            </span>
                            <span className={"flex shrink-0 items-baseline gap-1.5 text-xs/5 tabular-nums"}>
                                <span className={"text-sm/6 font-medium text-zinc-950 dark:text-white"}>
                                    {/* A row carried partly by optional faces reads as its
                                        honest range: the firm floor, then the count the
                                        MDFCs and flips stretch it to. */}
                                    {flexible > 0 && <span>{count(firm)}–</span>}
                                    <DeckAdvisorCountCards
                                        count={count(report.count)}
                                        cards={report.cards ?? []}
                                        label={t("accessibility.counted-cards", { name: label })}
                                        art={art}
                                    />
                                </span>
                                <span className={"text-zinc-400 dark:text-zinc-500"}>
                                    {t("label.quota-target", {
                                        low: count(corridor.low),
                                        high: count(corridor.high),
                                    })}
                                    {flexible > 0 && <> · {t("label.with-mdfcs")}</>}
                                </span>
                            </span>
                        </div>
                        <TargetCorridor
                            low={corridor.low}
                            high={corridor.high}
                            scale={scale}
                            coverage={report.count}
                            preset={edited === undefined ? undefined : preset}
                            tone={tone}
                            lowLabel={t("accessibility.quota-low", { name: label })}
                            highLabel={t("accessibility.quota-high", { name: label })}
                            valueText={(value) => t("label.quota-cards", { count: Math.round(value) })}
                            onChange={(moved) => onSet(report.type, moved)}
                        />
                        {!say && <span className={"sr-only"}>{verdict}</span>}
                        {/* The same line as the role meters, on the same
                            terms: the verdict where the row asks for cards,
                            the way back where the corridor was moved, and
                            nothing at all where it would carry neither. */}
                        {(say || edited !== undefined) && (
                            <div className={"-mt-0.5 flex h-5 items-center justify-between gap-3"}>
                                <span className={"truncate text-xs/5 text-zinc-500 dark:text-zinc-400"}>
                                    {say ? verdict : ""}
                                </span>
                                {edited !== undefined && (
                                    <button
                                        type={"button"}
                                        onClick={() => onReset(report.type)}
                                        aria-label={t("accessibility.quota-reset", { name: label })}
                                        className={
                                            "flex shrink-0 items-center gap-1 rounded-(--radius-pill) px-1.5 py-0.5 text-xs/5 text-zinc-400 opacity-0 transition group-hover:opacity-100 hover:bg-zinc-950/5 hover:text-zinc-950 focus-visible:opacity-100 dark:text-zinc-500 dark:hover:bg-white/10 dark:hover:text-white"
                                        }
                                    >
                                        <ArrowUturnLeftIcon className={"size-3"} />
                                        {t("button.reset-one")}
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                );
            })}
            {/* One quiet line under the whole panel, not per row — every
                corridor above came from the same corpus. `title` keeps the
                raw `type_source` string reachable as the audit trail behind
                the friendly wording. */}
            {sourceLabel !== null && (
                <p className={"text-xs/5 text-zinc-400 dark:text-zinc-500"} title={source}>
                    {t(sourceLabel.key, sourceLabel.params)}
                </p>
            )}
        </div>
    );
}
