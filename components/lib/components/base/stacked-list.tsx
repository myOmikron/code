import React from "react";
import clsx from "clsx";

/**
 * A vertically stacked list with dividers between items.
 *
 * @example
 * ```tsx
 * <StackedList>
 *   <StackedListFlexRow>
 *     <StackedListItem>
 *       <StackedListTitle>Item title</StackedListTitle>
 *       <StackedListDescription>Supporting text</StackedListDescription>
 *     </StackedListItem>
 *     <Button>Action</Button>
 *   </StackedListFlexRow>
 * </StackedList>
 * ```
 */
export function StackedList(props: React.ComponentPropsWithoutRef<"ul">) {
    const { className, ...rest } = props;
    return <ul role="list" className={clsx(className, "divide-y divide-gray-100 dark:divide-white/5")} {...rest} />;
}

/**
 * A list row with flex layout for two-column content (content + actions).
 */
export function StackedListFlexRow(props: React.ComponentPropsWithoutRef<"li">) {
    const { className, ...rest } = props;
    return <li className={clsx(className, "flex items-center justify-between gap-x-6 py-2")} {...rest} />;
}

/**
 * The properties for {@link StackedListGridRow}
 */
export type StackedListGridRowProps = {
    /** Tailwind `grid-cols-*` utility class applied to the row, e.g. `"grid-cols-[2fr_1fr]"`. */
    grid_cols: string;
} & React.ComponentPropsWithoutRef<"li">;

/**
 * A list row with a custom CSS grid layout.
 */
export function StackedListGridRow(props: StackedListGridRowProps) {
    const { grid_cols, className, ...rest } = props;
    return <li className={clsx(className, grid_cols, "grid items-center gap-x-6 py-2")} {...rest} />;
}

/**
 * The primary content block within a stacked list row.
 */
export function StackedListItem(props: React.ComponentPropsWithoutRef<"div">) {
    const { className, ...rest } = props;
    return <div className={clsx(className, "min-w-0")} {...rest} />;
}

/**
 * The title line of a {@link StackedListItem}.
 */
export function StackedListTitle(props: React.ComponentPropsWithoutRef<"p">) {
    const { className, ...rest } = props;
    return <p className={clsx(className, "text-sm/6 font-semibold text-gray-900 dark:text-white")} {...rest} />;
}

/**
 * The secondary description line of a {@link StackedListItem}.
 */
export function StackedListDescription(props: React.ComponentPropsWithoutRef<"p">) {
    const { className, ...rest } = props;
    return (
        <div className="mt-1 flex items-center gap-x-2">
            <p className={clsx(className, "truncate text-xs/5 text-gray-500 dark:text-gray-400")} {...rest} />
        </div>
    );
}
