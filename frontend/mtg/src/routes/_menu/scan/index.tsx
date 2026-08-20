import { CameraIcon, RectangleStackIcon, TrashIcon } from "@heroicons/react/20/solid";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
    Alert,
    AlertActions,
    AlertDescription,
    AlertTitle,
    Button,
    EmptyState,
    Heading,
    PrimaryButton,
    StackedList,
    StackedListFlexRow,
    Strong,
    Text,
} from "components";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useScanSessions } from "src/context/scan-sessions-context";
import { sessionValue } from "src/utils/scan-sessions";
import { formatCurrency, formatDateTime } from "src/utils/format";

export const Route = createFileRoute("/_menu/scan/")({ component: SessionOverviewRoute });

/**
 * The scan sessions: every open batch of scans, and where new ones start.
 *
 * Several can be open at once — one per box being sorted. A session created here has no target
 * collection yet; the "scan into this collection" button on a collection page creates one that
 * does.
 *
 * @returns the page
 */
function SessionOverviewRoute() {
    const [t] = useTranslation("scan");
    const [tg] = useTranslation();
    const navigate = useNavigate();
    const { sessions, createSession, deleteSession } = useScanSessions();
    const [deleting, setDeleting] = useState<string | null>(null);
    const deletingSession = sessions.find((session) => session.id === deleting) ?? null;

    /**
     * Opens a fresh, target-less session and jumps into its scanner
     */
    function startNew() {
        const session = createSession();
        void navigate({ to: "/scan/sessions/$sessionId/scope", params: { sessionId: session.id } });
    }

    return (
        <div className={"flex flex-col gap-6"}>
            <div className={"flex flex-wrap items-start justify-between gap-3"}>
                <div className={"flex flex-col gap-2"}>
                    <Heading>{t("heading.scan-sessions")}</Heading>
                    <Text>{t("description.sessions")}</Text>
                </div>
                <PrimaryButton onClick={startNew}>{t("button.new-session")}</PrimaryButton>
            </div>

            {sessions.length === 0 ? (
                <EmptyState
                    icon={<CameraIcon />}
                    title={t("heading.no-sessions")}
                    description={t("description.sessions-empty")}
                />
            ) : (
                <StackedList>
                    {sessions.map((session) => (
                        <StackedListFlexRow key={session.id} className={"gap-3"}>
                            <button
                                className={"flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left"}
                                onClick={() =>
                                    void navigate({
                                        to: "/scan/sessions/$sessionId",
                                        params: { sessionId: session.id },
                                    })
                                }
                            >
                                <span
                                    className={
                                        "grid size-10 shrink-0 place-items-center rounded-lg bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                                    }
                                >
                                    <RectangleStackIcon className={"size-5"} />
                                </span>
                                <span className={"min-w-0 flex-1"}>
                                    <Strong className={"block truncate"}>
                                        {session.target?.name ?? t("label.session-no-target")}
                                    </Strong>
                                    <Text className={"truncate"}>
                                        {t("label.session-summary", {
                                            created: formatDateTime(session.createdAt),
                                            cards: tg("label.cards", {
                                                count: session.entries.length,
                                                amount: session.entries.length,
                                            }),
                                            value: formatCurrency(sessionValue(session)),
                                        })}
                                    </Text>
                                </span>
                            </button>
                            <Button
                                plain
                                aria-label={t("accessibility.delete-session")}
                                onClick={() => setDeleting(session.id)}
                            >
                                <TrashIcon className={"size-5"} />
                            </Button>
                        </StackedListFlexRow>
                    ))}
                </StackedList>
            )}

            <Alert open={deletingSession !== null} onClose={() => setDeleting(null)}>
                <AlertTitle>{t("heading.delete-session")}</AlertTitle>
                <AlertDescription>
                    {t("description.delete-session", {
                        cards: tg("label.cards", {
                            count: deletingSession?.entries.length ?? 0,
                            amount: deletingSession?.entries.length ?? 0,
                        }),
                    })}
                </AlertDescription>
                <AlertActions>
                    <Button plain onClick={() => setDeleting(null)}>
                        {tg("button.cancel")}
                    </Button>
                    <Button
                        color={"red"}
                        onClick={() => {
                            if (deletingSession) deleteSession(deletingSession.id);
                            setDeleting(null);
                        }}
                    >
                        {t("button.delete-session")}
                    </Button>
                </AlertActions>
            </Alert>
        </div>
    );
}
