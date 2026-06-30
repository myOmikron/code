"use client";

import * as Headless from "@headlessui/react";
import clsx from "clsx";
import { LayoutGroup, motion } from "motion/react";
import React, { forwardRef, useId } from "react";
import { TouchTarget } from "./button";
import { Link } from "./link";

/**
 * A vertical navigation sidebar.
 *
 * @example
 * ```tsx
 * <Sidebar>
 *   <SidebarHeader>
 *     <SidebarSection>
 *       <SidebarItem href="/">Home</SidebarItem>
 *     </SidebarSection>
 *   </SidebarHeader>
 *   <SidebarBody>
 *     <SidebarSection>
 *       <SidebarItem href="/events">Events</SidebarItem>
 *       <SidebarItem href="/orders">Orders</SidebarItem>
 *     </SidebarSection>
 *   </SidebarBody>
 * </Sidebar>
 * ```
 *
 * @see https://catalyst.tailwindui.com/docs/sidebar
 */
export function Sidebar(props: React.ComponentPropsWithoutRef<"nav">) {
    const { className, ...rest } = props;
    return <nav {...rest} className={clsx(className, "flex h-full min-h-0 flex-col")} />;
}

/**
 * The header area of a {@link Sidebar}
 */
export function SidebarHeader(props: React.ComponentPropsWithoutRef<"div">) {
    const { className, ...rest } = props;
    return (
        <div
            {...rest}
            className={clsx(
                className,
                "flex flex-col border-b border-zinc-950/5 p-4 dark:border-white/5 [&>[data-slot=section]+[data-slot=section]]:mt-2.5",
            )}
        />
    );
}

/**
 * The scrollable body of a {@link Sidebar}
 */
export function SidebarBody(props: React.ComponentPropsWithoutRef<"div">) {
    const { className, ...rest } = props;
    return (
        <div
            {...rest}
            className={clsx(
                className,
                "flex flex-1 flex-col overflow-y-auto p-4 [&>[data-slot=section]+[data-slot=section]]:mt-8",
            )}
        />
    );
}

/**
 * The footer area of a {@link Sidebar}
 */
export function SidebarFooter(props: React.ComponentPropsWithoutRef<"div">) {
    const { className, ...rest } = props;
    return (
        <div
            {...rest}
            className={clsx(
                className,
                "flex flex-col border-t border-zinc-950/5 p-4 dark:border-white/5 [&>[data-slot=section]+[data-slot=section]]:mt-2.5",
            )}
        />
    );
}

/**
 * A group of items within a {@link Sidebar}
 */
export function SidebarSection(props: React.ComponentPropsWithoutRef<"div">) {
    const { className, ...rest } = props;
    const id = useId();

    return (
        <LayoutGroup id={id}>
            <div {...rest} data-slot="section" className={clsx(className, "flex flex-col gap-0.5")} />
        </LayoutGroup>
    );
}

/**
 * A visual separator within a {@link Sidebar}
 */
export function SidebarDivider(props: React.ComponentPropsWithoutRef<"hr">) {
    const { className, ...rest } = props;
    return <hr {...rest} className={clsx(className, "my-4 border-t border-zinc-950/5 lg:-mx-4 dark:border-white/5")} />;
}

/**
 * A flexible spacer within a {@link Sidebar}
 */
export function SidebarSpacer(props: React.ComponentPropsWithoutRef<"div">) {
    const { className, ...rest } = props;
    return <div aria-hidden="true" {...rest} className={clsx(className, "mt-8 flex-1")} />;
}

/**
 * A section heading within a {@link SidebarBody}
 */
export function SidebarHeading(props: React.ComponentPropsWithoutRef<"h3">) {
    const { className, ...rest } = props;
    return (
        <h3 {...rest} className={clsx(className, "mb-1 px-2 text-xs/6 font-medium text-zinc-500 dark:text-zinc-400")} />
    );
}

/**
 * The properties for {@link SidebarItem}
 */
export type SidebarItemProps = {
    /** Whether this item represents the current page */
    current?: boolean;
    /** Additional CSS classes */
    className?: string;
    /** The item content */
    children: React.ReactNode;
} & (Omit<Headless.ButtonProps, "as" | "className"> | Omit<Headless.ButtonProps<typeof Link>, "as" | "className">);

/**
 * A navigation item within a {@link SidebarSection}
 *
 * @param props - The component props
 * @param ref - The forwarded ref
 * @returns The rendered sidebar item
 * @see https://catalyst.tailwindui.com/docs/sidebar
 */
export const SidebarItem = forwardRef(function SidebarItem(
    props: SidebarItemProps,
    ref: React.ForwardedRef<HTMLAnchorElement | HTMLButtonElement>,
) {
    const { current, className, children, ...rest } = props;
    const classes = clsx(
        // Base
        "flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left text-base/6 font-medium text-zinc-950 sm:py-2 sm:text-sm/5",
        // Leading icon/icon-only
        "*:data-[slot=icon]:size-6 *:data-[slot=icon]:shrink-0 *:data-[slot=icon]:fill-zinc-500 sm:*:data-[slot=icon]:size-5",
        // Trailing icon (down chevron or similar)
        "*:last:data-[slot=icon]:ml-auto *:last:data-[slot=icon]:size-5 sm:*:last:data-[slot=icon]:size-4",
        // Avatar
        "*:data-[slot=avatar]:-m-0.5 *:data-[slot=avatar]:size-7 sm:*:data-[slot=avatar]:size-6",
        // Hover
        "data-hover:bg-zinc-950/5 data-hover:*:data-[slot=icon]:fill-zinc-950",
        // Active
        "data-active:bg-zinc-950/5 data-active:*:data-[slot=icon]:fill-zinc-950",
        // Current
        "data-current:*:data-[slot=icon]:fill-zinc-950",
        // Dark mode
        "dark:text-white dark:*:data-[slot=icon]:fill-zinc-400",
        "dark:data-hover:bg-white/5 dark:data-hover:*:data-[slot=icon]:fill-white",
        "dark:data-active:bg-white/5 dark:data-active:*:data-[slot=icon]:fill-white",
        "dark:data-current:*:data-[slot=icon]:fill-white",
    );

    return (
        <span className={clsx(className, "relative")}>
            {"href" in rest ? (
                <Headless.CloseButton
                    as={Link}
                    {...rest}
                    className={classes}
                    data-current={current ? "true" : undefined}
                    ref={ref}
                    render={({ isActive }: { /** Whether the link matches the current route */ isActive: boolean }) => {
                        return (
                            <>
                                {isActive && (
                                    <motion.span
                                        layoutId="current-indicator-menu"
                                        className="absolute inset-y-2 -left-4 w-0.5 rounded-full bg-zinc-950 dark:bg-white"
                                    />
                                )}
                                <TouchTarget>{children}</TouchTarget>
                            </>
                        );
                    }}
                />
            ) : (
                <Headless.Button
                    {...rest}
                    className={clsx("cursor-default", classes)}
                    data-current={current ? "true" : undefined}
                    ref={ref}
                >
                    <TouchTarget>{children}</TouchTarget>
                </Headless.Button>
            )}
        </span>
    );
});

/**
 * The text label of a {@link SidebarItem}
 */
export function SidebarLabel(props: React.ComponentPropsWithoutRef<"span">) {
    const { className, ...rest } = props;
    return <span {...rest} className={clsx(className, "truncate")} />;
}
