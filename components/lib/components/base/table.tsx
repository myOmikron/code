"use client";

import { ChevronDownIcon, ChevronUpDownIcon, ChevronUpIcon } from "@heroicons/react/16/solid";
import { clsx } from "clsx";
import type React from "react";
import { createContext, useContext, useState } from "react";
import { Link, LinkProps } from "./link";

/** Which way a sortable column is currently ordered */
export type TableSortDirection = "asc" | "desc" | undefined;

/** Configuration context for Table behavior */
type TableContextType = {
    /** Whether the table extends to the edges */
    bleed: boolean;
    /** Whether to use compact row spacing */
    dense: boolean;
    /** Whether to show grid lines */
    grid: boolean;
    /** Whether to use alternating row colors */
    striped: boolean;
    /** Whether the header stays put while the body scrolls */
    stickyHeader: boolean;
    /** Which columns are shown, by column `name`; missing means visible */
    columnVisibility: Record<string, boolean>;
};

const TableContext = createContext<TableContextType>({
    bleed: false,
    dense: false,
    grid: false,
    striped: false,
    stickyHeader: false,
    columnVisibility: {},
});

/**
 * The properties for {@link Table}
 */
export type TableProps = {
    /** Whether the table extends to the edges */
    bleed?: boolean;
    /** Whether to use compact row spacing */
    dense?: boolean;
    /** Whether to show grid lines */
    grid?: boolean;
    /** Whether to use alternating row colors */
    striped?: boolean;
    /** Whether the header stays put while the body scrolls */
    stickyHeader?: boolean;
    /** Which columns are shown, by column `name`; a missing entry means visible */
    columnVisibility?: Record<string, boolean>;
    /**
     * Whether the table may scroll sideways inside its own box.
     *
     * On by default, which is what lets a wide table live in a narrow column.
     * Turn it off for a table that has been made to fit: the wrapper is a
     * scroll container on *both* axes — css forces `overflow-y` to `auto` as
     * soon as `overflow-x` is not `visible` — so a table that keeps it ends up
     * with scrollbars of its own inside the page's.
     */
    scrollable?: boolean;
} & React.ComponentPropsWithoutRef<"div">;

/**
 * A styled data table.
 *
 * @example
 * ```tsx
 * <Table>
 *   <TableHead>
 *     <TableRow>
 *       <TableHeader>Name</TableHeader>
 *       <TableHeader>Email</TableHeader>
 *     </TableRow>
 *   </TableHead>
 *   <TableBody>
 *     <TableRow>
 *       <TableCell>Lindsay Walton</TableCell>
 *       <TableCell>lindsay@example.com</TableCell>
 *     </TableRow>
 *   </TableBody>
 * </Table>
 * ```
 *
 * @see https://catalyst.tailwindui.com/docs/table
 */
export function Table(props: TableProps) {
    const {
        bleed = false,
        dense = false,
        grid = false,
        striped = false,
        stickyHeader = false,
        columnVisibility = {},
        scrollable = true,
        className,
        children,
        ...rest
    } = props;
    return (
        <TableContext.Provider
            value={
                {
                    bleed,
                    dense,
                    grid,
                    striped,
                    stickyHeader,
                    columnVisibility,
                } as React.ContextType<typeof TableContext>
            }
        >
            <div className="flow-root">
                <div
                    {...rest}
                    className={clsx(className, "-mx-(--gutter)", scrollable && "overflow-x-auto whitespace-nowrap")}
                >
                    <div
                        className={clsx(
                            "min-w-full align-middle",
                            scrollable && "inline-block",
                            !bleed && "sm:px-(--gutter)",
                        )}
                    >
                        <table className="min-w-full text-left text-sm/6 text-zinc-950 dark:text-white">
                            {children}
                        </table>
                    </div>
                </div>
            </div>
        </TableContext.Provider>
    );
}

/**
 * The header section of a {@link Table}
 */
export function TableHead(props: React.ComponentPropsWithoutRef<"thead">) {
    const { className, ...rest } = props;
    const { stickyHeader } = useContext(TableContext);
    return (
        <thead
            {...rest}
            className={clsx(
                className,
                "text-zinc-500 dark:text-zinc-400",
                // The surface has to come along, or the rows scroll through
                // the header instead of under it.
                stickyHeader && "sticky top-0 z-10 bg-(--surface-card)",
            )}
        />
    );
}

/**
 * The body section of a {@link Table}
 */
export function TableBody(props: React.ComponentPropsWithoutRef<"tbody">) {
    return <tbody {...props} />;
}

/** Context for row-level link data */
type TableRowContextType = {
    /** Optional link href for the row */
    href?: LinkProps["href"];
    /** Optional link params */
    params?: LinkProps["params"];
    /** Optional link search params */
    search?: LinkProps["search"];
    /** Optional link target */
    target?: string;
    /** Optional link title */
    title?: string;
};

const TableRowContext = createContext<TableRowContextType>({
    href: undefined,
    target: undefined,
    title: undefined,
});

/**
 * The properties for {@link TableRow}
 */
export type TableRowProps = {
    /** Optional link href to make the row clickable */
    href?: LinkProps["href"];
    /** Optional link params */
    params?: LinkProps["params"];
    /** Optional link search params */
    search?: LinkProps["search"];
    /** Optional link target */
    target?: string;
    /** Optional link title */
    title?: string;
} & React.ComponentPropsWithoutRef<"tr">;

/**
 * A row within a {@link Table}, optionally clickable as a link
 */
export function TableRow(props: TableRowProps) {
    const { href, params, search, target, title, className, ...rest } = props;
    const { striped } = useContext(TableContext);

    return (
        <TableRowContext.Provider
            value={{ href, params, search, target, title } as React.ContextType<typeof TableRowContext>}
        >
            <tr
                {...rest}
                className={clsx(
                    className,
                    href &&
                        "has-[[data-row-link][data-focus]]:outline-2 has-[[data-row-link][data-focus]]:-outline-offset-2 has-[[data-row-link][data-focus]]:outline-blue-500 dark:focus-within:bg-white/[2.5%]",
                    striped && "even:bg-zinc-950/[2.5%] dark:even:bg-white/[2.5%]",
                    href && striped && "hover:bg-zinc-950/5 dark:hover:bg-white/5",
                    href && !striped && "hover:bg-zinc-950/[2.5%] dark:hover:bg-white/[2.5%]",
                )}
            />
        </TableRowContext.Provider>
    );
}

/**
 * A header cell within a {@link TableHead} row
 */
export type TableHeaderProps = {
    /** Column identifier, which {@link TableProps.columnVisibility} hides by */
    name?: string;
    /** Whether the column can be ordered by */
    sortable?: boolean;
    /** Which way it is ordered right now, `undefined` when it is not the key */
    direction?: TableSortDirection;
    /** Called when the header is activated */
    onSort?: () => void;
} & React.ComponentPropsWithoutRef<"th">;

/**
 * A header cell within a {@link TableRow}
 *
 * A sortable header is a button rather than a click handler on the cell, so it
 * can be reached and triggered from the keyboard, and it carries `aria-sort` so
 * the order is announced rather than only drawn.
 */
export function TableHeader(props: TableHeaderProps) {
    const { name, sortable, direction, onSort, className, children, ...rest } = props;
    const { bleed, grid, columnVisibility } = useContext(TableContext);

    if (name !== undefined && columnVisibility[name] === false) return null;

    const headerClass = clsx(
        className,
        // `relative`, as on {@link TableCell}: absolutely positioned content in
        // a cell — a `sr-only` label, a tooltip — otherwise resolves against the
        // page rather than the cell, which means the table's scroll container
        // does not clip it and it stretches the whole document instead.
        "relative border-b border-b-zinc-950/10 px-4 py-2 font-medium first:pl-[var(--gutter,theme(spacing.2))] last:pr-[var(--gutter,theme(spacing.2))] dark:border-b-white/10",
        grid && "border-l border-l-zinc-950/5 first:border-l-0 dark:border-l-white/5",
        !bleed && "sm:first:pl-1 sm:last:pr-1",
    );

    if (sortable !== true) {
        return (
            <th {...rest} className={headerClass}>
                {children}
            </th>
        );
    }

    return (
        <th
            {...rest}
            className={headerClass}
            aria-sort={direction === "asc" ? "ascending" : direction === "desc" ? "descending" : undefined}
        >
            <button
                type="button"
                onClick={onSort}
                className="-mx-1 -my-0.5 inline-flex items-center gap-1 rounded-(--radius-control) px-1 py-0.5 hover:text-zinc-700 focus:outline-2 focus:outline-offset-2 focus:outline-(--color-brand-500) dark:hover:text-zinc-200"
            >
                {children}
                {/* The unsorted state gets an icon too, faded: a column that
                    only reveals it can be sorted once it has been is a column
                    nobody finds. */}
                {direction === "asc" ? (
                    <ChevronUpIcon className="size-3.5" />
                ) : direction === "desc" ? (
                    <ChevronDownIcon className="size-3.5" />
                ) : (
                    <ChevronUpDownIcon className="size-3.5 opacity-50" />
                )}
            </button>
        </th>
    );
}

/**
 * The properties for {@link TableCell}
 */
export type TableCellProps = {
    /** Column identifier, which {@link TableProps.columnVisibility} hides by */
    name?: string;
} & React.ComponentPropsWithoutRef<"td">;

/**
 * A data cell within a {@link TableRow}
 */
export function TableCell(props: TableCellProps) {
    const { name, className, children, ...rest } = props;
    const { bleed, dense, grid, striped, columnVisibility } = useContext(TableContext);
    const { href, search, params, target, title } = useContext(TableRowContext);
    const [cellRef, setCellRef] = useState<HTMLElement | null>(null);

    if (name !== undefined && columnVisibility[name] === false) return null;

    return (
        <td
            ref={href ? setCellRef : undefined}
            {...rest}
            className={clsx(
                className,
                "relative px-4 first:pl-[var(--gutter,theme(spacing.2))] last:pr-[var(--gutter,theme(spacing.2))]",
                !striped && "border-b border-zinc-950/5 dark:border-white/5",
                grid && "border-l border-l-zinc-950/5 first:border-l-0 dark:border-l-white/5",
                dense ? "py-2.5" : "py-4",
                !bleed && "sm:first:pl-1 sm:last:pr-1",
            )}
        >
            {href && (
                <Link
                    data-row-link
                    href={href}
                    params={params}
                    search={search}
                    target={target}
                    aria-label={title}
                    tabIndex={cellRef?.previousElementSibling === null ? 0 : -1}
                    className="absolute inset-0 focus:outline-none"
                >
                    {undefined}
                </Link>
            )}
            {children}
        </td>
    );
}
