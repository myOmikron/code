import { createFileRoute, useNavigate } from "@tanstack/react-router";
import React from "react";
import { useTranslation } from "react-i18next";
import {
    BackButton,
    Badge,
    BlockUnsavedChanges,
    Button,
    ConfirmDialog,
    Heading,
    PrimaryButton,
    Skeleton,
    Text,
    notify,
} from "components";
import { Api } from "src/api/api";
import { AdminNewsPost } from "src/api/generated";
import { NewsPostEditor } from "src/components/news-post-editor";
import { NewsPostStateBadge } from "src/components/news-post-state-badge";
import { formatDate } from "src/utils/dates";
import { newsPostProblems } from "src/utils/news";

/**
 * Write, publish, withdraw or delete one News Post
 *
 * @returns the page
 */
function NewsPostPage() {
    const [t] = useTranslation("admin");
    const [tg] = useTranslation();
    const { uuid } = Route.useParams();
    const navigate = useNavigate();
    const [post, setPost] = React.useState<AdminNewsPost>();
    const [title, setTitle] = React.useState("");
    const [body, setBody] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const [confirmDelete, setConfirmDelete] = React.useState(false);
    const [deleted, setDeleted] = React.useState(false);

    /**
     * Take over a News Post as the server has it
     *
     * @param saved the News Post
     */
    function load(saved: AdminNewsPost) {
        setPost(saved);
        setTitle(saved.title);
        setBody(saved.body);
    }

    React.useEffect(() => {
        Api.admin.newsPosts.get(uuid).then(load);
    }, [uuid]);

    const dirty = post !== undefined && !deleted && (title !== post.title || body !== post.body);
    const problems = newsPostProblems(title, body);
    const valid = !problems.title && !problems.body;

    React.useEffect(() => {
        if (!dirty) return;
        const warn = (event: BeforeUnloadEvent) => event.preventDefault();
        window.addEventListener("beforeunload", warn);
        return () => window.removeEventListener("beforeunload", warn);
    }, [dirty]);

    React.useEffect(() => {
        if (deleted) void navigate({ to: "/admin/posts" });
    }, [deleted]);

    /**
     * Run a change against the server and report it
     *
     * @param change the change, resolving to the News Post as the server has it afterwards
     * @param toast the toast to show
     * @param saves whether the change stores the editor's title and body
     */
    async function apply(change: () => Promise<AdminNewsPost>, toast: string, saves: boolean) {
        setBusy(true);
        try {
            const saved = await change();
            if (saves) load(saved);
            else setPost(saved);
            notify.success(toast);
        } finally {
            setBusy(false);
        }
    }

    /**
     * Store the editor's title and body
     *
     * @returns the saved News Post
     */
    const save = () => Api.admin.newsPosts.update(uuid, { title: title.trim(), body });

    if (!post) {
        return <Skeleton variant={"card"} height={480} />;
    }

    return (
        <div className={"flex flex-col gap-6"}>
            <BlockUnsavedChanges condition={dirty} />
            <BackButton href={"/admin/posts"}>{t("button.all-news-posts")}</BackButton>

            <div className={"flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"}>
                <div className={"flex flex-col gap-2"}>
                    <Heading>{post.title}</Heading>
                    <div className={"flex flex-wrap items-center gap-2"}>
                        <NewsPostStateBadge publishedAt={post.published_at} />
                        <Text>
                            {post.published_at
                                ? t("label.published-on", { date: formatDate(post.published_at) })
                                : t("description.draft")}
                        </Text>
                        {dirty && <Badge color={"amber"}>{t("label.unsaved-changes")}</Badge>}
                    </div>
                </div>
                <div className={"flex flex-wrap gap-2"}>
                    <Button color={"red"} onClick={() => setConfirmDelete(true)} disabled={busy}>
                        {tg("button.delete")}
                    </Button>
                    {post.published_at ? (
                        <Button
                            outline
                            disabled={busy}
                            onClick={() =>
                                void apply(
                                    () => Api.admin.newsPosts.withdraw(uuid),
                                    t("toast.news-post-withdrawn"),
                                    false,
                                )
                            }
                        >
                            {t("button.withdraw")}
                        </Button>
                    ) : (
                        <Button
                            color={"blue"}
                            disabled={busy || !valid}
                            onClick={() =>
                                void apply(
                                    async () => {
                                        if (dirty) await save();
                                        return Api.admin.newsPosts.publish(uuid);
                                    },
                                    t("toast.news-post-published"),
                                    true,
                                )
                            }
                        >
                            {t("button.publish")}
                        </Button>
                    )}
                    <PrimaryButton
                        loading={busy}
                        disabled={!dirty || !valid}
                        onClick={() => void apply(save, t("toast.news-post-saved"), true)}
                    >
                        {tg("button.save")}
                    </PrimaryButton>
                </div>
            </div>

            <NewsPostEditor
                title={title}
                body={body}
                problems={problems}
                onTitleChange={setTitle}
                onBodyChange={setBody}
            />

            <ConfirmDialog
                open={confirmDelete}
                onClose={() => setConfirmDelete(false)}
                onConfirm={async () => {
                    await Api.admin.newsPosts.delete(uuid);
                    setConfirmDelete(false);
                    notify.success(t("toast.news-post-deleted"));
                    setDeleted(true);
                }}
                title={t("heading.confirm-delete-news-post")}
                description={t("description.confirm-delete-news-post", { title: post.title })}
                confirmLabel={tg("button.delete")}
                confirmColor={"red"}
            />
        </div>
    );
}

export const Route = createFileRoute("/_auth/admin/posts/$uuid")({
    component: NewsPostPage,
});
