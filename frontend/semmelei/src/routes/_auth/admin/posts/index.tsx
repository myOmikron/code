import { createFileRoute, useNavigate } from "@tanstack/react-router";
import React from "react";
import { useTranslation } from "react-i18next";
import {
    Button,
    EmptyState,
    Heading,
    Table,
    TableBody,
    TableBodySkeleton,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "components";
import { Api } from "src/api/api";
import { AdminNewsPost } from "src/api/generated";
import { NewsPostCreateDialog } from "src/components/news-post-create-dialog";
import { NewsPostStateBadge } from "src/components/news-post-state-badge";
import { formatDate } from "src/utils/dates";

/**
 * All News Posts, Drafts included, newest first
 *
 * @returns the page
 */
function NewsPosts() {
    const [t] = useTranslation("admin");
    const navigate = useNavigate();
    const [posts, setPosts] = React.useState<AdminNewsPost[]>();
    const [creating, setCreating] = React.useState(false);

    React.useEffect(() => {
        Api.admin.newsPosts.list().then((r) => setPosts(r.news_posts));
    }, []);

    return (
        <div className={"flex flex-col gap-6"}>
            <div className={"flex items-center justify-between gap-4"}>
                <Heading>{t("heading.news-posts")}</Heading>
                <Button color={"blue"} onClick={() => setCreating(true)}>
                    {t("button.create-news-post")}
                </Button>
            </div>

            {posts !== undefined && posts.length === 0 ? (
                <EmptyState title={t("label.news-posts-empty")} />
            ) : (
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableHeader>{t("label.title")}</TableHeader>
                            <TableHeader>{t("label.news-post-state")}</TableHeader>
                            <TableHeader>{t("label.date")}</TableHeader>
                        </TableRow>
                    </TableHead>
                    {posts === undefined ? (
                        <TableBodySkeleton rows={3} cols={3} />
                    ) : (
                        <TableBody>
                            {posts.map((post) => (
                                <TableRow key={post.uuid} href={"/admin/posts/$uuid"} params={{ uuid: post.uuid }}>
                                    <TableCell className={"font-medium"}>{post.title}</TableCell>
                                    <TableCell>
                                        <NewsPostStateBadge publishedAt={post.published_at} />
                                    </TableCell>
                                    <TableCell>{formatDate(post.published_at ?? post.created_at)}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    )}
                </Table>
            )}

            <NewsPostCreateDialog
                open={creating}
                onClose={() => setCreating(false)}
                onCreated={(uuid) => void navigate({ to: "/admin/posts/$uuid", params: { uuid } })}
            />
        </div>
    );
}

export const Route = createFileRoute("/_auth/admin/posts/")({
    component: NewsPosts,
});
