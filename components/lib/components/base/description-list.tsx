import clsx from "clsx";

/**
 * A styled definition list for key-value pairs.
 *
 * @example
 * ```tsx
 * <DescriptionList>
 *   <DescriptionTerm>Name</DescriptionTerm>
 *   <DescriptionDetails>Lindsay Walton</DescriptionDetails>
 *   <DescriptionTerm>Email</DescriptionTerm>
 *   <DescriptionDetails>lindsay@example.com</DescriptionDetails>
 * </DescriptionList>
 * ```
 *
 * @see https://catalyst.tailwindui.com/docs/description-list
 */
export function DescriptionList(props: React.ComponentPropsWithoutRef<"dl">) {
    const { className, ...rest } = props;
    return (
        <dl
            {...rest}
            className={clsx(
                className,
                "grid grid-cols-1 text-base/6 sm:grid-cols-[min(50%,--spacing(80))_auto] sm:text-sm/6",
            )}
        />
    );
}

/**
 * A term/key within a {@link DescriptionList}
 */
export function DescriptionTerm(props: React.ComponentPropsWithoutRef<"dt">) {
    const { className, ...rest } = props;
    return (
        <dt
            {...rest}
            className={clsx(
                className,
                "col-start-1 border-t border-zinc-950/5 pt-3 text-zinc-500 first:border-none sm:border-t sm:border-zinc-950/5 sm:py-3 dark:border-white/5 dark:text-zinc-400 sm:dark:border-white/5",
            )}
        />
    );
}

/**
 * A value/details within a {@link DescriptionList}
 */
export function DescriptionDetails(props: React.ComponentPropsWithoutRef<"dd">) {
    const { className, ...rest } = props;
    return (
        <dd
            {...rest}
            className={clsx(
                className,
                "pt-1 pb-3 text-zinc-950 sm:border-t sm:border-zinc-950/5 sm:py-3 sm:nth-2:border-none dark:text-white dark:sm:border-white/5",
            )}
        />
    );
}
