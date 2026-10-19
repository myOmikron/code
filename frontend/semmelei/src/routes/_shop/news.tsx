import { createFileRoute } from "@tanstack/react-router";
import React from "react";
import { useTranslation } from "react-i18next";
import { EmptyState, Skeleton } from "components";
import { Api } from "src/api/api";
import { PublishedNewsPost } from "src/api/generated";
import { NewsPostBody } from "src/components/news-post-body";
import { formatDate } from "src/utils/dates";

/**
 * Every Published News Post in full, newest first
 *
 * @returns the page
 */
function News() {
    const [t] = useTranslation("shop");
    const [posts, setPosts] = React.useState<PublishedNewsPost[]>();

    React.useEffect(() => {
        Api.shop.newsPosts().then((r) => setPosts(r.news_posts));
    }, []);

    return (
        <div className={"mx-auto flex w-full max-w-2xl flex-col gap-8 py-6"}>
            <h1 className={"text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl dark:text-white"}>
                {t("heading.news")}
            </h1>
            {posts === undefined ? (
                <Skeleton variant={"card"} height={240} />
            ) : posts.length === 0 ? (
                <EmptyState title={t("label.news-empty")} />
            ) : (
                <div className={"flex flex-col divide-y divide-zinc-950/10 dark:divide-white/10"}>
                    {posts.map((post) => (
                        <article key={`${post.published_at}-${post.title}`} className={"py-8 first:pt-0"}>
                            <p className={"text-sm text-zinc-500 dark:text-zinc-400"}>
                                {formatDate(post.published_at)}
                            </p>
                            <h2 className={"mt-1 mb-4 text-2xl font-semibold text-zinc-950 dark:text-white"}>
                                {post.title}
                            </h2>
                            <NewsPostBody markdown={post.body} />
                        </article>
                    ))}
                </div>
            )}
        </div>
    );
}

export const Route = createFileRoute("/_shop/news")({
    component: News,
});
