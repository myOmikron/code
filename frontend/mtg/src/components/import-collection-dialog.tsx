import {
    Button,
    Dialog,
    DialogActions,
    DialogBody,
    DialogDescription,
    DialogTitle,
    FileInput,
    ProgressBar,
    Strong,
    Text,
    notify,
} from "components";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { NewCollectionEntry } from "src/api/generated";
import { fileStacks, foldStacks } from "src/utils/collection-transfer";
import { parseCollectionCsv } from "src/utils/csv-import";
import type { ImportFile } from "src/utils/csv-import";
import { resolveLookups } from "src/utils/printing-catalog";

/** How many unmatched card names the summary lists before it stops */
const REPORT_LIMIT = 8;

/** What an import ended up doing */
type ImportResult = {
    /** Stacks newly filed */
    created: number;
    /** Stacks that already existed and were topped up */
    merged: number;
    /** Copies added in total */
    cards: number;
    /** Names the catalog could not place */
    unmatched: string[];
};

/**
 * The properties for {@link ImportCollectionDialog}
 */
export type ImportCollectionDialogProps = {
    /** Whether the dialog is on screen */
    open: boolean;
    /** The collection being filled */
    collectionUuid: string;
    /** Closes the dialog */
    onClose: () => void;
    /** Called after cards were filed, so the page can reload */
    onImported: () => Promise<void> | void;
};

/**
 * Files a collection exported from another tracker.
 *
 * The file is read here and never leaves the browser as a file: a format nobody
 * controls stays out of the backend, and what was understood is on screen
 * before anything is written. What the rows name is placed by the service's own
 * card catalog, which is the same one the list and the statistics are answered
 * from — so nothing can be filed that the rest of the app cannot show.
 *
 * @returns the dialog
 */
export function ImportCollectionDialog({ open, collectionUuid, onClose, onImported }: ImportCollectionDialogProps) {
    const [t] = useTranslation("collection");
    const [tg] = useTranslation();

    const [parsed, setParsed] = useState<ImportFile | null>(null);
    const [busy, setBusy] = useState(false);
    const [progress, setProgress] = useState(0);
    const [result, setResult] = useState<ImportResult | null>(null);

    /**
     * Closes the dialog and forgets the file, so the next open starts clean
     */
    function close() {
        setParsed(null);
        setResult(null);
        setProgress(0);
        onClose();
    }

    /**
     * Reads the picked file
     *
     * @param file the file, or nothing when the picker was cleared
     */
    async function read(file: File | undefined) {
        setResult(null);
        if (file === undefined) {
            setParsed(null);
            return;
        }
        setParsed(parseCollectionCsv(await file.text()));
    }

    /**
     * Places every row in the catalog and files what came back.
     *
     * Rows describing the same printing in the same condition and finish are
     * added up first: an export lists a playset as four lines as often as one,
     * and either way it is one stack in one box.
     */
    async function run() {
        if (parsed === null) return;
        setBusy(true);
        setProgress(0);

        try {
            // Everything a row says about which card it is goes along; the
            // catalog decides how much of it it needs. An id names one
            // printing, a set with a collector number names one card, a name
            // alone leaves the choice of printing to the catalog.
            const printings = await resolveLookups(
                parsed.rows.map((row) => ({
                    id: row.scryfallId !== "" ? row.scryfallId : undefined,
                    set_code: row.setCode !== "" ? row.setCode : undefined,
                    collector_number: row.collectorNumber !== "" ? row.collectorNumber : undefined,
                    name: row.name !== "" ? row.name : undefined,
                })),
                (done, total) => setProgress(Math.round((done / total) * 100)),
            );

            const entries: NewCollectionEntry[] = [];
            const unmatched: string[] = [];
            let cards = 0;

            parsed.rows.forEach((row, index) => {
                const printing = printings[index];
                if (printing === null || printing === undefined) {
                    if (!unmatched.includes(row.name)) unmatched.push(row.name);
                    return;
                }

                cards += row.quantity;
                entries.push({
                    printing: printing.id,
                    quantity: row.quantity,
                    condition: row.condition,
                    finish: row.finish,
                    purchase_price_cents: row.purchasePriceCents,
                    acquired_at: row.acquiredAt,
                });
            });

            // A stack already in the collection is topped up rather than filed
            // a second time — the same pile of cards written down twice is not
            // what anyone means by importing a list.
            const { created, merged } = await fileStacks(collectionUuid, foldStacks(entries));

            setResult({ created, merged, cards, unmatched });
            await onImported();
        } catch (error) {
            console.error("Import failed", error);
            notify.error(t("toast.import-failed"));
        } finally {
            setBusy(false);
        }
    }

    return (
        <Dialog open={open} onClose={close} size={"2xl"}>
            <DialogTitle>{t("heading.import")}</DialogTitle>
            <DialogDescription>{t("description.import")}</DialogDescription>
            <DialogBody className={"flex flex-col gap-4"}>
                <FileInput
                    accept={".csv,text/csv,text/plain"}
                    disabled={busy}
                    onChange={(event) => void read(event.target.files?.[0])}
                />

                {parsed !== null && result === null && (
                    <Text>
                        {parsed.rows.length === 0
                            ? t("description.import-nothing-read", { columns: parsed.headers.join(", ") })
                            : t("description.import-read", { rows: parsed.rows.length, skipped: parsed.skipped })}
                    </Text>
                )}

                {busy && (
                    <div className={"flex flex-col gap-2"}>
                        <Text className={"text-xs"}>{t("label.import-resolving")}</Text>
                        <ProgressBar progress={progress} />
                    </div>
                )}

                {result !== null && (
                    <div className={"flex flex-col gap-2"}>
                        <Strong>
                            {t("description.import-done", {
                                cards: result.cards,
                                created: result.created,
                                merged: result.merged,
                            })}
                        </Strong>
                        {result.unmatched.length > 0 && (
                            <Text className={"text-xs"}>
                                {t("description.import-unmatched", {
                                    count: result.unmatched.length,
                                    names: result.unmatched.slice(0, REPORT_LIMIT).join(", "),
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
                    <Button
                        color={"blue"}
                        disabled={busy || parsed === null || parsed.rows.length === 0}
                        onClick={() => void run()}
                    >
                        {t("button.import")}
                    </Button>
                )}
            </DialogActions>
        </Dialog>
    );
}
