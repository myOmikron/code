// PROTOTYPE, wipe me: public News Post page for variants B, C and D
import { ArrowLeftIcon } from "@heroicons/react/20/solid";
import { Link, createFileRoute } from "@tanstack/react-router";
import React from "react";
import { FAKE_POSTS, excerpt } from "src/components/prototype-news/fake-posts";
import { NewsPostBody } from "src/components/prototype-news/news-post-body";
import { NEWS_VARIANTS, PrototypeSwitcher } from "src/components/prototype-switcher";
import { formatDate } from "src/utils/dates";

/**
 * List of all News Posts, or one of them with `?post=`
 *
 * @returns the page
 */
function NewsPrototype() {
    const { variant = "B", post } = Route.useSearch();
    const selected = FAKE_POSTS.find((p) => p.id === post);

    return (
        <div className={"mx-auto flex w-full max-w-2xl flex-col gap-6 py-6"}>
            {selected ? (
                <article className={"flex flex-col gap-2"}>
                    <Link
                        to={"/news-prototype"}
                        search={{ variant }}
                        className={"mb-4 inline-flex items-center gap-1 text-sm font-medium text-zinc-500"}
                    >
                        <ArrowLeftIcon className={"size-4"} /> Alle Neuigkeiten
                    </Link>
                    <p className={"text-sm text-zinc-500 dark:text-zinc-400"}>{formatDate(selected.publishedAt)}</p>
                    <h1 className={"mb-4 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-white"}>
                        {selected.title}
                    </h1>
                    <NewsPostBody markdown={selected.body} />
                </article>
            ) : (
                <>
                    <h1 className={"text-3xl font-semibold tracking-tight text-zinc-950 dark:text-white"}>
                        Neuigkeiten
                    </h1>
                    <ul className={"flex flex-col divide-y divide-zinc-950/10 dark:divide-white/10"}>
                        {FAKE_POSTS.map((p) => (
                            <li key={p.id}>
                                <Link to={"/news-prototype"} search={{ variant, post: p.id }} className={"block py-5"}>
                                    <p className={"text-sm text-zinc-500 dark:text-zinc-400"}>
                                        {formatDate(p.publishedAt)}
                                    </p>
                                    <h2 className={"mt-1 text-lg font-semibold text-zinc-950 dark:text-white"}>
                                        {p.title}
                                    </h2>
                                    <p className={"mt-1 line-clamp-2 text-sm text-zinc-600 dark:text-zinc-300"}>
                                        {excerpt(p.body)}
                                    </p>
                                </Link>
                            </li>
                        ))}
                    </ul>
                </>
            )}
            <PrototypeSwitcher variants={NEWS_VARIANTS} current={variant} />
        </div>
    );
}

export const Route = createFileRoute("/_shop/news-prototype")({
    component: NewsPrototype,
    validateSearch: (search: Record<string, unknown>): { variant?: string; post?: string } => ({
        variant: typeof search.variant === "string" ? search.variant : undefined,
        post: typeof search.post === "string" ? search.post : undefined,
    }),
});
