import { ArrowTopRightOnSquareIcon } from "@heroicons/react/20/solid";
import type { ReactNode } from "react";

/**
 * The properties for {@link ExternalLinkRow}
 */
export type ExternalLinkRowProps = {
    /** Where the row leads */
    href: string;
    /** What the row is called, for the tooltip and for screen readers */
    label: string;
    /** What the row shows: a name, or the site's own logo */
    children: ReactNode;
    /** Additional CSS classes */
    className?: string;
};

/**
 * One entry in a list of places a card can be looked at elsewhere.
 *
 * A bordered row rather than a bare link: the card dialog is a column of text,
 * and a lone underlined sentence at the bottom of it reads as an afterthought.
 * Each site keeps its own identity on the left — its logo where there is one —
 * and they all share the same frame and the same arrow.
 *
 * @returns the row
 */
export function ExternalLinkRow({ href, label, children, className }: ExternalLinkRowProps) {
    return (
        // A plain anchor, not `TextLink`, which is typed against the app's own
        // route table and cannot take an external url.
        <a
            href={href}
            target={"_blank"}
            rel={"noreferrer"}
            title={label}
            aria-label={label}
            // A card tile opens the dialog when clicked; the link must not do
            // both.
            onClick={(event) => event.stopPropagation()}
            className={`group flex items-center justify-between gap-3 rounded-(--radius-control) px-3 py-2.5 ring-1 ring-zinc-950/10 transition hover:bg-zinc-950/5 dark:ring-white/15 dark:hover:bg-white/5 ${className ?? ""}`}
        >
            {children}
            <ArrowTopRightOnSquareIcon
                className={
                    "size-4 shrink-0 text-zinc-400 transition group-hover:text-zinc-950 dark:text-zinc-500 dark:group-hover:text-white"
                }
                aria-hidden={true}
            />
        </a>
    );
}
