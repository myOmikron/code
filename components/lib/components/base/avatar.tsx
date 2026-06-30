import * as Headless from "@headlessui/react";
import clsx from "clsx";
import React from "react";
import { TouchTarget } from "./button";
import { Link, LinkProps } from "./link";

/**
 * The properties for {@link Avatar}
 */
export type AvatarProps = {
    /** The image source URL */
    src?: string | null;
    /** Whether to use a square shape instead of round */
    square?: boolean;
    /** Initials to display when no image is provided */
    initials?: string;
    /** Alt text for the avatar image */
    alt?: string;
    /** Additional CSS classes */
    className?: string;
};

/**
 * A circular or square avatar with optional initials fallback.
 *
 * @example
 * ```tsx
 * <Avatar src="/profile.jpg" alt="User" />
 * <Avatar initials="JD" className="size-8" />
 * <Avatar square initials="AB" />
 * ```
 *
 * @see https://catalyst.tailwindui.com/docs/avatar
 */
export function Avatar(props: AvatarProps & React.ComponentPropsWithoutRef<"span">) {
    const { src = null, square = false, initials, alt = "", className, ...rest } = props;
    return (
        <span
            data-slot="avatar"
            {...rest}
            className={clsx(
                className,
                // Basic layout
                "inline-grid shrink-0 align-middle [--avatar-radius:20%] *:col-start-1 *:row-start-1",
                "outline -outline-offset-1 outline-black/10 dark:outline-white/10",
                // Border radius
                square ? "rounded-(--avatar-radius) *:rounded-(--avatar-radius)" : "rounded-full *:rounded-full",
            )}
        >
            {initials && (
                <svg
                    className="size-full fill-current p-[5%] text-[48px] font-medium uppercase select-none"
                    viewBox="0 0 100 100"
                    aria-hidden={alt ? undefined : "true"}
                >
                    {alt && <title>{alt}</title>}
                    <text
                        x="50%"
                        y="50%"
                        alignmentBaseline="middle"
                        dominantBaseline="middle"
                        textAnchor="middle"
                        dy=".125em"
                    >
                        {initials}
                    </text>
                </svg>
            )}
            {src && <img className="size-full" src={src} alt={alt} />}
        </span>
    );
}

/**
 * An {@link Avatar} that acts as a clickable button or link
 *
 * @param props - The component props
 * @param ref - The forwarded ref
 * @returns The rendered avatar button
 * @see https://catalyst.tailwindui.com/docs/avatar
 */
export const AvatarButton = React.forwardRef(function AvatarButton(
    props: AvatarProps & (Omit<LinkProps, "render"> | Headless.ButtonProps),
    ref: React.ForwardedRef<HTMLElement>,
) {
    const { src, square = false, initials, alt, className, ...rest } = props;
    const classes = clsx(
        className,
        square ? "rounded-[20%]" : "rounded-full",
        "relative inline-grid focus:outline-hidden data-focus:outline-2 data-focus:outline-offset-2 data-focus:outline-blue-500",
    );

    return "href" in rest ? (
        <Link {...rest} className={classes} ref={ref as React.ForwardedRef<HTMLAnchorElement>}>
            <TouchTarget>
                <Avatar src={src} square={square} initials={initials} alt={alt} />
            </TouchTarget>
        </Link>
    ) : (
        <Headless.Button {...rest} className={classes} ref={ref}>
            <TouchTarget>
                <Avatar src={src} square={square} initials={initials} alt={alt} />
            </TouchTarget>
        </Headless.Button>
    );
});
