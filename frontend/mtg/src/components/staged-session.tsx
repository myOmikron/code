import { ArrowDownTrayIcon, CameraIcon, ChevronLeftIcon, PencilSquareIcon, TrashIcon } from "@heroicons/react/20/solid";
import { Link, useNavigate } from "@tanstack/react-router";
import { BadgeButton, EmptyState, HeadingLayout, PrimaryButton, Text } from "components";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ScannerSessionResponse } from "src/api/generated";
import { FileIntoCollectionDialog } from "src/components/file-into-collection-dialog";
import { RequireAccount } from "src/components/require-account";
import { SessionBufferList } from "src/components/session-buffer-list";
import { SessionDialog } from "src/components/session-dialog";
import { SessionStackList } from "src/components/session-stack-list";
import { useScannerSessions } from "src/context/scanner-session-context";
import { useShortcutHelpOpen } from "src/context/shortcut-help-context";
import { useShortcuts } from "src/utils/use-shortcuts";

/** How the mini buttons under a heading are framed, as on a collection */
const ACTION_RING = "ring-1 ring-zinc-950/10 dark:ring-white/15";

/**
 * The properties for {@link StagedSession}
 */
export type StagedSessionProps = {
    /** Which session to show, `undefined` for whichever this device is filling */
    session?: string;
};

/**
 * The staging area, on a machine with room for it.
 *
 * The same session the phone is filling, read from the server: this is where a box scanned on the
 * way home gets its prices typed in, its foils marked and its wrong printings corrected, with a
 * keyboard. The scanner's own sheet shows the identical rows — there is nothing here it cannot
 * do, only more room to do it in.
 *
 * Someone who never opens a second staging area never sees this page as one of several: it is
 * reached from the scanner, it carries their cards, and the shelf behind it holds one tile.
 *
 * @returns the page
 */
export function StagedSession({ session }: StagedSessionProps) {
    const [t] = useTranslation("session");
    const [tg] = useTranslation();
    const navigate = useNavigate();
    const { active, entries, loading, choose, update, remove } = useScannerSessions();
    const shortcutHelpOpen = useShortcutHelpOpen();
    const [filing, setFiling] = useState(false);
    // The session being edited, `undefined` while the dialog is closed. A new one is opened on
    // the page that starts a scan, where a fresh box is actually in front of somebody.
    const [editing, setEditing] = useState<ScannerSessionResponse | undefined>(undefined);
    const copies = entries.reduce((sum, entry) => sum + entry.quantity, 0);

    // The url names the session, so opening a link to one switches this device to it. Without
    // it a bookmarked staging area would show whatever the phone happened to be filling.
    useEffect(() => {
        if (session !== undefined && session !== active?.uuid) void choose(session);
    }, [session, active, choose]);

    useShortcuts(
        {
            f: () => {
                if (entries.length > 0) setFiling(true);
            },
            e: () => {
                if (active !== null) setEditing(active);
            },
            s: () => void navigate({ to: "/scan" }),
        },
        editing === undefined && !filing && !shortcutHelpOpen,
    );

    return (
        <RequireAccount>
            {/* The chrome a collection wears: the way back to the shelf above the title, and the
                things this one box can be told underneath it. */}
            <div className={"flex flex-col gap-2"}>
                <Link
                    to={"/scan"}
                    className={"flex items-center gap-1 text-sm text-zinc-500 hover:underline dark:text-zinc-400"}
                >
                    <ChevronLeftIcon className={"size-4"} /> {t("button.back-to-sessions")}
                </Link>
                <HeadingLayout
                    heading={active?.name ?? t("heading.staging")}
                    headingDescription={
                        <span className="flex flex-col gap-3">
                            {active !== null && (
                                <span>
                                    {t("label.summary", {
                                        copies: tg("label.cards", { count: copies, amount: copies }),
                                        stacks: entries.length,
                                    })}
                                </span>
                            )}
                            <span className="flex flex-wrap items-center gap-2">
                                {/* Into *this* box, not into whatever the phone was last pointed
                                    at: the button sits on a session, so it names it. */}
                                <BadgeButton
                                    color="zinc"
                                    className={ACTION_RING}
                                    href={active === null ? "/scan" : "/scan/live/$sessionUuid"}
                                    {...(active === null ? {} : { params: { sessionUuid: active.uuid } })}
                                >
                                    <CameraIcon className="size-3.5" />
                                    {tg("button.start-scanning")}
                                </BadgeButton>
                                {active !== null && (
                                    <>
                                        <BadgeButton
                                            color="zinc"
                                            className={ACTION_RING}
                                            onClick={() => setEditing(active)}
                                        >
                                            <PencilSquareIcon className="size-3.5" />
                                            {tg("button.edit-session")}
                                        </BadgeButton>
                                        <BadgeButton
                                            color="zinc"
                                            className={ACTION_RING}
                                            onClick={() => {
                                                void remove(active.uuid).then(() => navigate({ to: "/scan" }));
                                            }}
                                        >
                                            <TrashIcon className="size-3.5" />
                                            {tg("button.delete-session")}
                                        </BadgeButton>
                                    </>
                                )}
                            </span>
                        </span>
                    }
                    headingChildren={
                        entries.length > 0 ? (
                            <PrimaryButton onClick={() => setFiling(true)}>
                                <ArrowDownTrayIcon className="size-5" />
                                {tg("button.file-session")}
                            </PrimaryButton>
                        ) : undefined
                    }
                >
                    <SessionBufferList />

                    {loading ? (
                        <Text>{t("label.loading-sessions")}</Text>
                    ) : entries.length === 0 ? (
                        <EmptyState
                            title={tg("heading.nothing-scanned")}
                            description={t("description.empty")}
                            action={
                                <PrimaryButton onClick={() => void navigate({ to: "/scan" })}>
                                    {tg("button.start-scanning")}
                                </PrimaryButton>
                            }
                        />
                    ) : (
                        <SessionStackList entries={entries} />
                    )}
                </HeadingLayout>

                <FileIntoCollectionDialog open={filing} onClose={() => setFiling(false)} />

                <SessionDialog
                    session={editing}
                    onClose={() => setEditing(undefined)}
                    onSave={async (draft) => {
                        if (editing) await update(editing.uuid, draft);
                    }}
                    onDelete={editing ? async () => void (await remove(editing.uuid)) : undefined}
                />
            </div>
        </RequireAccount>
    );
}
