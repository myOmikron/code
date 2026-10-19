import { ArrowRightIcon } from "@heroicons/react/20/solid";
import React from "react";
import { useTranslation } from "react-i18next";
import { Link } from "components";
import { PublishedNewsPost } from "src/api/generated";
import { excerpt } from "src/utils/news";
import { formatDate } from "src/utils/dates";

/**
 * The properties for {@link NewsTeaser}
 */
export type NewsTeaserProps = {
    /** The News Post to tease */
    post: PublishedNewsPost;
};

/**
 * A card on the start page with the newest News Post's date, title and the beginning of its text
 *
 * @param props {@link NewsTeaserProps}
 *
 * @returns the card
 */
export function NewsTeaser(props: NewsTeaserProps) {
    const [t] = useTranslation("shop");

    return (
        <section
            className={
                "flex flex-col gap-3 rounded-2xl border border-blue-500/20 bg-blue-50/40 p-5 sm:flex-row sm:items-center sm:gap-6 dark:border-blue-400/20 dark:bg-blue-500/5"
            }
        >
            <div className={"min-w-0 flex-1"}>
                <p className={"text-xs font-semibold tracking-wide text-blue-700 uppercase dark:text-blue-300"}>
                    {t("label.news-eyebrow", { date: formatDate(props.post.published_at) })}
                </p>
                <h2 className={"mt-1 text-lg font-semibold text-zinc-950 dark:text-white"}>{props.post.title}</h2>
                <p className={"mt-1 line-clamp-2 text-sm text-zinc-600 dark:text-zinc-300"}>
                    {excerpt(props.post.body)}
                </p>
            </div>
            <Link
                href={"/news"}
                className={
                    "inline-flex shrink-0 items-center gap-1 text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
                }
            >
                {t("button.read-more")} <ArrowRightIcon className={"size-4"} />
            </Link>
        </section>
    );
}
