import { Button, Dialog, DialogActions, DialogBody, DialogTitle, Text } from "components";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import type { MatchLifeHistoryResponse, MatchLifeConflictSummary } from "src/api/generated";
import { LifeHistoryView } from "src/components/life-history-view";
import { fromMatchLifeHistory } from "src/utils/durable-match-life";
import type { LifeHistory } from "src/utils/life-history";
import type { useDurableMatchLife } from "src/utils/use-durable-match-life";

/** Explicit online recording transfer and separate inspection of recovered branches. */
export function MatchLifeHandover({
    tournament,
    played,
    durable,
    playable,
    open,
    onClose,
}: {
    tournament: string;
    played: string;
    durable: ReturnType<typeof useDurableMatchLife>;
    playable: boolean;
    open: boolean;
    onClose: () => void;
}) {
    const [t] = useTranslation("tournament");
    const [view, setView] = useState<"devices" | "confirm" | "list" | "branch">("devices");
    const [confirmed, setConfirmed] = useState<MatchLifeHistoryResponse | null>(null);
    const [conflicts, setConflicts] = useState<MatchLifeConflictSummary[]>([]);
    const [branch, setBranch] = useState<LifeHistory | null>(null);
    const [busy, setBusy] = useState(false);
    const [failed, setFailed] = useState(false);
    const perform = async (action: () => Promise<void>) => {
        setBusy(true);
        setFailed(false);
        try {
            await action();
        } catch {
            setFailed(true);
        } finally {
            setBusy(false);
        }
    };
    return (
        <>
            <Dialog
                open={open}
                onClose={() => {
                    setView("devices");
                    onClose();
                }}
                size="lg"
            >
                <DialogTitle>
                    {t(
                        view === "confirm"
                            ? "heading.life-takeover"
                            : view === "branch"
                              ? "heading.life-recovered-branch"
                              : view === "list"
                                ? "heading.life-recovered-list"
                                : "heading.life-recording-devices",
                    )}
                </DialogTitle>
                <DialogBody>
                    <div className="space-y-4">
                        {view === "devices" && (
                            <>
                                {!durable.canRequest && <Text>{t("error.life-handover-network")}</Text>}
                                {durable.recording?.snapshot().ownershipKind === "takeover" &&
                                    !durable.recording.snapshot().claimAccepted &&
                                    durable.state === "conflict" && (
                                        <Text role="alert">{t("description.life-takeover-changed")}</Text>
                                    )}
                                {durable.writer && playable && (
                                    <Button
                                        outline
                                        disabled={busy}
                                        onClick={() =>
                                            void perform(async () => {
                                                await durable.transfer();
                                            })
                                        }
                                    >
                                        {t("button.life-transfer-recording")}
                                    </Button>
                                )}
                                {durable.transferring && (
                                    <>
                                        <Text>{t("description.life-transferring")}</Text>
                                        <Button outline disabled={busy} onClick={durable.retry}>
                                            {t("button.retry-life-history-save")}
                                        </Button>
                                        {!durable.recording?.snapshot().release && (
                                            <Button plain onClick={durable.cancelTransfer}>
                                                {t("button.life-cancel-transfer")}
                                            </Button>
                                        )}
                                    </>
                                )}
                                {!durable.writer && !durable.transferring && (
                                    <Text>{t("description.life-transfer-instructions")}</Text>
                                )}
                                {!durable.writer &&
                                    !durable.transferring &&
                                    durable.remote?.writer != null &&
                                    playable && (
                                        <Button
                                            outline
                                            disabled={
                                                busy || Boolean(durable.conflictLocal && !durable.capturedConflict)
                                            }
                                            onClick={() =>
                                                void perform(async () => {
                                                    const saved = await durable.savedState();
                                                    if (saved?.writer != null) {
                                                        setConfirmed(saved);
                                                        setView("confirm");
                                                    } else setFailed(true);
                                                })
                                            }
                                        >
                                            {t("button.life-unavailable-phone")}
                                        </Button>
                                    )}
                                {durable.conflictLocal && (
                                    <>
                                        <Text>
                                            {t(
                                                durable.capturedConflict
                                                    ? "description.life-conflict-captured"
                                                    : "description.life-conflict-local",
                                            )}
                                        </Text>
                                        <Button
                                            outline
                                            onClick={() => {
                                                setBranch(durable.conflictLocal);
                                                setView("branch");
                                            }}
                                        >
                                            {t("button.life-view-local-branch")}
                                        </Button>
                                        {!durable.capturedConflict && (
                                            <Button outline onClick={durable.retry}>
                                                {t("button.retry-life-history-save")}
                                            </Button>
                                        )}
                                    </>
                                )}
                                <Button
                                    outline
                                    disabled={busy || !durable.canRequest}
                                    onClick={() =>
                                        void perform(async () => {
                                            const result = await Api.tournaments.lifeHistory.conflicts(
                                                tournament,
                                                played,
                                            );
                                            setConflicts(result.conflicts);
                                            setView("list");
                                        })
                                    }
                                >
                                    {t("button.life-view-recovered")}
                                </Button>
                            </>
                        )}
                        {view === "confirm" && confirmed && (
                            <>
                                <Text>{t("description.life-confirm-unavailable")}</Text>
                                <Text>
                                    {t("label.life-last-upload", {
                                        time: confirmed.updated_at
                                            ? new Date(confirmed.updated_at).toLocaleString()
                                            : t("label.life-no-upload"),
                                    })}
                                </Text>
                                {confirmed.history ? (
                                    <LifeHistoryView history={fromMatchLifeHistory(confirmed.history)} />
                                ) : (
                                    <Text>{t("description.life-history-empty")}</Text>
                                )}
                                <Button
                                    color="red"
                                    disabled={busy}
                                    onClick={() =>
                                        void perform(async () => {
                                            await durable.takeover(confirmed);
                                            setView("devices");
                                        })
                                    }
                                >
                                    {t("button.life-confirm-takeover")}
                                </Button>
                            </>
                        )}
                        {view === "list" && (
                            <>
                                {conflicts.length === 0 && <Text>{t("description.life-no-conflicts")}</Text>}
                                {conflicts.map((item) => (
                                    <Button
                                        key={item.id}
                                        outline
                                        disabled={busy}
                                        onClick={() =>
                                            void perform(async () => {
                                                const result = await Api.tournaments.lifeHistory.conflict(
                                                    tournament,
                                                    played,
                                                    item.id,
                                                );
                                                setBranch(fromMatchLifeHistory(result.history));
                                                setView("branch");
                                            })
                                        }
                                    >
                                        {new Date(item.captured_at).toLocaleString()}
                                    </Button>
                                ))}
                            </>
                        )}
                        {view === "branch" && (
                            <>
                                <Text>{t("description.life-branch-independent")}</Text>
                                {branch && <LifeHistoryView history={branch} />}
                            </>
                        )}
                        {failed && <Text role="alert">{t("error.life-handover-network")}</Text>}
                    </div>
                </DialogBody>
                <DialogActions>
                    {view !== "devices" && (
                        <Button plain onClick={() => setView("devices")}>
                            {t("button.life-recording-devices")}
                        </Button>
                    )}
                    <Button
                        onClick={() => {
                            setView("devices");
                            onClose();
                        }}
                    >
                        {t("button.life-close-devices")}
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
}
