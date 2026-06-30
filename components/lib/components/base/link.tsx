import * as Headless from "@headlessui/react";
import React from "react";
import { Link as RouterLink, LinkProps as RouterLinkProps } from "@tanstack/react-router";

/**
 * The properties of the Link
 */
export type LinkProps = (
    | {
          /** Render props of tanstacks link */
          render: (state: { /** Whether the link matches the current route */ isActive: boolean }) => React.ReactNode;
          /** Not available when using render */
          children?: never;
      }
    | {
          /** The children to render */
          children: React.ReactNode;
          /** Not available when using children */
          render?: never;
      }
) & {
    /** Custom href */
    href: RouterLinkProps["to"];
    /** The classname to set */
    className?: string;
    /** TabIndex */
    tabIndex?: number;
} & Omit<RouterLinkProps, "to" | "children">;

/**
 * A styled router link.
 *
 * @example
 * ```tsx
 * <Link href="/about">About us</Link>
 * ```
 *
 * @param props - The component props
 * @param ref - The forwarded ref
 * @returns The rendered link element
 */
export const Link = React.forwardRef(function Link(props: LinkProps, ref: React.ForwardedRef<HTMLAnchorElement>) {
    const { href, params, children, render, ...other } = props;

    return (
        <Headless.DataInteractive>
            <RouterLink
                preload={"intent"}
                to={href}
                params={params}
                {...other}
                ref={ref}
                children={children ? children : render}
            />
        </Headless.DataInteractive>
    );
});
