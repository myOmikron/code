import clsx from "clsx";
import React from "react";

/**
 * The properties for {@link BrandSurface}
 */
export type BrandSurfaceProps = {
    /** Sizing and layout of the surface */
    className?: string;
    /** Content, set in white */
    children?: React.ReactNode;
};

/**
 * A saturated surface in the app's brand color (`--color-brand-*`): light falling in from the top, the color
 * deepening towards the bottom, and a fine dot grid rising from below that fades out before it reaches the text
 */
export default function BrandSurface(props: BrandSurfaceProps) {
    return (
        <div
            className={clsx(
                props.className,
                "relative isolate overflow-hidden bg-(--color-brand-800) text-white dark:bg-(--color-brand-950)",
            )}
        >
            <div
                aria-hidden={"true"}
                className={
                    "bg-[image:radial-gradient(60rem_40rem_at_110%_-10%,--theme(--color-brand-500/45%),transparent_60%),radial-gradient(50rem_36rem_at_-20%_115%,--theme(--color-brand-950/70%),transparent_65%)] dark:bg-[image:radial-gradient(60rem_40rem_at_110%_-10%,--theme(--color-brand-700/45%),transparent_60%)] absolute inset-0 -z-10"
                }
            />
            <div
                aria-hidden={"true"}
                className={
                    "absolute inset-0 -z-10 bg-[radial-gradient(--theme(--color-white/12%)_1px,transparent_1px)] mask-[linear-gradient(to_top,black,transparent_60%)] bg-size-[1.25rem_1.25rem]"
                }
            />
            {props.children}
        </div>
    );
}
