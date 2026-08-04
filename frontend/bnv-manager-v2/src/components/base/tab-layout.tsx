import React from "react";
import { Heading } from "./heading";
import { Text } from "./text";

/**
 * The properties for {@link TabLayout}
 */
export type TabLayoutProps = {
    /** The heading to display */
    heading: string;
    /** The description of the heading */
    headingDescription?: React.ReactNode;
    /** Children of the heading */
    headingChildren?: React.ReactNode;
    /** The tabs to render */
    tabs: React.ReactNode;
    /** The content of the site */
    children: React.ReactNode;
};

/**
 * A layout for tabs
 */
export default function TabLayout(props: TabLayoutProps) {
    return (
        <>
            <div className={"flex w-full flex-wrap items-end justify-between gap-4 pb-6 lg:flex-nowrap"}>
                <div className={"flex flex-col gap-3"}>
                    <Heading>{props.heading}</Heading>
                    {props.headingDescription && <Text>{props.headingDescription}</Text>}
                </div>
                {props.headingChildren !== undefined ? (
                    <div className={"flex gap-4"}>{props.headingChildren}</div>
                ) : undefined}
            </div>

            {props.tabs}
            <div className={"mt-6 w-full max-w-full"}>{props.children}</div>
        </>
    );
}
