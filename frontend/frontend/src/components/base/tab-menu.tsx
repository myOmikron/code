import React from "react";
import { Link, LinkProps } from "src/components/base/link";
import { motion } from "framer-motion";
import { TouchTarget } from "src/components/base/button";
import clsx from "clsx";

/**
 * The properties for {@link TabMenu}
 */
export type TabLayoutProps = {
    /** The children to render */
    children: React.ReactNode;
};

/**
 * Tabs
 */
export function TabMenu(props: TabLayoutProps) {
    return <nav className={"flex gap-6 border-b border-zinc-300 pb-1.5 dark:border-zinc-700"}>{props.children}</nav>;
}

/**
 * The properties for {@link Tab}
 */
export type TabProps = LinkProps;

/**
 * A Tab
 */
export function Tab(props: TabProps) {
    const { children, ...other } = props;

    const classes = clsx(
        // Base
        "flex flex-col w-fit items-center gap-3 rounded-lg text-left text-base/6 font-medium text-zinc-950 sm:text-sm/5",
        // Hover
        "data-[slot=icon]:*:data-[hover]:fill-zinc-950",
        // Current
        "data-[slot=icon]:*:data-[current]:fill-zinc-950",
        // Dark mode
        "dark:text-white dark:data-[slot=icon]:*:fill-zinc-400",
        "dark:data-[slot=icon]:*:data-[hover]:fill-white",
        "dark:data-[slot=icon]:*:data-[current]:fill-white",
    );

    return (
        <Link
            {...other}
            className={classes}
            render={({ isActive }) => {
                return (
                    <>
                        <span className={"flex gap-3"}>{children}</span>
                        {isActive && (
                            <motion.span
                                layoutId={"current-indicator-tabs"}
                                className={"relative -bottom-1.5 h-0.5 w-full rounded-full bg-zinc-950 dark:bg-white"}
                            />
                        )}
                    </>
                );
            }}
        />
    );
}

/**
 * The properties for {@link LocalTabProps}
 */
export type LocalTabProps = {
    /** Children of the local tab */
    children: React.ReactNode;
    /** Whether the tab should be displayed as active */
    active: boolean;
    /** Callback to execute when the tab was clicked */
    onClick: () => void;
};

/**
 * A Tab
 */
export function LocalTab(props: LocalTabProps) {
    const { children, active, onClick } = props;

    const classes = clsx(
        // Base
        "flex flex-col w-fit items-center gap-2 rounded-lg text-left text-base/6 font-medium text-zinc-950 sm:text-sm/5 cursor-pointer",
        // Hover
        "data-[slot=icon]:*:hover:fill-zinc-950",
        // Current
        "data-[slot=icon]:*:data-[current]:fill-zinc-950",
        // Dark mode
        "dark:text-white dark:data-[slot=icon]:*:fill-zinc-400",
        "dark:data-[slot=icon]:*:hover:fill-white",
        "dark:data-[slot=icon]:*:data-[current]:fill-white",
    );

    return (
        <li data-current={active} className={classes} onClick={onClick}>
            <span className={"flex gap-3"}>
                <TouchTarget>{children}</TouchTarget>
            </span>
            {active && (
                <motion.span
                    layoutId={"current-indicator"}
                    className={"relative -bottom-1.5 h-0.5 w-full rounded-full bg-zinc-950 dark:bg-white"}
                />
            )}
        </li>
    );
}
