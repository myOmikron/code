import React from "react";
import clsx from "clsx";

/** Shape variants for the {@link Skeleton} component. */
type SkeletonVariant = "text" | "circle" | "card" | "block";

/**
 * The properties for {@link Skeleton}
 */
export type SkeletonProps = {
    /** Shape variant. */
    variant?: SkeletonVariant;
    /** Width — accepts any valid CSS dimension. */
    width?: string | number;
    /** Height — accepts any valid CSS dimension. */
    height?: string | number;
    /** Additional CSS classes */
    className?: string;
};

const variantClasses: Record<SkeletonVariant, string> = {
    text: "h-4 w-full rounded",
    circle: "rounded-full",
    card: "h-24 w-full rounded-(--radius-card)",
    block: "rounded-(--radius-control)",
};

/**
 * An animated pulse placeholder used while content is loading.
 *
 * @example
 * ```tsx
 * <Skeleton variant="text" width="60%" />
 * <Skeleton variant="circle" width={40} height={40} />
 * ```
 */
export function Skeleton(props: SkeletonProps) {
    const { variant = "block", width, height, className } = props;
    const style: React.CSSProperties = {};
    if (width !== undefined) style.width = typeof width === "number" ? `${width}px` : width;
    if (height !== undefined) style.height = typeof height === "number" ? `${height}px` : height;

    return (
        <div
            aria-hidden="true"
            style={style}
            className={clsx(className, variantClasses[variant], "animate-pulse bg-zinc-200/70 dark:bg-zinc-700/40")}
        />
    );
}

/**
 * The properties for {@link TableRowSkeleton}
 */
type TableRowSkeletonProps = {
    /** Number of columns to render. */
    cols: number;
    /** Whether to use compact cell padding. */
    dense?: boolean;
};

/**
 * A skeleton placeholder shaped like a single table row. Mirrors the cell
 * padding of the `<Table>` primitive so it sits in place of a real row without
 * layout shift.
 */
export function TableRowSkeleton(props: TableRowSkeletonProps) {
    const { cols, dense = false } = props;
    return (
        <tr>
            {Array.from({ length: cols }).map((_, i) => (
                <td
                    key={i}
                    className={clsx(
                        "relative px-4 first:pl-(--gutter,--spacing(2)) last:pr-(--gutter,--spacing(2))",
                        "border-b border-zinc-950/5 dark:border-white/5",
                        dense ? "py-2.5" : "py-4",
                        "sm:first:pl-1 sm:last:pr-1",
                    )}
                >
                    <Skeleton variant="text" />
                </td>
            ))}
        </tr>
    );
}

/**
 * The properties for {@link TableBodySkeleton}
 */
type TableBodySkeletonProps = {
    /** Number of rows to render. */
    rows: number;
    /** Number of columns per row. */
    cols: number;
    /** Whether to use compact cell padding. */
    dense?: boolean;
};

/**
 * Emits N {@link TableRowSkeleton}s inside a `<tbody>`.
 */
export function TableBodySkeleton(props: TableBodySkeletonProps) {
    const { rows, cols, dense = false } = props;
    return (
        <>
            {Array.from({ length: rows }).map((_, i) => (
                <TableRowSkeleton key={i} cols={cols} dense={dense} />
            ))}
        </>
    );
}

/**
 * The properties for {@link CardSkeleton}
 */
type CardSkeletonProps = {
    /** Additional CSS classes */
    className?: string;
};

/**
 * Card-shaped skeleton matching the surface tokens used by `<Stat>` cards.
 */
export function CardSkeleton(props: CardSkeletonProps) {
    const { className } = props;
    return (
        <div
            className={clsx(
                className,
                "rounded-(--radius-card) bg-(--surface-card) p-5 ring-1 ring-zinc-950/5 dark:ring-white/10",
            )}
        >
            <div className="flex flex-col gap-3">
                <Skeleton variant="text" width="40%" />
                <Skeleton variant="text" width="60%" height={28} />
                <Skeleton variant="text" width="30%" />
            </div>
        </div>
    );
}
