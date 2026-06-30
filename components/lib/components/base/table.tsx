"use client";

import { clsx } from "clsx";
import type React from "react";
import { createContext, useContext, useState } from "react";
import { Link, LinkProps } from "./link";

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
};

const TableContext = createContext<TableContextType>({
    bleed: false,
    dense: false,
    grid: false,
    striped: false,
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
    const { bleed = false, dense = false, grid = false, striped = false, className, children, ...rest } = props;
    return (
        <TableContext.Provider value={{ bleed, dense, grid, striped } as React.ContextType<typeof TableContext>}>
            <div className="flow-root">
                <div {...rest} className={clsx(className, "-mx-(--gutter) overflow-x-auto whitespace-nowrap")}>
                    <div className={clsx("inline-block min-w-full align-middle", !bleed && "sm:px-(--gutter)")}>
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
    return <thead {...rest} className={clsx(className, "text-zinc-500 dark:text-zinc-400")} />;
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
export function TableHeader(props: React.ComponentPropsWithoutRef<"th">) {
    const { className, ...rest } = props;
    const { bleed, grid } = useContext(TableContext);

    return (
        <th
            {...rest}
            className={clsx(
                className,
                "border-b border-b-zinc-950/10 px-4 py-2 font-medium first:pl-[var(--gutter,theme(spacing.2))] last:pr-[var(--gutter,theme(spacing.2))] dark:border-b-white/10",
                grid && "border-l border-l-zinc-950/5 first:border-l-0 dark:border-l-white/5",
                !bleed && "sm:first:pl-1 sm:last:pr-1",
            )}
        />
    );
}

/**
 * A data cell within a {@link TableRow}
 */
export function TableCell(props: React.ComponentPropsWithoutRef<"td">) {
    const { className, children, ...rest } = props;
    const { bleed, dense, grid, striped } = useContext(TableContext);
    const { href, search, params, target, title } = useContext(TableRowContext);
    const [cellRef, setCellRef] = useState<HTMLElement | null>(null);

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
