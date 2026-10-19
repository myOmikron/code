import React from "react";
import Markdown from "react-markdown";

/**
 * The properties for {@link NewsPostBody}
 */
export type NewsPostBodyProps = {
    /** The News Post's body, as Markdown */
    markdown: string;
};

/**
 * A News Post's body, rendered the same in the editor preview and for customers
 *
 * CommonMark without raw HTML and without images; only `http(s)`, `mailto` and
 * relative links survive, and external ones open in a new tab.
 *
 * @param props {@link NewsPostBodyProps}
 *
 * @returns the rendered body
 */
export function NewsPostBody(props: NewsPostBodyProps) {
    return (
        <div
            className={
                "flex flex-col gap-3 text-base/7 break-words text-zinc-700 dark:text-zinc-300 [&_a]:font-medium [&_a]:text-blue-600 [&_a]:underline dark:[&_a]:text-blue-400 [&_blockquote]:border-l-4 [&_blockquote]:border-zinc-300 [&_blockquote]:pl-4 [&_blockquote]:italic dark:[&_blockquote]:border-zinc-600 [&_h1]:text-xl [&_h1]:font-semibold [&_h1]:text-zinc-950 dark:[&_h1]:text-white [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-zinc-950 dark:[&_h2]:text-white [&_h3]:font-semibold [&_h3]:text-zinc-950 dark:[&_h3]:text-white [&_ol]:list-decimal [&_ol]:pl-6 [&_strong]:font-semibold [&_strong]:text-zinc-950 dark:[&_strong]:text-white [&_ul]:list-disc [&_ul]:pl-6"
            }
        >
            <Markdown
                disallowedElements={["img"]}
                components={{
                    a: ({ href, children }) =>
                        href && /^https?:/i.test(href) ? (
                            <a href={href} target={"_blank"} rel={"noopener noreferrer"}>
                                {children}
                            </a>
                        ) : (
                            <a href={href}>{children}</a>
                        ),
                }}
            >
                {props.markdown}
            </Markdown>
        </div>
    );
}
