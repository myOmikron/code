import { CheckIcon } from "@heroicons/react/16/solid";
import { Button, Dialog, DialogActions, DialogBody, DialogTitle, Input, Text } from "components";
import clsx from "clsx";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { InlineError } from "src/components/inline-error";
import { GraphFacet, graphFacets } from "src/utils/graph-search";

/**
 * The properties for {@link DeckThemeDialog}
 */
export type DeckThemeDialogProps = {
    /** Whether the dialog is on screen */
    open: boolean;
    /** Puts the dialog away */
    onClose: () => void;
    /** The themes currently argued for */
    pinned: Array<string>;
    /** How many cards read as each theme, by id — the detection, for reference */
    detected: Record<string, number>;
    /** Records the themes the deck is played for */
    onSave: (themes: Array<string>) => void;
};

/**
 * What the deck is *meant* to be doing, said by the person building it.
 *
 * The detector reads what is already in the list, which is the wrong question
 * for a deck halfway through being built: a Goblin deck with nine Goblins in
 * it does not read as Goblins yet, and the advisor's job at that moment is to
 * find the other twenty. So this is the way in — pick the strategies, and
 * every suggestion, swap and fill is argued for them.
 *
 * Detection is shown beside each option rather than hidden: a theme with
 * nineteen cards behind it is a fact worth seeing next to the choice, and a
 * theme with none is exactly the gap this dialog exists to close.
 *
 * @returns the dialog
 */
export function DeckThemeDialog({ open, onClose, pinned, detected, onSave }: DeckThemeDialogProps) {
    const [t] = useTranslation("advisor");
    const [themes, setThemes] = useState<Array<GraphFacet> | null>(null);
    const [failed, setFailed] = useState(false);
    const [picked, setPicked] = useState<Array<string>>(pinned);
    const [search, setSearch] = useState("");

    // Re-seeded per opening: the dialog outlives the deck it was opened on.
    useEffect(() => {
        if (!open) return;
        setPicked(pinned);
        setSearch("");
    }, [open]);

    useEffect(() => {
        if (!open || themes !== null) return;
        setFailed(false);
        graphFacets()
            .then((facets) => setThemes(facets.themes))
            .catch(() => setFailed(true));
    }, [open, themes]);

    const listed = useMemo(() => {
        const term = search.trim().toLowerCase();
        return (themes ?? [])
            .filter((theme) => term === "" || theme.label.toLowerCase().includes(term))
            .sort(
                (left, right) =>
                    (detected[right.value] ?? 0) - (detected[left.value] ?? 0) || left.label.localeCompare(right.label),
            );
    }, [themes, search, detected]);

    /**
     * Adds or removes one theme from the picks
     *
     * @param theme the theme id that was clicked
     */
    function toggle(theme: string) {
        setPicked((held) => (held.includes(theme) ? held.filter((id) => id !== theme) : [...held, theme]));
    }

    return (
        <Dialog open={open} onClose={onClose} size={"2xl"}>
            <DialogTitle>{t("heading.define-themes")}</DialogTitle>
            <DialogBody>
                <Text>{t("description.define-themes")}</Text>
                {failed && (
                    <div className={"mt-4"}>
                        <InlineError>{t("error.themes-unavailable")}</InlineError>
                    </div>
                )}
                {themes === null && !failed && <Text className={"mt-4"}>{t("description.themes-loading")}</Text>}
                {themes !== null && (
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
                                        onClick={() => toggle(theme.value)}
                                        aria-pressed={chosen}
                                        className={clsx(
                                            "flex items-center gap-2 rounded-(--radius-control) px-2.5 py-2 text-left text-sm/6 transition",
                                            chosen
                                                ? "bg-(--color-accent)/10 text-(--color-brand-700) ring-1 ring-(--color-accent)/30 dark:text-(--color-brand-300)"
                                                : "text-zinc-700 hover:bg-zinc-950/5 dark:text-zinc-300 dark:hover:bg-white/5",
                                        )}
                                    >
                                        <CheckIcon
                                            className={clsx("size-4 shrink-0", chosen ? "opacity-100" : "opacity-0")}
                                        />
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
                )}
            </DialogBody>
            <DialogActions>
                <Button plain onClick={onClose}>
                    {t("button.cancel")}
                </Button>
                <Button
                    color={"blue"}
                    onClick={() => {
                        onSave(picked);
                        onClose();
                    }}
                >
                    {t("button.save-themes")}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
