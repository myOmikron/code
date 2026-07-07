import React from "react";
import { Heading } from "src/components/base/heading";
import { clsx } from "clsx";
import { Text } from "src/components/base/text";

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
                    {props.headingDescription && <div>{props.headingDescription}</div>}
                </div>
                {props.headingChildren !== undefined ? (
                    <div className={"flex gap-4"}>{props.headingChildren}</div>
                ) : undefined}
            </div>
            {props.children}
        </div>
    );
}
