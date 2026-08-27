import {
    Button,
    Checkbox,
    CheckboxField,
    Description,
    Dialog,
    DialogActions,
    DialogBody,
    DialogDescription,
    DialogTitle,
    Field,
    Input,
    Label,
    ProgressBar,
    Strong,
    Text,
    Textarea,
    notify,
} from "components";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { parseDecklist } from "src/utils/decklist";
import type { DecklistRow } from "src/utils/decklist";
import { importRows } from "src/utils/deck-import";

/** How many card names the summary lists before it stops */
const REPORT_LIMIT = 8;

/**
 * The properties for {@link ImportDeckDialog}
 */
export type ImportDeckDialogProps = {
    /** Whether the dialog is on screen */
    open: boolean;
    /** The deck being filled */
    deckUuid: string;
    /** Closes the dialog */
    onClose: () => void;
    /** Called after cards were written, so the page can reload */
    onImported: () => Promise<void> | void;
};

/**
 * Filling a deck from a decklist or from a link to one.
 *
 * Both ways end in the same place: the cards are placed in the service's own
 * catalog and written in one request. What the catalog cannot place is reported
 * rather than dropped quietly.
 *
 * @returns the dialog
 */
export function ImportDeckDialog({ open, deckUuid, onClose, onImported }: ImportDeckDialogProps) {
    const [t] = useTranslation("deck");
    const [tg] = useTranslation();

    const [text, setText] = useState("");
    const [url, setUrl] = useState("");
    const [replace, setReplace] = useState(false);
    const [intoCollection, setIntoCollection] = useState(false);
    const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
    const [unmatched, setUnmatched] = useState<Array<string>>([]);

    const parsed = parseDecklist(text);
    const copies = parsed.rows.reduce((sum, row) => sum + row.quantity, 0);
    const busy = progress !== null;

    /**
     * Writes the rows and reports what came of it
     *
     * @param rows the cards to write
     */
    async function write(rows: Array<DecklistRow>) {
        setUnmatched([]);
        setProgress({ done: 0, total: rows.length });

        try {
            const outcome = await importRows(deckUuid, rows, {
                replace,
                intoCollection,
                onProgress: (done, total) => setProgress({ done, total }),
            });

            setUnmatched(outcome.unmatched);
            if (outcome.added === 0) {
                notify.error(t("toast.import-nothing"));
                return;
            }

            setText("");
            setUrl("");
            notify.success(t("toast.import-done", { cards: outcome.copies }));
            if (outcome.filed > 0) notify.success(t("toast.import-filed", { cards: outcome.filed }));
            await onImported();
            if (outcome.unmatched.length === 0) onClose();
        } finally {
            setProgress(null);
        }
    }

    /**
     * Reads the deck behind the link and writes it
     */
    async function fromUrl() {
        setProgress({ done: 0, total: 0 });
        let read;
        try {
            read = await Api.decks.readUrl(url.trim());
        } finally {
            setProgress(null);
        }

        await write(
            read.cards.map((card) => ({
                quantity: card.quantity,
                name: card.name,
                ...(card.set_code == null ? {} : { setCode: card.set_code }),
                ...(card.collector_number == null ? {} : { collectorNumber: card.collector_number }),
                ...(card.foil ? { foil: true } : {}),
                zone: card.zone,
            })),
        );
    }

    return (
        <Dialog open={open} onClose={onClose} size={"2xl"}>
            <DialogTitle>{t("heading.import")}</DialogTitle>
            <DialogDescription>{t("description.import")}</DialogDescription>
            <DialogBody>
                <div className={"flex flex-col gap-5"}>
                    <Field>
                        <Label>{t("label.import-url")}</Label>
                        <div className={"flex flex-col gap-2 sm:flex-row"}>
                            <Input
                                type={"url"}
                                value={url}
                                placeholder={"https://moxfield.com/decks/…"}
                                onChange={(event) => setUrl(event.target.value)}
                                className={"min-w-0 sm:flex-1"}
                            />
                            <Button outline={true} disabled={url.trim() === "" || busy} onClick={() => void fromUrl()}>
                                {t("button.import-url")}
                            </Button>
                        </div>
                        <Description>{t("description.import-url")}</Description>
                    </Field>

                    <Field>
                        <Label>{t("label.import-list")}</Label>
                        <Textarea
                            rows={10}
                            value={text}
                            placeholder={"4 Lightning Bolt (2ED) 162\n1 Sol Ring\n\nSideboard\n2 Duress"}
                            onChange={(event) => setText(event.target.value)}
                            className={"font-mono"}
                        />
                        {parsed.rows.length > 0 && (
                            <Description>
                                {t("description.import-read", { cards: copies, rows: parsed.rows.length })}
                                {parsed.unreadable.length > 0 &&
                                    ` ${t("description.import-unreadable", { count: parsed.unreadable.length })}`}
                            </Description>
                        )}
                    </Field>

                    <CheckboxField>
                        <Checkbox checked={replace} onChange={setReplace} />
                        <Label>{t("label.import-replace")}</Label>
                    </CheckboxField>

                    <CheckboxField>
                        <Checkbox checked={intoCollection} onChange={setIntoCollection} />
                        <Label>{t("label.import-into-collection")}</Label>
                        <Description>{t("description.import-into-collection")}</Description>
                    </CheckboxField>

                    {busy && (
                        <div className={"flex flex-col gap-1"}>
                            <ProgressBar progress={progress.total === 0 ? 0 : (progress.done / progress.total) * 100} />
                            <Text className={"text-xs"}>{t("label.import-resolving")}</Text>
                        </div>
                    )}

                    {unmatched.length > 0 && (
                        <div className={"flex flex-col gap-1"}>
                            <Strong>{t("description.import-unmatched", { count: unmatched.length })}</Strong>
                            <Text className={"text-xs"}>
                                {unmatched.slice(0, REPORT_LIMIT).join(", ")}
                                {unmatched.length > REPORT_LIMIT && " …"}
                            </Text>
                        </div>
                    )}
                </div>
            </DialogBody>
            <DialogActions>
                <Button plain onClick={onClose}>
                    {tg("button.cancel")}
                </Button>
                <Button disabled={parsed.rows.length === 0 || busy} onClick={() => void write(parsed.rows)}>
                    {t("button.import")}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
