import React from "react";
import { Heading } from "./heading";
import { clsx } from "clsx";

/**
 * The properties for {@link HeadingLayout}
 */
export type HeadingLayoutProps = {
    /** The text for the heading */
    heading: string;

    /** Optional description text below the heading */
    headingDescription?: React.ReactNode;

    /** Additional children that will be displayed in the heading */
    headingChildren?: Array<React.ReactNode> | React.ReactNode;

    /** Everything below the heading */
    children?: React.ReactNode;

    /** Set additional classes */
    className?: string;
};

/**
 * A layout that includes a top level heading
 */
export default function HeadingLayout(props: HeadingLayoutProps) {
    return (
        <div className={clsx("flex flex-col gap-8", props.className)}>
            <div className="grid w-full items-end justify-between gap-4 border-b border-zinc-950/10 pb-6 sm:grid-cols-[1fr_auto] sm:gap-20 dark:border-white/10">
                <div className={"flex flex-col gap-3"}>
                    <Heading>{props.heading}</Heading>
                    {/* Coloured here rather than left to the caller. A description handed in as
                        a plain string carried no colour at all, so it inherited the browser's
                        black — invisible on a dark background. Anything passed in as an element
                        of its own still sets its own colour and overrides this. */}
                    {props.headingDescription && (
                        <div className={"text-base/6 text-zinc-500 sm:text-sm/6 dark:text-zinc-400"}>
                            {props.headingDescription}
                        </div>
                    )}
                </div>
                {props.headingChildren !== undefined ? (
                    <div className={"flex gap-4"}>{props.headingChildren}</div>
                ) : undefined}
            </div>
            {props.children}
        </div>
    );
}
