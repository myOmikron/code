import { CheckIcon } from "@heroicons/react/16/solid";
import { Input, Text } from "components";
import clsx from "clsx";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { InlineError } from "src/components/inline-error";
import { GraphFacet, graphFacets } from "src/utils/graph-search";

/**
 * The properties for {@link DeckThemePicker}
 */
export type DeckThemePickerProps = {
    /** The themes currently picked */
    picked: Array<string>;
    /** Adds or removes one theme from the picks */
    onToggle: (theme: string) => void;
    /** How many cards read as each theme, by id — the detection, for reference */
    detected: Record<string, number>;
};

/**
 * The search box and grid over the graph's own theme list — the body of
 * {@link DeckThemeDialog}, extracted so the setup wizard's first step can
 * render the exact same picker rather than a copy of it.
 *
 * Owns its own fetch of {@link graphFacets}, its own search text and its own
 * loading/failed states: everything a host needs to know from outside is
 * which themes are picked, how to toggle one, and what has been detected —
 * the three props above.
 *
 * @returns the picker
 */
export function DeckThemePicker({ picked, onToggle, detected }: DeckThemePickerProps) {
    const [t] = useTranslation("advisor");
    const [themes, setThemes] = useState<Array<GraphFacet> | null>(null);
    const [failed, setFailed] = useState(false);
    const [search, setSearch] = useState("");

    useEffect(() => {
        if (themes !== null) return;
        setFailed(false);
        graphFacets()
            .then((facets) => setThemes(facets.themes))
            .catch(() => setFailed(true));
    }, [themes]);

    const listed = useMemo(() => {
        const term = search.trim().toLowerCase();
        return (themes ?? [])
            .filter((theme) => term === "" || theme.label.toLowerCase().includes(term))
            .sort(
                (left, right) =>
                    (detected[right.value] ?? 0) - (detected[left.value] ?? 0) || left.label.localeCompare(right.label),
            );
    }, [themes, search, detected]);

    if (failed) {
        return (
            <div className={"mt-4"}>
                <InlineError>{t("error.themes-unavailable")}</InlineError>
            </div>
        );
    }

    if (themes === null) {
        return <Text className={"mt-4"}>{t("description.themes-loading")}</Text>;
    }

    return (
        <>
            <Input
                className={"mt-4"}
                value={search}
                placeholder={t("label.theme-search")}
                onChange={(event) => setSearch(event.target.value)}
            />
            <div className={"mt-3 grid max-h-96 gap-1 overflow-y-auto sm:grid-cols-2"}>
                {listed.map((theme) => {
                    const chosen = picked.includes(theme.value);
                    const cards = detected[theme.value] ?? 0;
                    return (
                        <button
                            key={theme.value}
                            type={"button"}
                            onClick={() => onToggle(theme.value)}
                            aria-pressed={chosen}
                            className={clsx(
                                "flex items-center gap-2 rounded-(--radius-control) px-2.5 py-2 text-left text-sm/6 transition",
                                chosen
                                    ? "bg-(--color-accent)/10 text-(--color-brand-700) ring-1 ring-(--color-accent)/30 dark:text-(--color-brand-300)"
                                    : "text-zinc-700 hover:bg-zinc-950/5 dark:text-zinc-300 dark:hover:bg-white/5",
                            )}
                        >
                            <CheckIcon className={clsx("size-4 shrink-0", chosen ? "opacity-100" : "opacity-0")} />
                            <span className={"min-w-0 flex-1 truncate"}>{theme.label}</span>
                            {cards > 0 && (
                                <span className={"text-xs/5 text-zinc-500 tabular-nums dark:text-zinc-400"}>
                                    {t("label.theme-cards", { count: cards })}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>
        </>
    );
}
