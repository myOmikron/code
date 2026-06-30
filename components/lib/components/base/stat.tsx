import React from "react";
import clsx from "clsx";

const StatListContext = React.createContext(false);

/**
 * The properties for {@link Stat}
 */
export type StatProps = {
    /** The label for the stat */
    label: string;
    /** The value to display */
    value: React.ReactNode;
    /** Item to display below the value */
    sub?: React.ReactNode;
    /**
     * Whether to render as a surface card. Defaults to `true`; automatically
     * `false` when rendered inside a {@link StatList}.
     */
    card?: boolean;
    /** Optional leading icon (any heroicon-style svg with `data-slot="icon"`). */
    icon?: React.ReactNode;
    /** Additional CSS classes */
    className?: string;
};

/**
 * A single statistic with label, value, optional icon and sub-text.
 * Renders as a surface card by default; automatically switches to inline
 * when placed inside a {@link StatList}.
 *
 * @example
 * ```tsx
 * <Stat label="Total users" value={1_234} sub="+12 this week" icon={<UsersIcon />} />
 *
 * <StatList>
 *   <Stat label="Deploys" value={405} />
 *   <Stat label="Uptime" value="99.9%" sub="last 30 days" />
 * </StatList>
 * ```
 */
export function Stat(props: StatProps) {
    const { label, value, sub, icon, card, className } = props;
    const inList = React.useContext(StatListContext);
    const isCard = card ?? !inList;

    const inner = (
        <div className="flex flex-col">
            {icon && (
                <div className="mb-3 inline-flex size-9 items-center justify-center rounded-(--radius-control) bg-(--color-brand-50) text-(--color-brand-600) *:data-[slot=icon]:size-5 dark:bg-(--color-brand-900)/40 dark:text-(--color-brand-300)">
                    {icon}
                </div>
            )}
            <span className="text-sm/6 font-medium text-zinc-600 dark:text-zinc-300">{label}</span>
            <span className="mt-1 text-2xl/8 font-semibold text-zinc-950 dark:text-white">{value}</span>
            {sub && <span className="mt-2 text-xs/5 text-zinc-500 dark:text-zinc-400">{sub}</span>}
        </div>
    );

    if (!isCard) return inner;

    return (
        <div
            className={clsx(
                className,
                "rounded-(--radius-card) bg-(--surface-card) p-5 shadow-(--shadow-card-sm) ring-1 ring-zinc-950/5 transition-shadow hover:shadow-(--shadow-card-md) dark:ring-white/10",
            )}
        >
            {inner}
        </div>
    );
}

/**
 * The properties for {@link StatTile}
 */
export type StatTileProps = {
    /** Leading icon (any heroicon-style svg). */
    icon: React.ReactNode;
    /** The label for the stat */
    label: string;
    /** The value to display */
    value: React.ReactNode;
    /** Optional secondary text displayed next to the value */
    sub?: React.ReactNode;
    /** Additional CSS classes */
    className?: string;
};

/**
 * A compact stat tile for dense layouts like header strips. Uses the same
 * surface tokens as {@link Stat} but in a horizontal icon + text layout that
 * fits four across without dominating the page.
 *
 * @example
 * ```tsx
 * <div className="grid grid-cols-4 gap-3">
 *   <StatTile icon={<UsersIcon />} label="Total users" value={1_234} />
 *   <StatTile icon={<ServerIcon />} label="Active servers" value={8} sub="/ 10" />
 * </div>
 * ```
 */
export function StatTile(props: StatTileProps) {
    const { icon, label, value, sub, className } = props;
    return (
        <div
            className={clsx(
                className,
                "flex items-center gap-3 rounded-(--radius-card) bg-(--surface-card) p-3 ring-1 ring-zinc-950/5 dark:ring-white/10",
            )}
        >
            <div className="inline-flex size-9 shrink-0 items-center justify-center rounded-(--radius-control) bg-(--color-brand-50) text-(--color-brand-600) dark:bg-(--color-brand-900)/40 dark:text-(--color-brand-300)">
                {icon}
            </div>
            <div className="min-w-0 flex-1">
                <div className="truncate text-xs/4 text-zinc-500 dark:text-zinc-400">{label}</div>
                <div className="flex items-baseline gap-1.5">
                    <span className="text-lg font-semibold text-zinc-950 tabular-nums dark:text-white">{value}</span>
                    {sub && <span className="text-xs text-zinc-500 dark:text-zinc-400">{sub}</span>}
                </div>
            </div>
        </div>
    );
}

/**
 * A horizontal layout container for {@link Stat} items. Stats inside are
 * automatically rendered without a card surface.
 *
 * @example
 * ```tsx
 * <StatList>
 *   <Stat label="Deploys" value={405} />
 *   <Stat label="Deploy time" value="3.65" sub="mins" />
 *   <Stat label="Servers" value={3} />
 * </StatList>
 * ```
 */
export function StatList(props: React.ComponentPropsWithoutRef<"div">) {
    const { className, ...rest } = props;
    return (
        <StatListContext.Provider value={true}>
            <div
                {...rest}
                className={clsx(className, "flex items-center justify-around gap-x-8 px-4 py-2 sm:px-6 lg:px-8")}
            />
        </StatListContext.Provider>
    );
}
