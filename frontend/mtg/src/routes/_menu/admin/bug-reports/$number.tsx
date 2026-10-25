import { ChevronLeftIcon } from "@heroicons/react/20/solid";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
    Badge,
    Button,
    DescriptionDetails,
    DescriptionList,
    DescriptionTerm,
    Field,
    Label,
    Subheading,
    Text,
    Textarea,
    notify,
} from "components";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { BugReportState } from "src/api/generated";
import { AdminBugReportDiagnostics } from "src/components/admin-bug-report-diagnostics";
import type { Diagnostics } from "src/utils/diagnostics";
import { formatDateTime } from "src/utils/format";
import { useLoaded } from "src/utils/use-loaded";

/** The longest note the backend accepts */
const NOTE_MAX_LENGTH = 4096;

export const Route = createFileRoute("/_menu/admin/bug-reports/$number")({
    component: RouteComponent,
});

/**
 * One Bug report with the player's text, images and everything the app sent along,
 * the Admins' note, and marking it done or open again.
 *
 * @returns the page
 */
function RouteComponent() {
    const [t] = useTranslation("admin");
    const [tg] = useTranslation();
    const number = Number(Route.useParams().number);

    const { data: detail, reload } = useLoaded(() => Api.admin.bugReports.get(number), [number]);
    const [note, setNote] = useState("");
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setNote(detail?.note ?? "");
    }, [detail?.note]);

    if (detail === null) return <Text>{t("label.loading")}</Text>;

    const { report } = detail;
    const done = report.state === BugReportState.Done;

    /**
     * Marks the Bug report done or opens it again
     */
    async function toggleDone() {
        if (done) await Api.admin.bugReports.reopen(number);
        else await Api.admin.bugReports.markDone(number);
        reload();
        notify.success(done ? t("toast.bug-report-reopened") : t("toast.bug-report-done"));
    }

    /**
     * Stores the note as typed, an empty one removes it
     */
    async function saveNote() {
        setSaving(true);
        try {
            await Api.admin.bugReports.setNote(number, note);
            reload();
            notify.success(t("toast.bug-report-note-saved"));
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className={"flex flex-col gap-6"}>
            <Link
                to={"/admin/bug-reports"}
                className={
                    "flex items-center gap-1 text-sm text-zinc-500 hover:text-(--color-accent) hover:underline dark:text-zinc-400"
                }
            >
                <ChevronLeftIcon className={"size-4"} /> {t("button.back-to-bug-reports")}
            </Link>

            <div className={"flex flex-wrap items-center gap-3"}>
                <Subheading>{t("heading.bug-report", { number })}</Subheading>
                {done ? (
                    <Badge color={"green"}>{t("label.bug-report-done")}</Badge>
                ) : (
                    <Badge color={"amber"}>{t("label.bug-report-open")}</Badge>
                )}
            </div>

            <DescriptionList>
                <DescriptionTerm>{t("label.bug-report-reporter")}</DescriptionTerm>
                <DescriptionDetails>
                    <Link
                        to={"/admin/accounts/$accountUuid"}
                        params={{ accountUuid: report.reporter.uuid }}
                        className={"hover:text-(--color-accent) hover:underline"}
                    >
                        {report.reporter.username}
                    </Link>
                </DescriptionDetails>
                <DescriptionTerm>{t("label.time")}</DescriptionTerm>
                <DescriptionDetails>{formatDateTime(report.created_at)}</DescriptionDetails>
                <DescriptionTerm>{t("label.bug-report-route")}</DescriptionTerm>
                <DescriptionDetails className={"break-all"}>{report.route}</DescriptionDetails>
                <DescriptionTerm>{t("label.bug-report-release")}</DescriptionTerm>
                <DescriptionDetails>{report.release}</DescriptionDetails>
                <DescriptionTerm>{t("label.bug-report-browser")}</DescriptionTerm>
                <DescriptionDetails className={"break-all"}>{detail.user_agent}</DescriptionDetails>
                <DescriptionTerm>{t("label.bug-report-screen")}</DescriptionTerm>
                <DescriptionDetails>
                    {detail.viewport}, {detail.language}
                </DescriptionDetails>
                {done && (
                    <>
                        <DescriptionTerm>{t("label.bug-report-done-by")}</DescriptionTerm>
                        <DescriptionDetails>
                            {t("label.bug-report-done-by-at", {
                                username: detail.done_by?.username ?? tg("label.deleted-account"),
                                time: detail.done_at ? formatDateTime(detail.done_at) : "",
                            })}
                        </DescriptionDetails>
                    </>
                )}
            </DescriptionList>

            <div className={"flex flex-col gap-2"}>
                <Subheading>{t("heading.bug-report-text")}</Subheading>
                <Text className={"whitespace-pre-wrap"}>{detail.text}</Text>
            </div>

            {detail.purged_at ? (
                <Text>{t("description.bug-report-purged", { time: formatDateTime(detail.purged_at) })}</Text>
            ) : (
                <>
                    {detail.images.length > 0 && (
                        <div className={"flex flex-col gap-2"}>
                            <Subheading>{t("heading.bug-report-images")}</Subheading>
                            <div className={"flex flex-wrap gap-3"}>
                                {detail.images.map((image) => (
                                    <a
                                        key={image.uuid}
                                        href={Api.admin.bugReports.imageUrl(number, image.uuid)}
                                        target={"_blank"}
                                        rel={"noreferrer"}
                                    >
                                        <img
                                            src={Api.admin.bugReports.imageUrl(number, image.uuid)}
                                            alt={""}
                                            className={"max-h-64 rounded-md ring-1 ring-zinc-950/10 dark:ring-white/10"}
                                        />
                                    </a>
                                ))}
                            </div>
                        </div>
                    )}
                    {detail.diagnostics ? (
                        <AdminBugReportDiagnostics diagnostics={detail.diagnostics as Diagnostics} />
                    ) : null}
                </>
            )}

            <Field className={"flex flex-col gap-2"}>
                <Label>{t("label.bug-report-note")}</Label>
                <Textarea
                    rows={3}
                    maxLength={NOTE_MAX_LENGTH}
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                />
                <div>
                    <Button outline={true} disabled={saving || note === (detail.note ?? "")} onClick={saveNote}>
                        {t("button.save-bug-report-note")}
                    </Button>
                </div>
            </Field>

            <div>
                <Button outline={true} onClick={toggleDone}>
                    {done ? t("button.reopen-bug-report") : t("button.mark-bug-report-done")}
                </Button>
            </div>
        </div>
    );
}
