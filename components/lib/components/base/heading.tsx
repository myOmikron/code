import clsx from "clsx";

/**
 * The properties for {@link Heading} and {@link Subheading}
 */
export type HeadingProps = {
    /** The heading level (1-6) */
    level?: 1 | 2 | 3 | 4 | 5 | 6;
} & React.ComponentPropsWithoutRef<"h1" | "h2" | "h3" | "h4" | "h5" | "h6">;

/**
 * A primary page heading.
 *
 * @example
 * ```tsx
 * <Heading>Users</Heading>
 * <Heading level={2}>Section Title</Heading>
 * ```
 *
 * @see https://catalyst.tailwindui.com/docs/heading
 */
export function Heading(props: HeadingProps) {
    const { className, level = 1, ...rest } = props;
    const Element: `h${typeof level}` = `h${level}`;

    return (
        <Element
            {...rest}
            className={clsx(className, "text-2xl/8 font-semibold text-zinc-950 sm:text-xl/8 dark:text-white")}
        />
    );
}

/**
 * A secondary heading, smaller than {@link Heading}
 *
 * @see https://catalyst.tailwindui.com/docs/heading
 */
export function Subheading(props: HeadingProps) {
    const { className, level = 2, ...rest } = props;
    const Element: `h${typeof level}` = `h${level}`;

    return (
        <Element
            {...rest}
            className={clsx(className, "text-base/7 font-semibold text-zinc-950 sm:text-sm/6 dark:text-white")}
        />
    );
}
