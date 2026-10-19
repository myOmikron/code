import { fromMarkdown } from "mdast-util-from-markdown";
import { toString } from "mdast-util-to-string";
import { PublishedNewsPost } from "src/api/generated";

/** How long the newest News Post stays on the start page, in days */
export const TEASER_MAX_AGE_DAYS = 30;

/**
 * The News Post the start page teases: the newest one, while it is younger than
 * {@link TEASER_MAX_AGE_DAYS}
 *
 * @param posts the Published News Posts, newest first
 * @param now the current point in time
 *
 * @returns the post to tease, or nothing
 */
export function teaserPost(posts: PublishedNewsPost[], now: Date): PublishedNewsPost | undefined {
    const newest = posts[0];
    if (!newest) return undefined;
    const age = now.getTime() - new Date(newest.published_at).getTime();
    return age < TEASER_MAX_AGE_DAYS * 24 * 60 * 60 * 1000 ? newest : undefined;
}

/**
 * The first paragraph of a News Post's Markdown as plain text
 *
 * Headings, lists and quotes before it are skipped; link text and emphasis are kept as text.
 *
 * @param markdown the News Post's body
 *
 * @returns the excerpt, empty if the body has no paragraph
 */
export function excerpt(markdown: string): string {
    const paragraph = fromMarkdown(markdown).children.find((node) => node.type === "paragraph");
    if (!paragraph) return "";
    return toString(paragraph, { includeImageAlt: false }).replace(/\s+/g, " ").trim();
}

/** What is wrong with a News Post's title or body, keyed by field */
export type NewsPostProblems = {
    /** The title's problem */
    title?: "required" | "too-long";
    /** The body's problem */
    body?: "required" | "too-long";
};

/**
 * What the backend would reject about a title and body: blank, or longer than it stores
 *
 * The backend counts bytes, so this does too.
 *
 * @param title the title
 * @param body the body, as Markdown
 *
 * @returns the problems, empty when there are none
 */
export function newsPostProblems(title: string, body: string): NewsPostProblems {
    const bytes = (text: string) => new TextEncoder().encode(text).length;
    const problems: NewsPostProblems = {};
    if (!title.trim()) problems.title = "required";
    else if (bytes(title) > 255) problems.title = "too-long";
    if (!body.trim()) problems.body = "required";
    else if (bytes(body) > 20000) problems.body = "too-long";
    return problems;
}
