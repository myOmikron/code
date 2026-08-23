import clsx from "clsx";
import type { PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/** What the menu is assumed to take until it has been measured */
const ESTIMATE = { width: 260, height: 420 };

/** Below this the menu is a sheet at the bottom edge rather than a box at a point */
const SHEET_BELOW = 640;

/** How long a finger has to rest before it counts as a right-click */
const PRESS_DELAY = 700;

/**
 * How far a finger may travel during that press before it counts as a drag
 *
 * Generous, because a finger resting on glass never holds still and the browser
 * says on its own when the gesture has become a scroll: it takes the pointer
 * away, and `pointercancel` drops the press. A tight slop only meant that the
 * list scrolled instead of the menu opening.
 */
const PRESS_SLOP = 24;

/**
 * How long a freshly opened menu ignores what would otherwise dismiss it
 *
 * The gesture that opens it is not over when it opens: the finger is still
 * down, and lifting it leaves a click, while the address bar sliding back in
 * leaves a resize and a scroll. All three arrive within a few frames of the
 * menu appearing, and all three used to close it again before it could be read.
 */
const SETTLE_DELAY = 400;

/**
 * What a right-clickable element wears.
 *
 * A long press is only readable as a menu gesture when the browser does not
 * answer it with its own text selection or link callout first.
 */
export const CONTEXT_MENU_TARGET = "select-none [-webkit-touch-callout:none]";

/** Where a menu was opened */
export type MenuAt = {
    /** Distance from the left edge of the window */
    x: number;
    /** Distance from the top edge of the window */
    y: number;
};

/** One line of a context menu */
export type ContextMenuItem = {
    /** Identifies the line in its section */
    key: string;
    /** What the line says */
    label: ReactNode;
    /** The mark in front of the label */
    icon?: ReactNode;
    /** The key that does the same thing, if there is one */
    shortcut?: string;
    /** Whether the line is destructive */
    tone?: "danger";
    /** Whether the line cannot be picked right now */
    disabled?: boolean;
    /** Whether the menu stays open after the click, for lines used in runs */
    keepOpen?: boolean;
    /** What the line does */
    onSelect: () => void;
};

/** A group of lines, under a heading where the group needs naming */
export type ContextMenuSection = {
    /** Identifies the section in the menu */
    key: string;
    /** What the group is about */
    heading?: string;
    /** The lines, empty sections are dropped */
    items: Array<ContextMenuItem>;
};

/**
 * The properties for {@link ContextMenu}
 */
export type ContextMenuProps = {
    /** What the menu belongs to, named at the top of it */
    title?: string;
    /** Where it was opened, `null` while no menu is open */
    at: MenuAt | null;
    /** What it offers, filled in by the view it belongs to */
    sections: Array<ContextMenuSection>;
    /** Called when the menu should close */
    onClose: () => void;
};

/**
 * A menu anchored to a point rather than to a button.
 *
 * The chrome only: what the lines say and do is the view's business, which is
 * what lets one implementation serve a deck's cards, a shelf of collections and every
 * list in between. It is written here rather than taken from the component
 * library because no menu there can be opened at a pointer.
 *
 * On a narrow screen it becomes a sheet at the bottom edge, where a thumb
 * reaches, instead of a box under a finger that is covering it.
 *
 * @returns the menu, or nothing while it is closed
 */
export function ContextMenu({ title, at, sections, onClose }: ContextMenuProps) {
    const panel = useRef<HTMLDivElement>(null);
    const [box, setBox] = useState(ESTIMATE);
    const opened = useRef(0);
    const filled = sections.filter((section) => section.items.length > 0);

    /** Closes the menu, unless it has only just opened */
    const dismiss = useCallback(() => {
        if (performance.now() - opened.current < SETTLE_DELAY) return;
        onClose();
    }, [onClose]);

    // Measured rather than guessed: the menu grows with what it was filled
    // with, and a guess that is too small puts the lines at the bottom of it off
    // the screen — on the rows at the bottom of a page, which is where it was
    // reached for.
    useLayoutEffect(() => {
        const element = panel.current;
        if (element === null) return;
        setBox({ width: element.offsetWidth, height: element.offsetHeight });
    }, [at, sections]);

    useEffect(() => {
        if (at !== null) opened.current = performance.now();
    }, [at]);

    useEffect(() => {
        if (at === null) return;

        /**
         * Closes the menu on escape
         *
         * @param event the keypress
         */
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClose();
        };

        // Scrolling the page moves the menu away from what it belongs to, so it
        // closes — but scrolling the menu itself is how a long one is read on a
        // phone, and that has to be left alone.
        const onScroll = (event: Event) => {
            const target = event.target;
            if (target instanceof Node && panel.current?.contains(target) === true) return;
            dismiss();
        };

        window.addEventListener("keydown", onKey);
        window.addEventListener("resize", dismiss);
        window.addEventListener("scroll", onScroll, true);
        return () => {
            window.removeEventListener("keydown", onKey);
            window.removeEventListener("resize", dismiss);
            window.removeEventListener("scroll", onScroll, true);
        };
    }, [at, dismiss, onClose]);

    if (at === null || filled.length === 0) return null;

    const sheet = window.innerWidth < SHEET_BELOW;
    const left = Math.max(8, Math.min(at.x, window.innerWidth - box.width - 8));
    const top = Math.max(8, Math.min(at.y, window.innerHeight - box.height - 8));

    return createPortal(
        <div
            className={"fixed inset-0 z-50"}
            onClick={dismiss}
            onContextMenu={(event) => {
                event.preventDefault();
                onClose();
            }}
        >
            <div
                ref={panel}
                role={"menu"}
                aria-label={title}
                style={sheet ? undefined : { left, top }}
                onClick={(event) => event.stopPropagation()}
                className={clsx(
                    "fixed flex flex-col gap-0.5 overflow-y-auto overscroll-contain rounded-xl bg-white/95 p-1 ring-1 ring-zinc-950/10 backdrop-blur-xl dark:bg-zinc-800/95 dark:ring-white/10",
                    sheet
                        ? "inset-x-0 bottom-0 max-h-[55vh] rounded-b-none pb-[max(0.5rem,env(safe-area-inset-bottom))]"
                        : "max-h-[80vh] w-64",
                )}
            >
                {title !== undefined && (
                    <p
                        className={
                            "shrink-0 truncate px-2.5 py-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400"
                        }
                    >
                        {title}
                    </p>
                )}

                {filled.map((section, index) => (
                    <div key={section.key} className={"contents"}>
                        {index > 0 && <span className={"my-1 h-px shrink-0 bg-zinc-950/5 dark:bg-white/10"} />}
                        {section.heading !== undefined && (
                            <p className={"px-2.5 py-1 text-xs font-medium text-zinc-500 dark:text-zinc-400"}>
                                {section.heading}
                            </p>
                        )}
                        {section.items.map((item) => (
                            <Line key={item.key} item={item} onClose={onClose} />
                        ))}
                    </div>
                ))}
            </div>
        </div>,
        document.body,
    );
}

/**
 * What {@link useContextMenu} hands back
 */
export type ContextMenuControl<T> = {
    /** What the menu is open on, `null` while it is closed */
    open: { item: T; at: MenuAt } | null;
    /** Opens the menu on an item, at a point */
    openAt: (item: T, at: MenuAt) => void;
    /** Closes it */
    close: () => void;
};

/**
 * Keeps one context menu for a whole view.
 *
 * The view holds the state for its whole list rather than one menu per row: a
 * menu is a single thing on screen, and a row that has to remember whether it
 * is the open one re-renders every sibling to find out.
 *
 * @returns what the menu is open on, and the two ways to change that
 */
export function useContextMenu<T>(): ContextMenuControl<T> {
    const [open, setOpen] = useState<{ item: T; at: MenuAt } | null>(null);

    const close = useCallback(() => setOpen(null), []);
    const openAt = useCallback((item: T, at: MenuAt) => setOpen({ item, at }), []);

    return { open, openAt, close };
}

/**
 * The press being held right now.
 *
 * One record for the whole app rather than one per row: a long press is a
 * gesture, only one of them happens at a time, and rows are rendered inside
 * loops where a hook cannot go.
 */
const press: { timer: number | undefined; from: MenuAt | null; opened: boolean } = {
    timer: undefined,
    from: null,
    opened: false,
};

/** Drops the press being held */
function cancelPress() {
    if (press.timer !== undefined) window.clearTimeout(press.timer);
    press.timer = undefined;
    press.from = null;
}

/**
 * The handlers that open a menu on an element: right-click, or a long press.
 *
 * Spread onto whatever the menu belongs to, together with
 * {@link CONTEXT_MENU_TARGET} so the browser leaves the press alone.
 *
 * @param onOpen opens the view's menu at the point the gesture happened
 *
 * @returns the handlers to spread onto the element
 */
export function contextMenuTrigger(onOpen: (at: MenuAt) => void) {
    return {
        /**
         * Opens the menu where the pointer is
         *
         * @param event the right-click
         */
        onContextMenu: (event: ReactMouseEvent) => {
            event.preventDefault();
            cancelPress();
            onOpen({ x: event.clientX, y: event.clientY });
        },
        /**
         * Starts the press timer on a finger or a pen
         *
         * @param event the pointer that went down
         */
        onPointerDown: (event: ReactPointerEvent) => {
            // A mouse has a right button and gets the event above; a finger has
            // to hold still instead.
            if (event.pointerType === "mouse") return;
            cancelPress();
            const at = { x: event.clientX, y: event.clientY };
            press.from = at;
            press.timer = window.setTimeout(() => {
                press.timer = undefined;
                press.opened = true;
                onOpen(at);
            }, PRESS_DELAY);
        },
        /** Drops the press timer */
        onPointerUp: cancelPress,
        /** Drops the press timer when the pointer is taken away */
        onPointerCancel: cancelPress,
        /**
         * Drops the press timer once the pointer has travelled far enough
         *
         * @param event where the pointer went
         */
        onPointerMove: (event: ReactPointerEvent) => {
            const from = press.from;
            if (from === null) return;
            if (Math.abs(event.clientX - from.x) + Math.abs(event.clientY - from.y) > PRESS_SLOP) cancelPress();
        },
        /**
         * Swallows the click a long press would otherwise leave behind
         *
         * @param event the click that followed the press
         */
        onClickCapture: (event: ReactMouseEvent) => {
            if (!press.opened) return;
            press.opened = false;
            event.preventDefault();
            event.stopPropagation();
        },
    };
}

/**
 * The properties for {@link Line}
 */
type LineProps = {
    /** What the line says and does */
    item: ContextMenuItem;
    /** Closes the menu */
    onClose: () => void;
};

/**
 * One line of the menu
 *
 * @returns the line
 */
function Line({ item, onClose }: LineProps) {
    return (
        <button
            type={"button"}
            role={"menuitem"}
            disabled={item.disabled === true}
            onClick={() => {
                item.onSelect();
                if (item.keepOpen !== true) onClose();
            }}
            className={clsx(
                "flex shrink-0 items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm/6 transition disabled:opacity-40 disabled:hover:bg-transparent",
                item.tone === "danger"
                    ? "text-red-600 hover:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/15"
                    : "text-zinc-950 hover:bg-zinc-950/5 dark:text-white dark:hover:bg-white/10",
            )}
        >
            <span className={"flex size-4 shrink-0 items-center justify-center *:size-4"}>{item.icon}</span>
            <span className={"min-w-0 flex-1 truncate"}>{item.label}</span>
            {item.shortcut !== undefined && (
                <kbd className={"font-sans text-xs text-zinc-400 dark:text-zinc-500"}>{item.shortcut}</kbd>
            )}
        </button>
    );
}
