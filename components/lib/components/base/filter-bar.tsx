import React from "react";
import clsx from "clsx";

/**
 * A responsive filter toolbar used above lists and tables. On mobile the
 * children stack vertically; on `sm+` they sit in a single row.
 *
 * Compose with {@link FilterBarSearch} for the search input and
 * {@link FilterBarControl} for each dropdown or additional control.
 *
 * @example
 * ```tsx
 * // Search + one dropdown
 * <FilterBar>
 *   <FilterBarSearch>
 *     <InputGroup>
 *       <MagnifyingGlassIcon data-slot="icon" />
 *       <Input placeholder="Search…" />
 *     </InputGroup>
 *   </FilterBarSearch>
 *   <FilterBarControl>
 *     <Listbox value={filter} onChange={setFilter}>
 *       <ListboxOption value="all"><ListboxLabel>All</ListboxLabel></ListboxOption>
 *       <ListboxOption value="active"><ListboxLabel>Active</ListboxLabel></ListboxOption>
 *     </Listbox>
 *   </FilterBarControl>
 * </FilterBar>
 *
 * // Search only — no dropdown
 * <FilterBar>
 *   <FilterBarSearch>
 *     <InputGroup>
 *       <MagnifyingGlassIcon data-slot="icon" />
 *       <Input placeholder="Search…" />
 *     </InputGroup>
 *   </FilterBarSearch>
 * </FilterBar>
 *
 * // Multiple dropdowns
 * <FilterBar>
 *   <FilterBarSearch>...</FilterBarSearch>
 *   <FilterBarControl><Listbox>...</Listbox></FilterBarControl>
 *   <FilterBarControl><Listbox>...</Listbox></FilterBarControl>
 * </FilterBar>
 * ```
 *
 * You can also place a {@link FilterChipGroup} below a {@link FilterBar} as an
 * alternative way to expose filter options. **It is not recommended to use both a
 * {@link FilterBarControl} and a {@link FilterChipGroup} for the same filter
 * dimension**, pick one or the other. Only reach for chips when you can supply
 * a `count` for every option; without counts a dropdown is cleaner.
 *
 * @example
 * ```tsx
 * // Chips with counts (no FilterBarControl for the same filter)
 * <div className="flex flex-col gap-3">
 *   <FilterBar>
 *     <FilterBarSearch>
 *       <InputGroup>
 *         <MagnifyingGlassIcon data-slot="icon" />
 *         <Input placeholder="Search…" />
 *       </InputGroup>
 *     </FilterBarSearch>
 *   </FilterBar>
 *   <FilterChipGroup>
 *     <FilterChip active={filter === "all"} label="All" count={120} onClick={() => setFilter("all")} />
 *     <FilterChip active={filter === "servers"} icon={<ServerStackIcon />} label="Servers" count={42} onClick={() => setFilter("servers")} />
 *     <FilterChip active={filter === "clients"} icon={<ComputerDesktopIcon />} label="Clients" count={78} onClick={() => setFilter("clients")} />
 *   </FilterChipGroup>
 * </div>
 *
 * // No counts available — use FilterBarControl instead
 * <FilterBar>
 *   <FilterBarSearch>...</FilterBarSearch>
 *   <FilterBarControl>
 *     <Listbox value={filter} onChange={setFilter}>...</Listbox>
 *   </FilterBarControl>
 * </FilterBar>
 * ```
 */
export function FilterBar(props: React.ComponentPropsWithoutRef<"div">) {
    const { className, ...rest } = props;
    return <div {...rest} className={clsx(className, "flex flex-col gap-3 sm:flex-row sm:items-center")} />;
}

/**
 * The search input area inside a {@link FilterBar}. Takes up all remaining
 * horizontal space once the controls have claimed their fixed widths.
 */
export function FilterBarSearch(props: React.ComponentPropsWithoutRef<"div">) {
    const { className, ...rest } = props;
    return <div {...rest} className={clsx(className, "flex-1")} />;
}

/**
 * A fixed-width control slot inside a {@link FilterBar} — typically a
 * `<Listbox>` or `<Select>` dropdown. Repeat for multiple controls.
 */
export function FilterBarControl(props: React.ComponentPropsWithoutRef<"div">) {
    const { className, ...rest } = props;
    return <div {...rest} className={clsx(className, "sm:w-56")} />;
}

/**
 *
 * You can also place a {@link FilterChipGroup} below a {@link FilterBar} as an
 * alternative way to expose filter options. **It is not recommended to use both a
 * {@link FilterBarControl} and a {@link FilterChipGroup} for the same filter
 * dimension**, pick one or the other. Only reach for chips when you can supply
 * a `count` for every option; without counts a dropdown is cleaner.
 *
 * @example
 * ```tsx
 * // Chips with counts (no FilterBarControl for the same filter)
 * <div className="flex flex-col gap-3">
 *   <FilterBar>
 *     <FilterBarSearch>
 *       <InputGroup>
 *         <MagnifyingGlassIcon data-slot="icon" />
 *         <Input placeholder="Search…" />
 *       </InputGroup>
 *     </FilterBarSearch>
 *   </FilterBar>
 *   <FilterChipGroup>
 *     <FilterChip active={filter === "all"} label="All" count={120} onClick={() => setFilter("all")} />
 *     <FilterChip active={filter === "servers"} icon={<ServerStackIcon />} label="Servers" count={42} onClick={() => setFilter("servers")} />
 *     <FilterChip active={filter === "clients"} icon={<ComputerDesktopIcon />} label="Clients" count={78} onClick={() => setFilter("clients")} />
 *   </FilterChipGroup>
 * </div>
 *
 * // No counts available — use FilterBarControl instead
 * <FilterBar>
 *   <FilterBarSearch>...</FilterBarSearch>
 *   <FilterBarControl>
 *     <Listbox value={filter} onChange={setFilter}>...</Listbox>
 *   </FilterBarControl>
 * </FilterBar>
 * ```
 */
export function FilterChipGroup(props: React.ComponentPropsWithoutRef<"div">) {
    const { className, ...rest } = props;
    return <div {...rest} className={clsx(className, "flex flex-wrap gap-2")} />;
}

/**
 * The properties for {@link FilterChip}
 */
export type FilterChipProps = {
    /** Whether this chip represents the currently active filter. */
    active: boolean;
    /** Optional leading icon. */
    icon?: React.ReactNode;
    /** The filter label. */
    label: string;
    /**
     * Item count shown as a badge inside the chip. Required — only use
     * {@link FilterChip} when you have a count per option. If you don't have
     * counts, use {@link FilterBarControl} with a dropdown instead.
     */
    count: number;
    /** Called when the chip is clicked. */
    onClick: () => void;
    /** Additional CSS classes */
    className?: string;
};

/**
 * A pill-shaped toggle chip for quick filter switching. Highlights when
 * active and shows a count badge for at-a-glance scanning.
 *
 * Use inside a {@link FilterChipGroup} below a {@link FilterBar}.
 *
 * @example
 * ```tsx
 * <FilterChip
 *   active={filter === "servers"}
 *   icon={<ServerStackIcon />}
 *   label="Servers"
 *   count={42}
 *   onClick={() => setFilter("servers")}
 * />
 * ```
 */
export function FilterChip(props: FilterChipProps) {
    const { active, icon, label, count, onClick, className } = props;
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            className={clsx(
                className,
                "inline-flex items-center gap-2 rounded-(--radius-pill) border px-3 py-1.5 text-sm font-medium transition-colors",
                "focus:outline-2 focus:outline-offset-2 focus:outline-(--color-brand-500)",
                active
                    ? "border-(--color-brand-500) bg-(--color-brand-50) text-(--color-brand-700) dark:border-(--color-brand-400)/40 dark:bg-(--color-brand-900)/40 dark:text-(--color-brand-200)"
                    : "border-zinc-950/10 bg-(--surface-card) text-zinc-700 hover:border-zinc-950/20 hover:text-zinc-900 dark:border-white/10 dark:text-zinc-300 dark:hover:border-white/20 dark:hover:text-white",
            )}
        >
            {icon && <span className="size-4 *:size-4">{icon}</span>}
            <span>{label}</span>
            <span
                className={clsx(
                    "rounded-(--radius-pill) px-2 py-0.5 text-xs tabular-nums",
                    active
                        ? "bg-(--color-brand-600) text-white"
                        : "bg-zinc-100 text-zinc-600 dark:bg-white/10 dark:text-zinc-300",
                )}
            >
                {count}
            </span>
        </button>
    );
}
