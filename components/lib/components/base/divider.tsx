import clsx from "clsx";

/**
 * The properties for {@link Divider}
 */
export type DividerProps = {
    /** Whether to use a softer, less prominent line */
    soft?: boolean;
} & React.ComponentPropsWithoutRef<"hr">;

/**
 * A horizontal divider line.
 *
 * @example
 * ```tsx
 * <Divider />
 * <Divider soft />
 * ```
 *
 * @see https://catalyst.tailwindui.com/docs/divider
 */
export function Divider(props: DividerProps) {
    const { soft = false, className, ...rest } = props;
    return (
        <hr
            role="presentation"
            {...rest}
            className={clsx(
                className,
                "w-full border-t",
                soft && "border-zinc-950/5 dark:border-white/5",
                !soft && "border-zinc-950/10 dark:border-white/10",
            )}
        />
    );
}
