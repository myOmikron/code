// PROTOTYPE, wipe me: Markdown rendering for the placement prototype
import React from "react";
import Markdown from "react-markdown";

/** The props for {@link NewsPostBody} */
export type NewsPostBodyProps = {
    /** Markdown source */
    markdown: string;
};

/**
 * Render a News Post's Markdown: no raw HTML, no images, external links get rel
 *
 * @param props the props
 *
 * @returns the rendered body
 */
export function NewsPostBody(props: NewsPostBodyProps) {
    return (
        <div
            className={
                "flex flex-col gap-3 text-base/7 text-zinc-700 dark:text-zinc-300 [&_a]:font-medium [&_a]:text-blue-600 [&_a]:underline dark:[&_a]:text-blue-400 [&_blockquote]:border-l-4 [&_blockquote]:border-zinc-300 [&_blockquote]:pl-4 [&_blockquote]:italic [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-zinc-950 dark:[&_h2]:text-white [&_strong]:font-semibold [&_strong]:text-zinc-950 dark:[&_strong]:text-white [&_ul]:list-disc [&_ul]:pl-6"
            }
        >
            <Markdown
                disallowedElements={["img"]}
                components={{
                    a: ({ href, children }) => (
                        <a href={href} target={"_blank"} rel={"noopener noreferrer"}>
                            {children}
                        </a>
                    ),
                }}
            >
                {props.markdown}
            </Markdown>
        </div>
    );
}
