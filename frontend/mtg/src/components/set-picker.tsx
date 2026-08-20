import { ChevronDownIcon } from "@heroicons/react/20/solid";
import {
    Button,
    Checkbox,
    CheckboxField,
    Dialog,
    DialogActions,
    DialogBody,
    DialogTitle,
    Divider,
    Input,
    Label,
    StackedList,
    StackedListFlexRow,
    Strong,
    Text,
} from "components";
import { useDeferredValue, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { filterFamilies, groupSetsIntoFamilies } from "src/utils/set-families";
import type { IndexedSet, SetFamily } from "src/utils/set-families";

/** How many releases to render at once; the rest are reachable by searching. */
const VISIBLE_FAMILIES = 60;

/**
 * The properties for {@link SetPicker}
 */
export type SetPickerProps = {
    open: boolean;
    sets: IndexedSet[];
    /** Set codes selected on open; empty means nothing chosen yet. */
    initialSelection: string[];
    onCancel: () => void;
    onConfirm: (codes: string[]) => void;
};

/**
 * Picks which sets the scanner searches.
 *
 * Releases are offered as one entry ("Secrets of Strixhaven" covers its commander decks, tokens,
 * art series and promos), because that is how a box of cards actually arrives — but every set code
 * inside stays individually toggleable, since the grouping is derived from naming conventions and
 * cannot be right for every release.
 *
 * @returns the set dialog
 */
export function SetPicker({ open, sets, initialSelection, onCancel, onConfirm }: SetPickerProps) {
    const [t] = useTranslation("set-picker");
    const [tg] = useTranslation();
    const families = useMemo(() => groupSetsIntoFamilies(sets), [sets]);
    const [query, setQuery] = useState("");
    // Typing must not wait on the list. Filtering ~520 releases and re-rendering their rows costs
    // a few hundred milliseconds on the first keystroke, which is felt directly in the field;
    // deferring it lets React paint the input first and redo the list at lower priority.
    const deferredQuery = useDeferredValue(query);
    const [selected, setSelected] = useState<Set<string>>(() => new Set(initialSelection.map((c) => c.toUpperCase())));
    const [expanded, setExpanded] = useState<Set<string>>(new Set());

    const matching = useMemo(() => filterFamilies(families, deferredQuery), [families, deferredQuery]);
    // Rendering every release at once mounts ~7000 nodes, which makes opening the dialog and the
    // first keystroke slow for a list nobody scrolls through end to end. Show a workable window and
    // say plainly how much is hidden, rather than quietly truncating.
    const visible = matching.slice(0, VISIBLE_FAMILIES);
    const hidden = matching.length - visible.length;
    const filtering = query !== deferredQuery;
    const selectedCards = useMemo(
        () =>
            families.reduce(
                (sum, family) =>
                    sum +
                    family.sets.reduce(
                        (inner, set) => inner + (selected.has(set.code.toUpperCase()) ? set.cardCount : 0),
                        0,
                    ),
                0,
            ),
        [families, selected],
    );

    /**
     * Applies a mutation to a copy of the current selection
     *
     * @param mutate mutates the copied selection in place
     */
    function update(mutate: (next: Set<string>) => void) {
        setSelected((current) => {
            const next = new Set(current);
            mutate(next);
            return next;
        });
    }

    /**
     * Toggles every set code of a release at once
     *
     * @param family the release to toggle
     */
    function toggleFamily(family: SetFamily) {
        const codes = family.sets.map((set) => set.code.toUpperCase());
        const allOn = codes.every((code) => selected.has(code));
        update((next) => codes.forEach((code) => (allOn ? next.delete(code) : next.add(code))));
    }

    /**
     * Toggles a single set code
     *
     * @param code the set code to toggle
     */
    function toggleSet(code: string) {
        const key = code.toUpperCase();
        update((next) => (next.has(key) ? next.delete(key) : next.add(key)));
    }

    /**
     * Shows or hides the individual set codes of a release
     *
     * @param name the release's name
     */
    function toggleExpanded(name: string) {
        setExpanded((current) => {
            const next = new Set(current);
            if (next.has(name)) next.delete(name);
            else next.add(name);
            return next;
        });
    }

    return (
        <Dialog open={open} onClose={onCancel} size="2xl">
            <DialogTitle>{t("heading.choose-sets")}</DialogTitle>
            <DialogBody>
                <div className="flex items-center gap-2">
                    <Input
                        className="min-w-0 flex-1"
                        type="search"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder={t("label.search-placeholder")}
                        aria-label={t("accessibility.search-sets")}
                    />
                    <Button
                        plain
                        className="whitespace-nowrap"
                        onClick={() => setSelected(new Set())}
                        disabled={selected.size === 0}
                    >
                        {t("button.clear-selection")}
                    </Button>
                </div>

                <Divider className="my-4" />

                {/* `scrollbar-gutter: stable` reserves the track whether or not it is showing, so filtering
                    the list down does not shift the rows sideways; the padding keeps the right-aligned
                    counts off the scrollbar. */}
                <div
                    className={`max-h-[50svh] [scrollbar-gutter:stable] overflow-y-auto pr-3 ${filtering ? "opacity-60" : ""}`}
                >
                    {matching.length === 0 && <Text className="py-6 text-center">{t("label.no-set-found")}</Text>}
                    <StackedList>
                        {visible.map((family) => {
                            const codes = family.sets.map((set) => set.code.toUpperCase());
                            const chosen = codes.filter((code) => selected.has(code)).length;
                            const isOpen = expanded.has(family.name);
                            return (
                                <StackedListFlexRow key={family.name} className="flex-col !items-stretch">
                                    <div className="flex items-center gap-2">
                                        <CheckboxField className="min-w-0 flex-1">
                                            <Checkbox
                                                color="blue"
                                                checked={chosen === codes.length}
                                                indeterminate={chosen > 0 && chosen < codes.length}
                                                onChange={() => toggleFamily(family)}
                                                aria-label={family.name}
                                            />
                                            <Label className="flex w-full min-w-0 items-center gap-2">
                                                <span className="min-w-0 flex-1 truncate">{family.name}</span>
                                                <span className="shrink-0 tabular-nums">
                                                    {chosen > 0 ? (
                                                        <Strong>
                                                            {chosen}/{codes.length}
                                                        </Strong>
                                                    ) : (
                                                        codes.length
                                                    )}
                                                </span>
                                            </Label>
                                        </CheckboxField>
                                        {codes.length > 1 && (
                                            <Button
                                                plain
                                                onClick={() => toggleExpanded(family.name)}
                                                aria-label={
                                                    isOpen
                                                        ? t("accessibility.collapse", { name: family.name })
                                                        : t("accessibility.expand", { name: family.name })
                                                }
                                                aria-expanded={isOpen}
                                            >
                                                <ChevronDownIcon
                                                    className={`size-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
                                                />
                                            </Button>
                                        )}
                                    </div>
                                    {isOpen && (
                                        <div className="mt-1 mb-2 flex flex-col gap-1 pl-6">
                                            {family.sets.map((set) => (
                                                <CheckboxField key={set.code}>
                                                    <Checkbox
                                                        color="blue"
                                                        checked={selected.has(set.code.toUpperCase())}
                                                        onChange={() => toggleSet(set.code)}
                                                        aria-label={set.name}
                                                    />
                                                    <Label className="flex w-full min-w-0 items-center gap-3">
                                                        <code className="w-12 shrink-0 text-xs">{set.code}</code>
                                                        <span className="min-w-0 flex-1 truncate">{set.name}</span>
                                                        <span className="shrink-0 tabular-nums">{set.cardCount}</span>
                                                    </Label>
                                                </CheckboxField>
                                            ))}
                                        </div>
                                    )}
                                </StackedListFlexRow>
                            );
                        })}
                    </StackedList>
                    {hidden > 0 && (
                        <Text className="py-3 text-center">
                            {t("label.more-hidden", { amount: hidden.toLocaleString("de-DE") })}
                        </Text>
                    )}
                </div>
                <Divider className="mt-4" />
                <Text className="mt-4">
                    {selected.size === 0 ? (
                        t("label.no-sets-selected")
                    ) : (
                        <>
                            <Strong>{t("label.sets-selected", { count: selected.size, amount: selected.size })}</Strong>{" "}
                            ·{" "}
                            {tg("label.cards", { count: selectedCards, amount: selectedCards.toLocaleString("de-DE") })}
                        </>
                    )}
                </Text>
            </DialogBody>
            <DialogActions>
                <Button plain onClick={onCancel}>
                    {tg("button.cancel")}
                </Button>
                <Button color="blue" disabled={selected.size === 0} onClick={() => onConfirm([...selected])}>
                    {t("button.start-scan")}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
