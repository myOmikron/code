import { FilterBarControl, FilterBarSearch, FilterChip, Input, Listbox, ListboxLabel, ListboxOption } from "components";
import { useTranslation } from "react-i18next";
import { MPC_SORTS } from "src/utils/mpcfill";
import type { MpcSort } from "src/utils/mpcfill";

/**
 * The properties for {@link MpcFillOrderToolbar}
 */
export type MpcFillOrderToolbarProps = {
    /** What the tiles are filtered by */
    query: string;
    /** Changes that */
    onQuery: (query: string) => void;
    /** How the tiles are sorted */
    sort: MpcSort;
    /** Changes that */
    onSort: (sort: MpcSort) => void;
    /** How many cards have no art */
    missing: number;
    /** Whether only those are shown */
    onlyMissing: boolean;
    /** Switches that over */
    onMissing: () => void;
};

/**
 * Finds a card in the order's grid, without changing what is ordered.
 *
 * @returns the search, the sort and the filter
 */
export function MpcFillOrderToolbar({
    query,
    onQuery,
    sort,
    onSort,
    missing,
    onlyMissing,
    onMissing,
}: MpcFillOrderToolbarProps) {
    const [t] = useTranslation("game-utils");

    return (
        <div className={"sticky top-0 z-20 flex flex-wrap items-center gap-2 bg-white py-2 dark:bg-zinc-900"}>
            <FilterBarSearch className={"min-w-48"}>
                <Input
                    type={"search"}
                    aria-label={t("label.find-card")}
                    placeholder={t("label.find-card")}
                    value={query}
                    onChange={(event) => onQuery(event.target.value)}
                />
            </FilterBarSearch>
            <FilterBarControl className={"max-sm:flex-1"}>
                <Listbox<MpcSort> aria-label={t("label.sort")} value={sort} onChange={onSort}>
                    {MPC_SORTS.map((option) => (
                        <ListboxOption key={option} value={option}>
                            <ListboxLabel>{t(`label.sort-${option}`)}</ListboxLabel>
                        </ListboxOption>
                    ))}
                </Listbox>
            </FilterBarControl>
            {missing > 0 && (
                <FilterChip
                    active={onlyMissing}
                    label={t("label.without-art")}
                    count={missing}
                    onClick={onMissing}
                    className={"min-h-9 shrink-0"}
                />
            )}
        </div>
    );
}
