import { ChartBarIcon, PuzzlePieceIcon, SparklesIcon, Square3Stack3DIcon } from "@heroicons/react/20/solid";
import clsx from "clsx";
import React, { useRef } from "react";
import { useTranslation } from "react-i18next";

/** The four panels of the refine cockpit, in the order the tiles show them */
export const COCKPIT_PANELS = ["curve", "quotas", "types", "themes"] as const;

/** One of the cockpit's panels */
export type CockpitPanel = (typeof COCKPIT_PANELS)[number];

/** The icon each panel is known by, on its tile */
const ICONS: Record<CockpitPanel, React.ComponentType<React.SVGProps<SVGSVGElement>>> = {
    curve: ChartBarIcon,
    quotas: SparklesIcon,
    types: Square3Stack3DIcon,
    themes: PuzzlePieceIcon,
};

/**
 * The properties for {@link DeckAdvisorCockpitTiles}
 */
export type DeckAdvisorCockpitTilesProps = {
    /** The panel currently open beneath the tiles */
    selected: CockpitPanel;
    /** Which panels have something to fix, so their tile says so */
    issues: ReadonlySet<CockpitPanel>;
    /** Which panels exist for this deck — a service that reported no types has no types tile */
    available: ReadonlySet<CockpitPanel>;
    /** Opens one panel */
    onSelect: (panel: CockpitPanel) => void;
};

/**
 * Four tiles, one per panel, the open one ringed.
 *
 * A tile carries the icon and the name and nothing else. It is tinted amber
 * when its panel has something to fix — a curve column under its target, a
 * role or a type short of its corridor — and plain when the panel is fine,
 * so the row reads at a glance as "two things to look at" without a word of
 * prose. The themes tile never tints: what the reader set there is a
 * preference, not a fault.
 *
 * A tab list to the keyboard: the arrows walk the tiles and open each as
 * they land on it, Home and End jump to the ends.
 *
 * @returns the tile row
 */
export function DeckAdvisorCockpitTiles({ selected, issues, available, onSelect }: DeckAdvisorCockpitTilesProps) {
    const [t] = useTranslation("advisor");
    const tiles = useRef<Partial<Record<CockpitPanel, HTMLButtonElement | null>>>({});
    const shown = COCKPIT_PANELS.filter((panel) => available.has(panel));

    /**
     * Walks the tiles with the arrow keys
     *
     * @param event the key event
     * @param index the tile the key was pressed on
     */
    function walk(event: React.KeyboardEvent, index: number) {
        const by = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
        const to = event.key === "Home" ? 0 : event.key === "End" ? shown.length - 1 : undefined;
        if (by === undefined && to === undefined) return;
        event.preventDefault();
        const next = shown[to ?? (index + (by ?? 0) + shown.length) % shown.length];
        onSelect(next);
        tiles.current[next]?.focus();
    }

    return (
        <div
            role={"tablist"}
            aria-label={t("accessibility.cockpit-panels")}
            className={"grid grid-cols-2 gap-2 sm:grid-cols-4"}
        >
            {shown.map((panel, index) => {
                const Icon = ICONS[panel];
                const issue = issues.has(panel);
                const open = panel === selected;
                const name = t(`heading.${panel}`);
                return (
                    <button
                        key={panel}
                        ref={(element) => {
                            tiles.current[panel] = element;
                        }}
                        type={"button"}
                        role={"tab"}
                        aria-selected={open}
                        // The state is in the tint; the name has to carry it
                        // for anyone who cannot see the tint.
                        aria-label={issue ? t("accessibility.panel-issue", { name }) : name}
                        tabIndex={open ? 0 : -1}
                        onClick={() => onSelect(panel)}
                        onKeyDown={(event) => walk(event, index)}
                        className={clsx(
                            "flex min-w-0 items-center gap-2 rounded-(--radius-card) px-3.5 py-3 text-left text-sm/6 font-medium shadow-(--shadow-card-sm) ring-1 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-accent)",
                            issue
                                ? "bg-(--color-warning)/10 text-amber-700 ring-(--color-warning)/35 dark:text-amber-400"
                                : "bg-(--surface-card) text-zinc-600 ring-zinc-950/5 hover:text-zinc-950 dark:text-zinc-300 dark:ring-white/10 dark:hover:text-white",
                            open &&
                                (issue
                                    ? "ring-amber-700 dark:ring-amber-400"
                                    : "text-zinc-950 ring-(--color-accent) dark:text-white"),
                        )}
                    >
                        <Icon
                            aria-hidden={"true"}
                            className={clsx(
                                "size-4 shrink-0",
                                !issue &&
                                    (open
                                        ? "text-(--color-brand-600) dark:text-(--color-brand-300)"
                                        : "text-zinc-400 dark:text-zinc-500"),
                            )}
                        />
                        <span className={"truncate"}>{name}</span>
                    </button>
                );
            })}
        </div>
    );
}
