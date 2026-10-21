/** The props of {@link UnreadDot} */
export type UnreadDotProps = {
    /** What the dot means, for screen readers */
    label: string;
};

/**
 * The small dot on a menu entry that has something the player has not seen yet.
 *
 * @returns the dot
 */
export function UnreadDot(props: UnreadDotProps) {
    return (
        <span className={"inline-flex size-2 shrink-0 rounded-full bg-sky-500 dark:bg-sky-400"}>
            <span className={"sr-only"}>{props.label}</span>
        </span>
    );
}
