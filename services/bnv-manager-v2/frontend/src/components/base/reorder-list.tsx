import { Reorder } from "framer-motion";
import React from "react";
import { clsx } from "clsx";

/**
 * The properties for {@link ReorderList}
 */
export type ReorderListProps<T> = {
    /** The axis where to reorder */
    axis: "x" | "y";

    /** The values that should be rendered */
    values: Array<T>;
    /**
     * The callback to execute when the data have been reordered
     *
     * @param data The reordered list
     */
    onReorder: (data: Array<T>) => void;

    /** The children of this list */
    children?: React.ReactNode;

    /** Additional CSS class names */
    className?: string;
};

/**
 * A list that can be reordered
 */
export function ReorderList<T>(props: ReorderListProps<T>) {
    const { axis, onReorder, values, children, className } = props;

    return (
        <Reorder.Group
            layoutScroll={true}
            axis={axis}
            onReorder={onReorder}
            values={values}
            className={clsx("flex flex-col gap-2", className)}
        >
            {children}
        </Reorder.Group>
    );
}

/**
 * The properties for {@link ReorderItem}
 */
export type ReorderItemProps<T> = {
    /** The key of the component */
    key: string;
    /** The current value */
    value: T;
    /** The children of this component */
    children?: React.ReactNode;
    /** Additional classnames */
    className?: string;
    /** Callback when item is just tapped instead of dragged */
    onClick?: (event: MouseEvent | TouchEvent | PointerEvent) => void;
    /** Callback when the drag event is finished */
    onDragEnd?: () => void;
    /** Callback when the animation is finished */
    onAnimationComplete?: () => void;
};

/**
 * The item that should be reordered
 */
export function ReorderItem<T>(props: ReorderItemProps<T>) {
    const [isDragged, setDragged] = React.useState(false);

    return (
        <Reorder.Item
            value={props.value}
            onDragStart={() => setDragged(true)}
            onDragEnd={() => {
                setDragged(false);
                props.onDragEnd && props.onDragEnd();
            }}
            onTap={(e: MouseEvent | TouchEvent | PointerEvent) => {
                if (!isDragged && props.onClick) props.onClick(e);
            }}
            animate={{ scale: isDragged ? 1.05 : 1 }}
            onAnimationComplete={props.onAnimationComplete}
            className={clsx(
                // Base
                "flex rounded-lg border-2 p-3 transition-colors duration-100",
                // Color
                "border-zinc-100 bg-zinc-50 text-zinc-700 shadow",
                // Dark
                "dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200",
                // Hover
                "hover:border-blue-600",
                props.className,
            )}
        >
            {props.children}
        </Reorder.Item>
    );
}
