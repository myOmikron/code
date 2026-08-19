import {
    Badge,
    Button,
    Combobox,
    ComboboxLabel,
    ComboboxOption,
    Description,
    Dialog,
    DialogActions,
    DialogBody,
    DialogTitle,
    Field,
    Label,
    Text,
} from "components";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { GraphFacet, GraphFacets, GraphFilters, graphFacets } from "src/utils/graph-search";

/**
 * The properties for {@link GraphFilterDialog}
 */
export type GraphFilterDialogProps = {
    /** Whether the dialog is on screen */
    open: boolean;
    /** Puts the dialog away */
    onClose: () => void;
    /** The filters as currently held */
    filters: GraphFilters;
    /** Records a changed set of filters */
    onChange: (filters: GraphFilters) => void;
};

/** One pickable category: which filter list it edits, and which facet feeds it */
type Category = {
    /** The filter list the picks land in */
    key: keyof GraphFilters;
    /** The facet list offering the values */
    facet: keyof GraphFacets;
};

/** The categories in the order the dialog offers them */
const CATEGORIES: Array<Category> = [
    { key: "produces", facet: "resources" },
    { key: "caresAbout", facet: "resources" },
    { key: "roles", facet: "roles" },
    { key: "creatureTypes", facet: "creatureTypes" },
    { key: "themes", facet: "themes" },
];

/** The i18n slug for a category, since camelCase keys cannot be i18n keys */
const CATEGORY_SLUGS: Record<keyof GraphFilters, string> = {
    produces: "produces",
    caresAbout: "cares-about",
    roles: "roles",
    creatureTypes: "creature-types",
    themes: "themes",
};

/**
 * Picks graph filters, one combobox per category.
 *
 * The values come from the graph's facets, so nothing can be picked that has
 * no cards behind it — every option carries its card count. A pick appends to
 * its category; the chips underneath take it back out.
 *
 * @returns the dialog
 */
export function GraphFilterDialog({ open, onClose, filters, onChange }: GraphFilterDialogProps) {
    const [t] = useTranslation("collection");
    const [facets, setFacets] = useState<GraphFacets | null>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        if (!open || facets !== null) return;
        graphFacets()
            .then(setFacets)
            .catch(() => setFailed(true));
    }, [open, facets]);

    /**
     * Appends one value to a category
     *
     * @param key the category
     * @param value the picked value
     */
    function add(key: keyof GraphFilters, value: string) {
        if (filters[key].includes(value)) return;
        onChange({ ...filters, [key]: [...filters[key], value] });
    }

    /**
     * Takes one value back out of a category
     *
     * @param key the category
     * @param value the value to drop
     */
    function drop(key: keyof GraphFilters, value: string) {
        onChange({ ...filters, [key]: filters[key].filter((held) => held !== value) });
    }

    return (
        <Dialog open={open} onClose={onClose}>
            <DialogTitle>{t("heading.graph-filter")}</DialogTitle>
            <Description>{t("description.graph-filter")}</Description>
            <DialogBody className={"flex flex-col gap-4"}>
                {failed && <Text>{t("description.graph-filter-unavailable")}</Text>}
                {facets !== null &&
                    CATEGORIES.map(({ key, facet }) => {
                        const held = filters[key];
                        const options = facets[facet].filter((entry) => !held.includes(entry.value));
                        const labelOf = (value: string) =>
                            facets[facet].find((entry) => entry.value === value)?.label ?? value;
                        return (
                            <Field key={key}>
                                <Label>{t(`label.graph-${CATEGORY_SLUGS[key]}`)}</Label>
                                <Combobox<GraphFacet | null>
                                    // Remounting on a pick clears the input for the next one.
                                    key={held.length}
                                    options={options}
                                    value={null}
                                    displayValue={(entry) => entry?.label}
                                    placeholder={t("label.graph-filter-placeholder")}
                                    onChange={(entry) => {
                                        if (entry != null) add(key, entry.value);
                                    }}
                                >
                                    {(entry) => (
                                        <ComboboxOption value={entry}>
                                            <ComboboxLabel>
                                                {entry.label}
                                                <span className={"ml-2 text-xs text-zinc-500 dark:text-zinc-400"}>
                                                    {entry.count}
                                                </span>
                                            </ComboboxLabel>
                                        </ComboboxOption>
                                    )}
                                </Combobox>
                                {held.length > 0 && (
                                    <div className={"mt-2 flex flex-wrap gap-1"}>
                                        {held.map((value) => (
                                            <button
                                                key={value}
                                                type={"button"}
                                                aria-label={t("accessibility.remove-graph-filter", {
                                                    name: labelOf(value),
                                                })}
                                                onClick={() => drop(key, value)}
                                            >
                                                <Badge color={"blue"}>{labelOf(value)} ×</Badge>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </Field>
                        );
                    })}
            </DialogBody>
            <DialogActions>
                <Button onClick={onClose}>{t("button.graph-filter-done")}</Button>
            </DialogActions>
        </Dialog>
    );
}
