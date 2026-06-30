"use client";

import * as Headless from "@headlessui/react";
import clsx from "clsx";
import type React from "react";
import { Button } from "./button";
import { Link } from "./link";

/**
 * A dropdown menu triggered by a button.
 *
 * @example
 * ```tsx
 * <Dropdown>
 *   <DropdownButton outline>
 *     Options
 *     <ChevronDownIcon />
 *   </DropdownButton>
 *   <DropdownMenu>
 *     <DropdownItem href="/view">View</DropdownItem>
 *     <DropdownItem href="/edit">Edit</DropdownItem>
 *     <DropdownItem onClick={handleDelete}>Delete</DropdownItem>
 *   </DropdownMenu>
 * </Dropdown>
 * ```
 *
 * @see https://catalyst.tailwindui.com/docs/dropdown
 */
export function Dropdown(props: Headless.MenuProps) {
    return <Headless.Menu {...props} />;
}

/**
 * The properties for {@link DropdownButton}
 */
export type DropdownButtonProps<T extends React.ElementType = typeof Button> = {
    /** Additional CSS classes */
    className?: string;
} & Omit<Headless.MenuButtonProps<T>, "className">;

/**
 * The trigger button for a {@link Dropdown}. Accepts all {@link Button} styling props.
 *
 * @see https://catalyst.tailwindui.com/docs/dropdown
 */
export function DropdownButton<T extends React.ElementType = typeof Button>(props: DropdownButtonProps<T>) {
    const { as = Button, ...rest } = props as DropdownButtonProps<typeof Button>;
    return <Headless.MenuButton as={as} {...rest} />;
}

/**
 * The properties for {@link DropdownMenu}
 */
export type DropdownMenuProps = {
    /** Additional CSS classes */
    className?: string;
} & Omit<Headless.MenuItemsProps, "as" | "className">;

/**
 * The popover menu panel of a {@link Dropdown}
 *
 * @see https://catalyst.tailwindui.com/docs/dropdown
 */
export function DropdownMenu(props: DropdownMenuProps) {
    const { anchor = "bottom", className, ...rest } = props;
    return (
        <Headless.MenuItems
            {...rest}
            transition
            anchor={anchor}
            className={clsx(
                className,
                // Anchor positioning
                "[--anchor-gap:--spacing(2)] [--anchor-padding:--spacing(1)] data-[anchor~=end]:[--anchor-offset:6px] data-[anchor~=start]:[--anchor-offset:-6px] sm:data-[anchor~=end]:[--anchor-offset:4px] sm:data-[anchor~=start]:[--anchor-offset:-4px]",
                // Base styles
                "isolate w-max rounded-xl p-1",
                // Invisible border that is only visible in `forced-colors` mode for accessibility purposes
                "outline outline-transparent focus:outline-hidden",
                // Handle scrolling when menu won't fit in viewport
                "overflow-y-auto",
                // Popover background
                "bg-white/75 backdrop-blur-xl dark:bg-zinc-800/75",
                // Shadows
                "shadow-lg ring-1 ring-zinc-950/10 dark:ring-white/10 dark:ring-inset",
                // Define grid at the menu level if subgrid is supported
                "supports-[grid-template-columns:subgrid]:grid supports-[grid-template-columns:subgrid]:grid-cols-[auto_1fr_1.5rem_0.5rem_auto]",
                // Transitions
                "transition data-leave:duration-100 data-leave:ease-in data-closed:data-leave:opacity-0",
            )}
        />
    );
}

/**
 * The properties for {@link DropdownItem}
 */
export type DropdownItemProps = {
    /** Additional CSS classes */
    className?: string;
} & (
    | Omit<Headless.MenuItemProps<"button">, "as" | "className">
    | Omit<Headless.MenuItemProps<typeof Link>, "as" | "className">
);

/**
 * A menu item within a {@link DropdownMenu}.
 *
 * @see https://catalyst.tailwindui.com/docs/dropdown
 */
export function DropdownItem(props: DropdownItemProps) {
    const { className, ...rest } = props;
    const classes = clsx(
        className,
        // Base styles
        "group cursor-default rounded-lg px-3.5 py-2.5 focus:outline-hidden sm:px-3 sm:py-1.5",
        // Text styles
        "text-left text-base/6 text-zinc-950 sm:text-sm/6 dark:text-white forced-colors:text-[CanvasText]",
        // Focus
        "data-focus:bg-blue-500 data-focus:text-white",
        // Disabled state
        "data-disabled:opacity-50",
        // Forced colors mode
        "forced-color-adjust-none forced-colors:data-focus:bg-[Highlight] forced-colors:data-focus:text-[HighlightText] forced-colors:data-focus:*:data-[slot=icon]:text-[HighlightText]",
        // Use subgrid when available but fallback to an explicit grid layout if not
        "col-span-full grid grid-cols-[auto_1fr_1.5rem_0.5rem_auto] items-center supports-[grid-template-columns:subgrid]:grid-cols-subgrid",
        // Icons
        "*:data-[slot=icon]:col-start-1 *:data-[slot=icon]:row-start-1 *:data-[slot=icon]:mr-2.5 *:data-[slot=icon]:-ml-0.5 *:data-[slot=icon]:size-5 sm:*:data-[slot=icon]:mr-2 sm:*:data-[slot=icon]:size-4",
        "*:data-[slot=icon]:text-zinc-500 data-focus:*:data-[slot=icon]:text-white dark:*:data-[slot=icon]:text-zinc-400 dark:data-focus:*:data-[slot=icon]:text-white",
        // Avatar
        "*:data-[slot=avatar]:mr-2.5 *:data-[slot=avatar]:-ml-1 *:data-[slot=avatar]:size-6 sm:*:data-[slot=avatar]:mr-2 sm:*:data-[slot=avatar]:size-5",
    );

    return "href" in rest ? (
        <Headless.MenuItem as={Link} {...rest} className={classes} />
    ) : (
        <Headless.MenuItem as="button" type="button" {...rest} className={classes} />
    );
}

/**
 * A non-interactive header area within a {@link DropdownMenu}.
 */
export function DropdownHeader(props: React.ComponentPropsWithoutRef<"div">) {
    const { className, ...rest } = props;
    return <div {...rest} className={clsx(className, "col-span-5 px-3.5 pt-2.5 pb-1 sm:px-3")} />;
}

/**
 * The properties for {@link DropdownSection}
 */
export type DropdownSectionProps = {
    /** Additional CSS classes */
    className?: string;
} & Omit<Headless.MenuSectionProps, "as" | "className">;

/**
 * A grouped section within a {@link DropdownMenu}.
 */
export function DropdownSection(props: DropdownSectionProps) {
    const { className, ...rest } = props;
    return (
        <Headless.MenuSection
            {...rest}
            className={clsx(
                className,
                // Define grid at the section level instead of the item level if subgrid is supported
                "col-span-full supports-[grid-template-columns:subgrid]:grid supports-[grid-template-columns:subgrid]:grid-cols-[auto_1fr_1.5rem_0.5rem_auto]",
            )}
        />
    );
}

/**
 * The properties for {@link DropdownHeading}
 */
export type DropdownHeadingProps = {
    /** Additional CSS classes */
    className?: string;
} & Omit<Headless.MenuHeadingProps, "as" | "className">;

/**
 * A heading for a {@link DropdownSection}.
 */
export function DropdownHeading(props: DropdownHeadingProps) {
    const { className, ...rest } = props;
    return (
        <Headless.MenuHeading
            {...rest}
            className={clsx(
                className,
                "col-span-full grid grid-cols-[1fr_auto] gap-x-12 px-3.5 pt-2 pb-1 text-sm/5 font-medium text-zinc-500 sm:px-3 sm:text-xs/5 dark:text-zinc-400",
            )}
        />
    );
}

/**
 * The properties for {@link DropdownDivider}
 */
export type DropdownDividerProps = {
    /** Additional CSS classes */
    className?: string;
} & Omit<Headless.MenuSeparatorProps, "as" | "className">;

/**
 * A visual separator within a {@link DropdownMenu}.
 */
export function DropdownDivider(props: DropdownDividerProps) {
    const { className, ...rest } = props;
    return (
        <Headless.MenuSeparator
            {...rest}
            className={clsx(
                className,
                "col-span-full mx-3.5 my-1 h-px border-0 bg-zinc-950/5 sm:mx-3 dark:bg-white/10 forced-colors:bg-[CanvasText]",
            )}
        />
    );
}

/**
 * The properties for {@link DropdownLabel}
 */
export type DropdownLabelProps = {
    /** Additional CSS classes */
    className?: string;
} & Omit<Headless.LabelProps, "as" | "className">;

/**
 * The text label of a {@link DropdownItem}.
 */
export function DropdownLabel(props: DropdownLabelProps) {
    const { className, ...rest } = props;
    return <Headless.Label {...rest} data-slot="label" className={clsx(className, "col-start-2 row-start-1")} />;
}

/**
 * The properties for {@link DropdownDescription}
 */
export type DropdownDescriptionProps = {
    /** Additional CSS classes */
    className?: string;
} & Omit<Headless.DescriptionProps, "as" | "className">;

/**
 * A secondary description for a {@link DropdownItem}.
 */
export function DropdownDescription(props: DropdownDescriptionProps) {
    const { className, ...rest } = props;
    return (
        <Headless.Description
            data-slot="description"
            {...rest}
            className={clsx(
                className,
                "col-span-2 col-start-2 row-start-2 text-sm/5 text-zinc-500 group-data-focus:text-white sm:text-xs/5 dark:text-zinc-400 forced-colors:group-data-focus:text-[HighlightText]",
            )}
        />
    );
}

/**
 * The properties for {@link DropdownShortcut}
 */
export type DropdownShortcutProps = {
    /** The keyboard shortcut keys */
    keys: string | string[];
    /** Additional CSS classes */
    className?: string;
} & Omit<Headless.DescriptionProps<"kbd">, "as" | "className">;

/**
 * A keyboard shortcut indicator for a {@link DropdownItem}.
 */
export function DropdownShortcut(props: DropdownShortcutProps) {
    const { keys, className, ...rest } = props;
    return (
        <Headless.Description
            as="kbd"
            {...rest}
            className={clsx(className, "col-start-5 row-start-1 flex justify-self-end")}
        >
            {(Array.isArray(keys) ? keys : keys.split("")).map((char, index) => (
                <kbd
                    key={index}
                    className={clsx([
                        "min-w-[2ch] text-center font-sans text-zinc-400 capitalize group-data-focus:text-white forced-colors:group-data-focus:text-[HighlightText]",
                        // Make sure key names that are longer than one character (like "Tab") have extra space
                        index > 0 && char.length > 1 && "pl-1",
                    ])}
                >
                    {char}
                </kbd>
            ))}
        </Headless.Description>
    );
}
