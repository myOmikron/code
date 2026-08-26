"use client";

import * as Headless from "@headlessui/react";
import clsx from "clsx";
import React, { useState } from "react";
import { NavbarItem } from "./navbar";

/**
 * Hamburger menu icon
 *
 * @returns The menu icon SVG
 */
function OpenMenuIcon() {
    return (
        <svg data-slot="icon" viewBox="0 0 20 20" aria-hidden="true">
            <path d="M2 6.75C2 6.33579 2.33579 6 2.75 6H17.25C17.6642 6 18 6.33579 18 6.75C18 7.16421 17.6642 7.5 17.25 7.5H2.75C2.33579 7.5 2 7.16421 2 6.75ZM2 13.25C2 12.8358 2.33579 12.5 2.75 12.5H17.25C17.6642 12.5 18 12.8358 18 13.25C18 13.6642 17.6642 14 17.25 14H2.75C2.33579 14 2 13.6642 2 13.25Z" />
        </svg>
    );
}

/**
 * Close icon for the mobile sidebar
 *
 * @returns The close icon SVG
 */
function CloseMenuIcon() {
    return (
        <svg data-slot="icon" viewBox="0 0 20 20" aria-hidden="true">
            <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
        </svg>
    );
}

/**
 * The width from which the navbar carries the navigation itself and the
 * hamburger plus its slide-out disappear.
 */
export type NavCollapseBreakpoint = "sm" | "md" | "lg";

/**
 * Static class per breakpoint — tailwind cannot see interpolated class names.
 */
const HIDE_FROM: Record<NavCollapseBreakpoint, string> = {
    sm: "sm:hidden",
    md: "md:hidden",
    lg: "lg:hidden",
};

/**
 * The properties for {@link MobileSidebar}
 */
type MobileSidebarProps = React.PropsWithChildren<{
    /** Whether the sidebar is open */
    open: boolean;
    /** Callback to close the sidebar */
    close: () => void;
    /** The class hiding the slide-out once the navbar takes over */
    hideFrom: string;
}>;

/**
 * A mobile slide-out sidebar dialog
 */
function MobileSidebar(props: MobileSidebarProps) {
    const { open, close, hideFrom, children } = props;
    return (
        <Headless.Dialog open={open} onClose={close} className={hideFrom}>
            <Headless.DialogBackdrop
                transition
                className="fixed inset-0 bg-black/30 transition data-closed:opacity-0 data-enter:duration-300 data-enter:ease-out data-leave:duration-200 data-leave:ease-in"
            />
            <Headless.DialogPanel
                transition
                className="fixed inset-y-0 w-full max-w-80 p-2 transition duration-300 ease-in-out data-closed:-translate-x-full"
            >
                <div className="flex h-full flex-col rounded-lg bg-white shadow-xs ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
                    <div className="-mb-3 px-4 pt-3">
                        <Headless.CloseButton as={NavbarItem} aria-label="Close navigation">
                            <CloseMenuIcon />
                        </Headless.CloseButton>
                    </div>
                    {children}
                </div>
            </Headless.DialogPanel>
        </Headless.Dialog>
    );
}

/**
 * How wide the content may grow once the screen has the room.
 *
 * `default` is a reading width and suits pages that are mostly text and forms.
 * `wide` is for apps whose pages are tables, grids and side-by-side tools,
 * where a third of an ultrawide screen of content and two thirds of background
 * is the wrong trade. `full` gives up the limit entirely.
 */
export type ContentWidth = "default" | "wide" | "full";

/**
 * Static class per width — tailwind cannot see interpolated class names.
 */
const CONTENT_WIDTH: Record<ContentWidth, string> = {
    default: "max-w-6xl",
    wide: "max-w-[110rem]",
    full: "max-w-none",
};

/**
 * The properties for {@link StackedLayout}
 */
export type StackedLayoutProps = React.PropsWithChildren<{
    /** The navbar content */
    navbar: React.ReactNode;
    /** The sidebar content shown on mobile */
    sidebar: React.ReactNode;
    /** How wide the content may grow. Defaults to a reading width. */
    contentWidth?: ContentWidth;
    /**
     * Width from which the navbar replaces the hamburger and its slide-out.
     *
     * Lower it when the navbar can compact itself (icon-only items) and should
     * stay visible in half-screen or installed-pwa windows. Defaults to `lg`.
     */
    navCollapseBelow?: NavCollapseBreakpoint;
    /**
     * Whether the navbar and the content's own framing are dropped, leaving
     * the page the whole window.
     *
     * For a page that has taken over the screen — a fullscreened table
     * counter — where every strip of chrome is a strip the players lose.
     */
    bare?: boolean;
}>;

/**
 * A layout with a top navbar and mobile slide-out sidebar.
 *
 * @example
 * ```tsx
 * <StackedLayout navbar={<Navbar />} sidebar={<Sidebar />}>
 *   <main>Page content</main>
 * </StackedLayout>
 * ```
 *
 * @see https://catalyst.tailwindui.com/docs/stacked-layout
 */
export function StackedLayout(props: StackedLayoutProps) {
    const { navbar, sidebar, navCollapseBelow = "lg", contentWidth = "default", bare = false, children } = props;
    const [showSidebar, setShowSidebar] = useState(false);
    const hideFrom = HIDE_FROM[navCollapseBelow];

    return (
        <div className="relative isolate flex min-h-svh w-full flex-col bg-white lg:bg-zinc-100 dark:bg-zinc-900 dark:lg:bg-zinc-950">
            {/* Sidebar on mobile */}
            <MobileSidebar open={showSidebar} close={() => setShowSidebar(false)} hideFrom={hideFrom}>
                {sidebar}
            </MobileSidebar>

            {/* Navbar */}
            {!bare && (
                <header className="flex items-center px-4">
                    <div className={clsx("py-2.5", hideFrom)}>
                        <NavbarItem onClick={() => setShowSidebar(true)} aria-label="Open navigation">
                            <OpenMenuIcon />
                        </NavbarItem>
                    </div>
                    <div className="min-w-0 flex-1">{navbar}</div>
                </header>
            )}

            {/* Content */}
            <main className={clsx("flex flex-1 flex-col", !bare && "pb-2 lg:px-2")}>
                <div
                    className={clsx(
                        "grow",
                        bare
                            ? "bg-white dark:bg-zinc-900"
                            : "p-6 lg:rounded-lg lg:bg-white lg:p-10 lg:shadow-xs lg:ring-1 lg:ring-zinc-950/5 dark:lg:bg-zinc-900 dark:lg:ring-white/10",
                    )}
                >
                    <div className={clsx("mx-auto", CONTENT_WIDTH[contentWidth])}>{children}</div>
                </div>
            </main>
        </div>
    );
}
