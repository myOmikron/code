import { ArchiveBoxIcon, ArrowUpTrayIcon, CameraIcon, ChevronLeftIcon, TrashIcon } from "@heroicons/react/20/solid";
import { Link, Navigate, createFileRoute, useNavigate } from "@tanstack/react-router";
import {
    Badge,
    Button,
    EmptyState,
    Heading,
    PrimaryButton,
    StackedList,
    StackedListFlexRow,
    Strong,
    Text,
    notify,
} from "components";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CardImage } from "src/components/card-image";
import { ConditionBadge, FinishBadge } from "src/components/card-attribute-badge";
import { ScanEntryDialog } from "src/components/scan-entry-dialog";
import { ScanTargetPicker } from "src/components/scan-target-picker";
import { ScanTransferDialog } from "src/components/scan-transfer-dialog";
import { useAccount } from "src/context/account.tsx";
import { useScanSessions } from "src/context/scan-sessions-context";
import { sessionValue } from "src/utils/scan-sessions";
import { formatCurrency, printingCoordinate } from "src/utils/format";

export const Route = createFileRoute("/_menu/scan/sessions/$sessionId/")({ component: SessionReviewRoute });

/**
 * Review of one scan session: what it holds, where it goes, and the transfer itself.
 *
 * Entries are listed individually rather than grouped — each one carries its own condition, price
 * and date, and the transfer folds equal ones together anyway. Correcting a single mis-scan is a
 * matter of deleting exactly that row.
 *
 * @returns the page
 */
function SessionReviewRoute() {
    const [t] = useTranslation("session");
    const [tg] = useTranslation();
    const navigate = useNavigate();
    const { sessionId } = Route.useParams();
    const { sessions, deleteSession, setTarget, updateEntry, replaceEntryCard, removeEntry, removeEntries } =
        useScanSessions();
    const me = useAccount();
    const session = sessions.find((candidate) => candidate.id === sessionId);

    const [choosingTarget, setChoosingTarget] = useState(false);
    const [transferring, setTransferring] = useState(false);
    const [editing, setEditing] = useState<string | null>(null);
    const editingEntry = session?.entries.find((entry) => entry.id === editing) ?? null;

    // A stale link, or the session was deleted elsewhere — back to the overview.
    if (session === undefined) return <Navigate to="/scan" replace />;

    /**
     * Closes the transfer dialog and, when the session was emptied, leaves for the collection
     */
    async function closeTransfer() {
        setTransferring(false);
        if (session === undefined || session.entries.length > 0 || session.target === null) return;
        notify.success(t("toast.transferred"));
        await navigate({
            to: "/collections/$collectionUuid/cards",
            params: { collectionUuid: session.target.uuid },
        });
        // After the navigation, so this page's redirect above never races it.
        deleteSession(session.id);
    }

    return (
        <div className={"flex flex-col gap-6"}>
            <div className={"flex flex-col gap-2"}>
                <Link
                    to={"/scan"}
                    className={"flex items-center gap-1 text-sm text-zinc-500 hover:underline dark:text-zinc-400"}
                >
                    <ChevronLeftIcon className={"size-4"} /> {t("button.to-sessions")}
                </Link>
                <div className={"flex flex-wrap items-start justify-between gap-3"}>
                    <div className={"flex flex-col gap-2"}>
                        <Heading>{session.target?.name ?? t("heading.no-target")}</Heading>
                        {session.entries.length > 0 && (
                            <Text>
                                {t("label.summary", {
                                    cards: tg("label.cards", {
                                        count: session.entries.length,
                                        amount: session.entries.length,
                                    }),
                                    value: formatCurrency(sessionValue(session)),
                                })}
                            </Text>
                        )}
                    </div>
                    <div className={"flex flex-wrap items-center gap-2"}>
                        <Button
                            outline
                            onClick={() =>
                                void navigate({ to: "/scan/sessions/$sessionId/scope", params: { sessionId } })
                            }
                        >
                            <CameraIcon className={"size-4"} /> {t("button.continue-scanning")}
                        </Button>
                        <Button outline onClick={() => setChoosingTarget(true)}>
                            <ArchiveBoxIcon className={"size-4"} />
                            {session.target === null ? t("button.choose-target") : t("button.change-target")}
                        </Button>
                        <PrimaryButton
                            disabled={session.target === null || session.entries.length === 0 || me.account === null}
                            title={me.account === null ? t("description.needs-login") : undefined}
                            onClick={() => setTransferring(true)}
                        >
                            <ArrowUpTrayIcon className={"size-4"} /> {t("button.transfer")}
                        </PrimaryButton>
                    </div>
                </div>
            </div>

            {session.entries.length === 0 ? (
                <EmptyState
                    icon={<CameraIcon />}
                    title={tg("heading.nothing-scanned")}
                    description={t("description.empty-session")}
                />
            ) : (
                <StackedList>
                    {session.entries.map((entry) => (
                        <StackedListFlexRow key={entry.id} className={"gap-3"}>
                            <button
                                className={"flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left"}
                                onClick={() => setEditing(entry.id)}
                                aria-label={t("accessibility.edit-entry", { name: entry.card.name })}
                            >
                                <CardImage card={entry.card} className={"h-[67px] w-12 shrink-0 rounded-[5px]"} />
                                <span className={"min-w-0 flex-1"}>
                                    <Strong className={"block truncate"}>{entry.card.name}</Strong>
                                    <Text className={"truncate"}>{entry.card.setName}</Text>
                                    <Text className={"truncate"}>{printingCoordinate(entry.card)}</Text>
                                </span>
                            </button>
                            <div className={"flex shrink-0 items-center gap-2 max-sm:flex-col max-sm:items-end"}>
                                <span className={"flex items-center gap-2"}>
                                    {entry.finish !== "Nonfoil" && <FinishBadge finish={entry.finish} />}
                                    <ConditionBadge condition={entry.condition} />
                                </span>
                                <span className={"flex items-center gap-2"}>
                                    <Badge>×{entry.quantity}</Badge>
                                    <Button
                                        plain
                                        aria-label={t("accessibility.remove-entry", { name: entry.card.name })}
                                        onClick={() => removeEntry(session.id, entry.id)}
                                    >
                                        <TrashIcon className={"size-5"} />
                                    </Button>
                                </span>
                            </div>
                        </StackedListFlexRow>
                    ))}
                </StackedList>
            )}

            <ScanTargetPicker
                open={choosingTarget}
                target={session.target}
                onSelect={(target) => {
                    setTarget(session.id, target);
                    setChoosingTarget(false);
                }}
                onClose={() => setChoosingTarget(false)}
            />

            <ScanEntryDialog
                entry={editingEntry}
                onPatch={(patch) => {
                    if (editingEntry) updateEntry(session.id, editingEntry.id, patch);
                }}
                onReplaceCard={(card) => {
                    if (editingEntry) replaceEntryCard(session.id, editingEntry.id, card);
                }}
                onClose={() => setEditing(null)}
            />

            <ScanTransferDialog
                open={transferring}
                session={session}
                onTransferred={(entryIds) => removeEntries(session.id, entryIds)}
                onClose={() => void closeTransfer()}
            />
        </div>
    );
}
