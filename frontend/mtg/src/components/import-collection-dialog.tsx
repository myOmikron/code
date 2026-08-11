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
import { Api } from "src/api/api";
import type { CollectionEntryResponse, NewCollectionEntry } from "src/api/generated";
import { parseCollectionCsv } from "src/utils/csv-import";
import type { ImportFile } from "src/utils/csv-import";
import { resolveIdentifiers } from "src/utils/scryfall";
import type { CardIdentifier } from "src/utils/scryfall";

/**
 * How many stacks go into one request.
 *
 * The server writes a request as one bulk insert, so this is about keeping the
 * body a sensible size rather than about the database — a whole binder at once
 * would be megabytes.
 */
const CHUNK_SIZE = 1000;

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
    /** Names Scryfall could not place */
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
    /** What is already filed, so an existing stack is topped up instead of duplicated */
    entries: CollectionEntryResponse[];
    /** Closes the dialog */
    onClose: () => void;
    /** Called after cards were filed, so the page can reload */
    onImported: () => Promise<void> | void;
};

/**
 * Files a collection exported from another tracker.
 *
 * The whole thing runs in the browser: the file is read here, the cards are
 * resolved against Scryfall here, and only the finished stacks go to the
 * server. That keeps a format nobody controls out of the backend, and it means
 * the user sees what was understood before anything is written.
 *
 * @returns the dialog
 */
export function ImportCollectionDialog({
    open,
    collectionUuid,
    entries,
    onClose,
    onImported,
}: ImportCollectionDialogProps) {
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
     * Resolves every row against Scryfall and files what came back.
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
            const printings = await resolveIdentifiers(
                parsed.rows.map((row): CardIdentifier => {
                    if (row.scryfallId !== "") return { kind: "id", id: row.scryfallId };
                    if (row.setCode !== "" && row.collectorNumber !== "") {
                        return { kind: "coordinate", setCode: row.setCode, collectorNumber: row.collectorNumber };
                    }
                    return { kind: "named", name: row.name, setCode: row.setCode };
                }),
                (done, total) => setProgress(Math.round((done / total) * 100)),
            );

            const stacks = new Map<string, NewCollectionEntry>();
            const unmatched: string[] = [];
            let cards = 0;

            parsed.rows.forEach((row, index) => {
                const printing = printings[index];
                if (printing === null || printing === undefined) {
                    if (!unmatched.includes(row.name)) unmatched.push(row.name);
                    return;
                }

                cards += row.quantity;
                const key = `${printing.id}|${row.condition}|${row.finish}`;
                const existing = stacks.get(key);
                if (existing !== undefined) {
                    existing.quantity += row.quantity;
                    return;
                }
                stacks.set(key, {
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
            const fresh: NewCollectionEntry[] = [];
            const topUps: Array<{ uuid: string; quantity: number }> = [];
            for (const stack of stacks.values()) {
                const already = entries.find(
                    (entry) =>
                        entry.printing === stack.printing &&
                        entry.condition === stack.condition &&
                        entry.finish === stack.finish,
                );
                if (already === undefined) fresh.push(stack);
                else topUps.push({ uuid: already.uuid, quantity: already.quantity + stack.quantity });
            }

            for (let offset = 0; offset < fresh.length; offset += CHUNK_SIZE) {
                await Api.collections.entries.add(collectionUuid, fresh.slice(offset, offset + CHUNK_SIZE));
            }
            for (const topUp of topUps) {
                await Api.collections.entries.update(collectionUuid, topUp.uuid, { quantity: topUp.quantity });
            }

            setResult({ created: fresh.length, merged: topUps.length, cards, unmatched });
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
