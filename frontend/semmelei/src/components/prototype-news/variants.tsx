// PROTOTYPE, wipe me: News Post placement variants on the shop start page
// Question: where do News Posts show up for customers? Switch via `?variant=A|B|C|D`.
import { ArrowRightIcon, MegaphoneIcon, XMarkIcon } from "@heroicons/react/20/solid";
import { Link, useRouterState } from "@tanstack/react-router";
import React from "react";
import { FAKE_POSTS, excerpt } from "src/components/prototype-news/fake-posts";
import { NewsPostBody } from "src/components/prototype-news/news-post-body";
import { formatDate } from "src/utils/dates";

/**
 * The variant from the url, default A
 *
 * @returns the variant key
 */
export function useNewsVariant(): string {
    return useRouterState({
        select: (s) => {
            const v = (s.location.search as Record<string, unknown>).variant;
            return typeof v === "string" ? v : "A";
        },
    });
}

/**
 * Header entry "Neuigkeiten" for the variants that have their own page
 *
 * @returns the link or nothing
 */
export function NewsHeaderLink() {
    const variant = useNewsVariant();
    if (variant === "A") return null;
    return (
        <Link
            to={"/news-prototype"}
            search={{ variant }}
            className={
                "relative inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-medium text-zinc-600 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-white"
            }
        >
            <MegaphoneIcon className={"size-5"} />
            <span className={"hidden sm:inline"}>Neuigkeiten</span>
            {variant === "B" && <span className={"absolute top-2 right-2 size-2 rounded-full bg-blue-600"} />}
        </Link>
    );
}

/**
 * Slot above the hero (only D uses it)
 *
 * @returns the slot content
 */
export function NewsTopSlot() {
    const variant = useNewsVariant();
    const newest = FAKE_POSTS[0];
    const [dismissed, setDismissed] = React.useState(false);
    if (variant !== "D" || dismissed) return null;
    return (
        <div
            className={
                "flex items-center gap-3 rounded-xl bg-zinc-950 px-4 py-3 text-sm text-white dark:bg-white dark:text-zinc-950"
            }
        >
            <MegaphoneIcon className={"size-5 shrink-0"} />
            <Link
                to={"/news-prototype"}
                search={{ variant, post: newest.id }}
                className={"min-w-0 flex-1 truncate font-medium underline-offset-2 hover:underline"}
            >
                {newest.title}
            </Link>
            <span className={"hidden shrink-0 opacity-70 sm:inline"}>{formatDate(newest.publishedAt)}</span>
            {/* real thing: remember the dismissed post id in localStorage, show again on a newer one */}
            <button type={"button"} onClick={() => setDismissed(true)} className={"cursor-pointer shrink-0"}>
                <XMarkIcon className={"size-5"} />
            </button>
        </div>
    );
}

/**
 * Slot between hero and catalog (A and C)
 *
 * @returns the slot content
 */
export function NewsMainSlot() {
    const variant = useNewsVariant();
    const [showAll, setShowAll] = React.useState(false);

    if (variant === "A") {
        const posts = showAll ? FAKE_POSTS : FAKE_POSTS.slice(0, 1);
        return (
            <section className={"flex flex-col gap-4"}>
                <h2 className={"text-xl font-semibold tracking-tight text-zinc-950 dark:text-white"}>Neuigkeiten</h2>
                {posts.map((post) => (
                    <article
                        key={post.id}
                        className={
                            "rounded-2xl border border-zinc-950/5 bg-[var(--surface-card)] p-5 shadow-[var(--shadow-card-sm)] dark:border-white/10"
                        }
                    >
                        <p className={"text-sm text-zinc-500 dark:text-zinc-400"}>{formatDate(post.publishedAt)}</p>
                        <h3 className={"mt-1 mb-3 text-lg font-semibold text-zinc-950 dark:text-white"}>
                            {post.title}
                        </h3>
                        <NewsPostBody markdown={post.body} />
                    </article>
                ))}
                {FAKE_POSTS.length > 1 && (
                    <button
                        type={"button"}
                        onClick={() => setShowAll(!showAll)}
                        className={
                            "cursor-pointer self-start text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
                        }
                    >
                        {showAll ? "Weniger anzeigen" : `Ältere anzeigen (${FAKE_POSTS.length - 1})`}
                    </button>
                )}
            </section>
        );
    }

    if (variant === "C") {
        const newest = FAKE_POSTS[0];
        return (
            <section
                className={
                    "flex flex-col gap-3 rounded-2xl border border-blue-500/20 bg-blue-50/40 p-5 sm:flex-row sm:items-center sm:gap-6 dark:border-blue-400/20 dark:bg-blue-500/5"
                }
            >
                <div className={"min-w-0 flex-1"}>
                    <p className={"text-xs font-semibold tracking-wide text-blue-700 uppercase dark:text-blue-300"}>
                        Neuigkeit · {formatDate(newest.publishedAt)}
                    </p>
                    <h2 className={"mt-1 text-lg font-semibold text-zinc-950 dark:text-white"}>{newest.title}</h2>
                    <p className={"mt-1 line-clamp-2 text-sm text-zinc-600 dark:text-zinc-300"}>
                        {excerpt(newest.body)}
                    </p>
                </div>
                <div className={"flex shrink-0 gap-4 text-sm font-medium"}>
                    <Link
                        to={"/news-prototype"}
                        search={{ variant, post: newest.id }}
                        className={"inline-flex items-center gap-1 text-blue-600 hover:underline dark:text-blue-400"}
                    >
                        Weiterlesen <ArrowRightIcon className={"size-4"} />
                    </Link>
                    <Link
                        to={"/news-prototype"}
                        search={{ variant }}
                        className={"text-zinc-500 hover:underline dark:text-zinc-400"}
                    >
                        Alle
                    </Link>
                </div>
            </section>
        );
    }

    return null;
}
