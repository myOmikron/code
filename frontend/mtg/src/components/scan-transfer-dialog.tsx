import {
    Button,
    Dialog,
    DialogActions,
    DialogBody,
    DialogDescription,
    DialogTitle,
    PrimaryButton,
    ProgressBar,
    Strong,
    Text,
    notify,
} from "components";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { NewCollectionEntry } from "src/api/generated";
import { FINISH_ON_SCRYFALL, finishLabel } from "src/components/card-attribute-badge";
import { fileStacks, foldStacks } from "src/utils/collection-transfer";
import { resolveLookups } from "src/utils/printing-catalog";
import type { ScanSession } from "src/utils/scan-sessions";

/** How many skipped card names the summary lists before it stops */
const REPORT_LIMIT = 8;

/** What a transfer ended up doing */
type TransferSummary = {
    /** Stacks newly filed */
    created: number;
    /** Stacks that already existed and were topped up */
    merged: number;
    /** Copies filed in total */
    cards: number;
    /** What stayed in the session, and why */
    skipped: Array<{ name: string; reason: string }>;
};

/**
 * The properties for {@link ScanTransferDialog}
 */
export type ScanTransferDialogProps = {
    /** Whether the dialog is on screen */
    open: boolean;
    /** The session being transferred; its target must be set */
    session: ScanSession;
    /** Called with the entries the collection took, so the session can drop exactly them */
    onTransferred: (entryIds: string[]) => void;
    /** Closes the dialog */
    onClose: () => void;
};

/**
 * Files a session's scans into its target collection.
 *
 * Every entry is placed by the service's own card catalog first — the scanner index's ids are not
 * necessarily printing ids the backend knows. Entries the catalog cannot place, and entries whose
 * chosen finish the printing was never produced in, are skipped *and stay in the session* for
 * correction; everything else is folded into stacks and filed, topping up rows the collection
 * already holds.
 *
 * @returns the dialog
 */
export function ScanTransferDialog({ open, session, onTransferred, onClose }: ScanTransferDialogProps) {
    const [t] = useTranslation("session");
    const [tg] = useTranslation();

    const [busy, setBusy] = useState(false);
    const [progress, setProgress] = useState(0);
    const [result, setResult] = useState<TransferSummary | null>(null);

    /**
     * Closes the dialog and forgets the result, so the next open starts clean
     */
    function close() {
        setResult(null);
        setProgress(0);
        onClose();
    }

    /**
     * Resolves, validates and files everything the session holds
     */
    async function run() {
        const target = session.target;
        if (target === null) return;
        setBusy(true);
        setProgress(0);

        try {
            const entries = session.entries;
            const printings = await resolveLookups(
                entries.map((entry) => ({
                    id: entry.card.id,
                    set_code: entry.card.setCode,
                    collector_number: entry.card.collectorNumber,
                    name: entry.card.name,
                    // Set and collector number are shared across languages; the
                    // language is what picks the exact printing when the id alone
                    // cannot (multi-face index ids are not printing ids).
                    lang: entry.card.lang,
                })),
                (done, total) => setProgress(Math.round((done / total) * 100)),
            );

            const valid: NewCollectionEntry[] = [];
            const validIds: string[] = [];
            const skipped: TransferSummary["skipped"] = [];
            entries.forEach((entry, index) => {
                const printing = printings[index];
                if (printing === null || printing === undefined) {
                    skipped.push({ name: entry.card.name, reason: t("label.skip-unresolved") });
                    return;
                }
                if (!printing.finishes.includes(FINISH_ON_SCRYFALL[entry.finish])) {
                    skipped.push({
                        name: entry.card.name,
                        reason: t("label.skip-finish", { finish: finishLabel(tg, entry.finish) }),
                    });
                    return;
                }
                valid.push({
                    printing: printing.id,
                    quantity: entry.quantity,
                    condition: entry.condition,
                    finish: entry.finish,
                    purchase_price_cents: entry.purchasePriceCents,
                    acquired_at: entry.acquiredAt,
                });
                validIds.push(entry.id);
            });

            const cards = valid.reduce((sum, entry) => sum + entry.quantity, 0);
            // Not atomic (see `fileStacks`): on a thrown error nothing is removed from the session,
            // so a mid-run failure may have filed a chunk that a retry files again. The error is
            // reported and the retry left to the user rather than done silently.
            const { created, merged } =
                valid.length > 0 ? await fileStacks(target.uuid, foldStacks(valid)) : { created: 0, merged: 0 };

            onTransferred(validIds);
            setResult({ created, merged, cards, skipped });
        } catch (error) {
            console.error("Transfer failed", error);
            notify.error(t("toast.transfer-failed"));
        } finally {
            setBusy(false);
        }
    }

    return (
        <Dialog open={open} onClose={close} size="lg">
            <DialogTitle>{t("heading.transfer")}</DialogTitle>
            {result === null && session.target !== null && (
                <DialogDescription>
                    {t("description.transfer", {
                        cards: tg("label.cards", { count: session.entries.length, amount: session.entries.length }),
                        target: session.target.name,
                    })}
                </DialogDescription>
            )}
            <DialogBody className="flex flex-col gap-4">
                {busy && (
                    <div className="flex flex-col gap-2">
                        <Text className="text-xs">{t("label.transfer-progress")}</Text>
                        <ProgressBar progress={progress} />
                    </div>
                )}

                {result !== null && (
                    <div className="flex flex-col gap-2">
                        <Strong>
                            {t("description.transfer-done", {
                                cards: result.cards,
                                created: result.created,
                                merged: result.merged,
                            })}
                        </Strong>
                        {result.skipped.length > 0 && (
                            <Text className="text-xs">
                                {t("description.transfer-skipped", {
                                    count: result.skipped.length,
                                    names: result.skipped
                                        .slice(0, REPORT_LIMIT)
                                        .map((skip) => `${skip.name} (${skip.reason})`)
                                        .join(", "),
                                })}
                            </Text>
                        )}
                    </div>
                )}
            </DialogBody>
            <DialogActions>
                <Button plain onClick={close} disabled={busy}>
                    {result === null ? tg("button.cancel") : tg("button.close")}
                </Button>
                {result === null && (
                    <PrimaryButton
                        disabled={busy || session.target === null || session.entries.length === 0}
                        onClick={() => void run()}
                    >
                        {t("button.transfer")}
                    </PrimaryButton>
                )}
            </DialogActions>
        </Dialog>
    );
}
