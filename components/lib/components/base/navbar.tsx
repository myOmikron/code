"use client";

import * as Headless from "@headlessui/react";
import clsx from "clsx";
import { LayoutGroup, motion } from "motion/react";
import React, { forwardRef, useId } from "react";
import { TouchTarget } from "./button";
import { Link, LinkProps } from "./link";

/**
 * A horizontal navigation bar.
 *
 * @example
 * ```tsx
 * <Navbar>
 *   <NavbarSection>
 *     <NavbarItem href="/" current>Home</NavbarItem>
 *     <NavbarItem href="/events">Events</NavbarItem>
 *   </NavbarSection>
 *   <NavbarSpacer />
 *   <NavbarSection>
 *     <NavbarItem href="/profile">Profile</NavbarItem>
 *   </NavbarSection>
 * </Navbar>
 * ```
 *
 * @see https://catalyst.tailwindui.com/docs/navbar
 */
export function Navbar(props: React.ComponentPropsWithoutRef<"nav">) {
    const { className, ...rest } = props;
    return <nav {...rest} className={clsx(className, "flex flex-1 items-center gap-4 py-2.5")} />;
}

/**
 * A vertical divider within a {@link Navbar}
 */
export function NavbarDivider(props: React.ComponentPropsWithoutRef<"div">) {
    const { className, ...rest } = props;
    return <div aria-hidden="true" {...rest} className={clsx(className, "h-6 w-px bg-zinc-950/10 dark:bg-white/10")} />;
}

/**
 * A group of items within a {@link Navbar}
 */
export function NavbarSection(props: React.ComponentPropsWithoutRef<"div">) {
    const { className, ...rest } = props;
    const id = useId();

    return (
        <LayoutGroup id={id}>
            <div {...rest} className={clsx(className, "flex items-center gap-3")} />
        </LayoutGroup>
    );
}

/**
 * A flexible spacer within a {@link Navbar}
 */
export function NavbarSpacer(props: React.ComponentPropsWithoutRef<"div">) {
    const { className, ...rest } = props;
    return <div aria-hidden="true" {...rest} className={clsx(className, "-ml-4 flex-1")} />;
}

/**
 * The properties for {@link NavbarItem}
 */
export type NavbarItemProps = {
    /** Whether this item represents the current page */
    current?: boolean;
    /** Additional CSS classes */
    className?: string;
    /** The item content */
    children: React.ReactNode;
} & (Omit<Headless.ButtonProps, "className"> | Omit<LinkProps, "className" | "render">);

/**
 * A navigation item within a {@link NavbarSection}
 *
 * @param props - The component props
 * @param ref - The forwarded ref
 * @returns The rendered navbar item
 * @see https://catalyst.tailwindui.com/docs/navbar
 */
export const NavbarItem = forwardRef(function NavbarItem(
    props: NavbarItemProps,
    ref: React.ForwardedRef<HTMLButtonElement>,
) {
    const { current, className, children, ...rest } = props;
    const classes = clsx(
        // Base
        "relative flex min-w-0 items-center gap-3 rounded-lg p-2 text-left text-base/6 font-medium text-zinc-950 sm:text-sm/5",
        // Leading icon/icon-only
        "*:data-[slot=icon]:size-6 *:data-[slot=icon]:shrink-0 *:data-[slot=icon]:fill-zinc-500 sm:*:data-[slot=icon]:size-5",
        // Trailing icon (down chevron or similar)
        "*:not-nth-2:last:data-[slot=icon]:ml-auto *:not-nth-2:last:data-[slot=icon]:size-5 sm:*:not-nth-2:last:data-[slot=icon]:size-4",
        // Avatar
        "*:data-[slot=avatar]:-m-0.5 *:data-[slot=avatar]:size-7 *:data-[slot=avatar]:[--avatar-radius:var(--radius-md)] sm:*:data-[slot=avatar]:size-6",
        // Hover
        "data-hover:bg-zinc-950/5 data-hover:*:data-[slot=icon]:fill-zinc-950",
        // Active
        "data-active:bg-zinc-950/5 data-active:*:data-[slot=icon]:fill-zinc-950",
        // Dark mode
        "dark:text-white dark:*:data-[slot=icon]:fill-zinc-400",
        "dark:data-hover:bg-white/5 dark:data-hover:*:data-[slot=icon]:fill-white",
        "dark:data-active:bg-white/5 dark:data-active:*:data-[slot=icon]:fill-white",
    );

    return (
        <span className={clsx(className, "relative")}>
            {current && (
                <motion.span
                    layoutId="current-indicator"
                    className="absolute inset-x-2 -bottom-2.5 h-0.5 rounded-full bg-zinc-950 dark:bg-white"
                />
            )}
            {"href" in rest ? (
                <Link
                    {...rest}
                    className={classes}
                    data-current={current ? "true" : undefined}
                    ref={ref as React.ForwardedRef<HTMLAnchorElement>}
                >
                    <TouchTarget>{children}</TouchTarget>
                </Link>
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
 * The text label of a {@link NavbarItem}
 */
export function NavbarLabel(props: React.ComponentPropsWithoutRef<"span">) {
    const { className, ...rest } = props;
    return <span {...rest} className={clsx(className, "truncate")} />;
}
