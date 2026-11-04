import { Input, Listbox, ListboxLabel, ListboxOption } from "components";
import clsx from "clsx";
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
    onOnlyMissing: (only: boolean) => void;
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
    onOnlyMissing,
}: MpcFillOrderToolbarProps) {
    const [t] = useTranslation("game-utils");

    return (
        <div className={"sticky top-0 z-20 flex flex-wrap items-center gap-2 bg-white py-2 dark:bg-zinc-900"}>
            <div className={"min-w-48 flex-1"}>
                <Input
                    type={"search"}
                    aria-label={t("label.find-card")}
                    placeholder={t("label.find-card")}
                    value={query}
                    onChange={(event) => onQuery(event.target.value)}
                />
            </div>
            <div className={"w-56 max-sm:flex-1"}>
                <Listbox<MpcSort> aria-label={t("label.sort")} value={sort} onChange={onSort}>
                    {MPC_SORTS.map((option) => (
                        <ListboxOption key={option} value={option}>
                            <ListboxLabel>{t(`label.sort-${option}`)}</ListboxLabel>
                        </ListboxOption>
                    ))}
                </Listbox>
            </div>
            {missing > 0 && (
                <button
                    type={"button"}
                    aria-pressed={onlyMissing}
                    onClick={() => onOnlyMissing(!onlyMissing)}
                    className={clsx(
                        "min-h-9 shrink-0 rounded-(--radius-pill) px-3 text-sm font-medium ring-1 transition ring-inset",
                        onlyMissing
                            ? "bg-lime-300 text-lime-950 ring-lime-300"
                            : "text-zinc-700 ring-zinc-950/10 hover:bg-lime-400/15 hover:text-lime-700 dark:text-zinc-300 dark:ring-white/15 dark:hover:text-lime-300",
                    )}
                >
                    {t("button.without-art", { cards: missing })}
                </button>
            )}
        </div>
    );
}
