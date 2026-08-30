import { InformationCircleIcon } from "@heroicons/react/20/solid";
import {
    Badge,
    Combobox,
    ComboboxLabel,
    ComboboxOption,
    Description,
    Dialog,
    DialogBody,
    DialogTitle,
    Dropdown,
    DropdownButton,
    DropdownHeader,
    DropdownMenu,
    Field,
    Label,
    ScrollFade,
    Text,
} from "components";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { DialogCloseButton } from "src/components/dialog-close-button";
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
 * Whether a facet answers to what was typed
 *
 * Matches the label, the graph's own spelling, and every alias — someone
 * typing "reanimator" has to land on `recursion_to_battlefield`, because the
 * player name and the vocabulary name are rarely the same word.
 *
 * @param facet the option under consideration
 * @param query what was typed so far
 *
 * @returns true when the option should stay in the list
 */
function matches(facet: GraphFacet | null, query: string): boolean {
    if (facet === null) return false;
    const typed = query.toLowerCase();
    return (
        facet.label.toLowerCase().includes(typed) ||
        facet.value.toLowerCase().includes(typed) ||
        facet.aliases.some((alias) => alias.toLowerCase().includes(typed))
    );
}

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
        // Cleared first: the dialog outlives one outage, and a stale flag
        // would print "not answering" above a fully populated filter list.
        setFailed(false);
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
        <Dialog open={open} onClose={onClose} className={"flex flex-col"}>
            <DialogTitle className={"flex items-center gap-3"}>
                <span className={"min-w-0 flex-1 truncate"}>{t("heading.graph-filter")}</span>
                <DialogCloseButton onClose={onClose} />
            </DialogTitle>
            <Description>{t("description.graph-filter")}</Description>
            <DialogBody className={"flex min-h-0 flex-1 flex-col"}>
                <ScrollFade className={"min-h-0 flex-1"}>
                    <div className={"flex flex-col gap-4"}>
                        {failed && <Text>{t("description.graph-filter-unavailable")}</Text>}
                        {facets !== null &&
                            CATEGORIES.map(({ key, facet }) => {
                                const held = filters[key];
                                const options = facets[facet].filter((entry) => !held.includes(entry.value));
                                const labelOf = (value: string) =>
                                    facets[facet].find((entry) => entry.value === value)?.label ?? value;
                                return (
                                    <Field key={key}>
                                        <span className={"flex items-center gap-1"}>
                                            <Label>{t(`label.graph-${CATEGORY_SLUGS[key]}`)}</Label>
                                            <Dropdown>
                                                <DropdownButton
                                                    as={"button"}
                                                    type={"button"}
                                                    aria-label={t("accessibility.graph-filter-info")}
                                                    className={
                                                        "text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
                                                    }
                                                >
                                                    <InformationCircleIcon className={"size-4"} />
                                                </DropdownButton>
                                                <DropdownMenu anchor={"bottom start"} className={"max-w-72"}>
                                                    <DropdownHeader>
                                                        <p
                                                            className={
                                                                "text-xs/5 font-normal text-zinc-500 dark:text-zinc-400"
                                                            }
                                                        >
                                                            {t(`description.graph-${CATEGORY_SLUGS[key]}`)}
                                                        </p>
                                                    </DropdownHeader>
                                                </DropdownMenu>
                                            </Dropdown>
                                        </span>
                                        <Combobox<GraphFacet | null>
                                            // Remounting on a pick clears the input for the next one.
                                            key={held.length}
                                            options={options}
                                            value={null}
                                            displayValue={(entry) => entry?.label}
                                            filter={matches}
                                            placeholder={t("label.graph-filter-placeholder")}
                                            onChange={(entry) => {
                                                if (entry != null) add(key, entry.value);
                                            }}
                                        >
                                            {(entry) => (
                                                <ComboboxOption value={entry}>
                                                    <ComboboxLabel>
                                                        {entry.label}
                                                        {entry.aliases.length > 0 && (
                                                            <span
                                                                className={
                                                                    "ml-1.5 text-xs text-zinc-500 dark:text-zinc-400"
                                                                }
                                                            >
                                                                ({entry.aliases.join(", ")})
                                                            </span>
                                                        )}
                                                        <span
                                                            className={"ml-2 text-xs text-zinc-500 dark:text-zinc-400"}
                                                        >
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
                                                        <Badge color={"blue"} className={"capitalize"}>
                                                            {labelOf(value)} ×
                                                        </Badge>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </Field>
                                );
                            })}
                    </div>
                </ScrollFade>
            </DialogBody>
        </Dialog>
    );
}
