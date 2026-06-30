import clsx from "clsx";
import type React from "react";
import { Button } from "./button";
import { LinkProps } from "./link";

/**
 * A page navigation bar.
 *
 * @example
 * ```tsx
 * <Pagination>
 *   <PaginationPrevious href="?page=2" />
 *   <PaginationList>
 *     <PaginationPage href="?page=1">1</PaginationPage>
 *     <PaginationPage href="?page=2">2</PaginationPage>
 *     <PaginationPage href="?page=3" current>3</PaginationPage>
 *   </PaginationList>
 *   <PaginationNext href="?page=4" />
 * </Pagination>
 * ```
 *
 * @see https://catalyst.tailwindui.com/docs/pagination
 */
export function Pagination(props: React.ComponentPropsWithoutRef<"nav">) {
    const { "aria-label": ariaLabel = "Page navigation", className, ...rest } = props;
    return <nav aria-label={ariaLabel} {...rest} className={clsx(className, "flex gap-x-2")} />;
}

/**
 * The properties for {@link PaginationPrevious}
 */
export type PaginationPreviousProps = React.PropsWithChildren<{
    /** The link href, or null to disable */
    href?: LinkProps["href"] | null;
    /** Optional link params */
    params?: LinkProps["params"];
    /** Optional link search params */
    search?: LinkProps["search"];
    /** Additional CSS classes */
    className?: string;
    /** Click handler */
    onClick?: () => void;
}>;

/**
 * The 'Previous' button of a {@link Pagination}
 */
export function PaginationPrevious(props: PaginationPreviousProps) {
    const { href = null, params, search, className, children = "Previous", onClick } = props;
    return (
        <span className={clsx(className, "grow basis-0")}>
            <Button
                onClick={onClick}
                {...(href === null ? { disabled: true } : { href, params, search })}
                plain
                aria-label="Previous page"
            >
                <svg className="stroke-current" data-slot="icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path
                        d="M2.75 8H13.25M2.75 8L5.25 5.5M2.75 8L5.25 10.5"
                        strokeWidth={1.5}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                </svg>
                {children}
            </Button>
        </span>
    );
}

/**
 * The properties for {@link PaginationNext}
 */
export type PaginationNextProps = React.PropsWithChildren<{
    /** The link href, or null to disable */
    href?: LinkProps["href"] | null;
    /** Optional link params */
    params?: LinkProps["params"];
    /** Optional link search params */
    search?: LinkProps["search"];
    /** Additional CSS classes */
    className?: string;
    /** Click handler */
    onClick?: () => void;
}>;

/**
 * The 'Next' button of a {@link Pagination}
 */
export function PaginationNext(props: PaginationNextProps) {
    const { href = null, params, search, className, children = "Next", onClick } = props;
    return (
        <span className={clsx(className, "flex grow basis-0 justify-end")}>
            <Button
                onClick={onClick}
                {...(href === null ? { disabled: true } : { href })}
                params={params}
                search={search}
                plain
                aria-label="Next page"
            >
                {children}
                <svg className="stroke-current" data-slot="icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path
                        d="M13.25 8L2.75 8M13.25 8L10.75 10.5M13.25 8L10.75 5.5"
                        strokeWidth={1.5}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                </svg>
            </Button>
        </span>
    );
}

/**
 * The page number list within a {@link Pagination}
 */
export function PaginationList(props: React.ComponentPropsWithoutRef<"span">) {
    const { className, ...rest } = props;
    return <span {...rest} className={clsx(className, "hidden items-baseline gap-x-2 sm:flex")} />;
}

/**
 * The properties for {@link PaginationPage}
 */
export type PaginationPageProps = React.PropsWithChildren<{
    /** The link href */
    href?: LinkProps["href"];
    /** Optional link params */
    params?: LinkProps["params"];
    /** Optional link search params */
    search?: LinkProps["search"];
    /** Additional CSS classes */
    className?: string;
    /** Whether this is the current page */
    current?: boolean;
    /** Click handler */
    onClick?: () => void;
}>;

/**
 * A single page number button within a {@link PaginationList}
 */
export function PaginationPage(props: PaginationPageProps) {
    const { className, current = false, children, onClick, ...other } = props;
    return (
        <Button
            {...other}
            onClick={onClick}
            plain
            aria-label={`Page ${children}`}
            aria-current={current ? "page" : undefined}
            className={clsx(
                className,
                "min-w-[2.25rem] before:absolute before:-inset-px before:rounded-lg",
                current && "before:bg-zinc-950/5 dark:before:bg-white/10",
            )}
        >
            <span className="-mx-0.5">{children}</span>
        </Button>
    );
}

/**
 * An ellipsis gap within a {@link PaginationList}
 */
export function PaginationGap(props: React.ComponentPropsWithoutRef<"span">) {
    const { className, children = <>&hellip;</>, ...rest } = props;
    return (
        <span
            aria-hidden="true"
            {...rest}
            className={clsx(
                className,
                "w-[2.25rem] text-center text-sm/6 font-semibold text-zinc-950 select-none dark:text-white",
            )}
        >
            {children}
        </span>
    );
}
