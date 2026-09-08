import { ArrowDownTrayIcon, ClipboardDocumentIcon } from "@heroicons/react/20/solid";
import {
    Button,
    Description,
    Dialog,
    DialogActions,
    DialogBody,
    DialogDescription,
    DialogTitle,
    Field,
    Label,
    Select,
    Switch,
    SwitchField,
    Text,
    Textarea,
} from "components";
import { useTranslation } from "react-i18next";
import { ExternalLinkRow } from "src/components/external-link-row";
import { MPC_FILL_URL } from "src/utils/mpcfill";
import { MPC_STOCKS, mpcFoilable } from "src/utils/mpcfill-xml";
import type { MpcStock } from "src/utils/mpcfill-xml";

/**
 * The properties for {@link MpcFillOrderDialog}
 */
export type MpcFillOrderDialogProps = {
    /** Whether the dialog is on screen */
    open: boolean;
    /** What the order is printed on */
    stock: MpcStock;
    /** Changes that */
    onStock: (stock: MpcStock) => void;
    /** Whether it is printed with a foil finish */
    foil: boolean;
    /** Changes that */
    onFoil: (foil: boolean) => void;
    /** The order's cards as MPCFill's text import reads them */
    list: string;
    /** Whether the order can be written at all — nothing is picked yet, or nothing is on it */
    ready: boolean;
    /** Hands the order file to the browser */
    onDownload: () => void;
    /** Puts the text list on the clipboard */
    onCopyList: () => void;
    /** Closes the dialog */
    onClose: () => void;
};

/**
 * How the order is printed, and the two ways it leaves here.
 *
 * The choices that hold for the whole order rather than for one card:
 * cardstock and finish are what MakePlayingCards charges by, and they cannot be
 * decided per card even though the file has a place for them per order.
 *
 * The text list lives here too, as the second way out: it carries the names and
 * no artwork, which is what somebody wants who would rather pick the art in
 * MPCFill's own editor.
 *
 * @returns the dialog
 */
export function MpcFillOrderDialog({
    open,
    stock,
    onStock,
    foil,
    onFoil,
    list,
    ready,
    onDownload,
    onCopyList,
    onClose,
}: MpcFillOrderDialogProps) {
    const [t] = useTranslation("game-utils");
    const [tg] = useTranslation();

    return (
        <Dialog open={open} onClose={onClose} size={"2xl"}>
            <DialogTitle>{t("heading.order-file")}</DialogTitle>
            <DialogDescription>{t("description.import-xml")}</DialogDescription>
            <DialogBody>
                <div className={"flex flex-col gap-5"}>
                    <Field>
                        <Label>{t("label.stock")}</Label>
                        <Select value={stock} onChange={(event) => onStock(event.target.value as MpcStock)}>
                            {MPC_STOCKS.map((entry) => (
                                <option key={entry} value={entry}>
                                    {entry}
                                </option>
                            ))}
                        </Select>
                    </Field>

                    <SwitchField disabled={!mpcFoilable(stock)}>
                        <Label>{t("label.foil")}</Label>
                        <Description>
                            {mpcFoilable(stock) ? t("description.foil") : t("description.foil-impossible")}
                        </Description>
                        <Switch
                            color={"blue"}
                            checked={foil && mpcFoilable(stock)}
                            onChange={onFoil}
                            disabled={!mpcFoilable(stock)}
                        />
                    </SwitchField>

                    <Field>
                        <Label>{t("label.card-list")}</Label>
                        <Description>{t("description.paste-into-mpc-fill")}</Description>
                        <Textarea readOnly value={list} rows={8} className={"font-mono"} />
                    </Field>

                    <div className={"flex flex-wrap gap-2"}>
                        <Button outline={true} onClick={onCopyList}>
                            <ClipboardDocumentIcon />
                            {t("button.copy-list")}
                        </Button>
                        <Button outline={true} disabled={!ready} onClick={onDownload}>
                            <ArrowDownTrayIcon />
                            {t("button.download-xml")}
                        </Button>
                    </div>

                    {!ready && <Text className={"text-xs"}>{t("description.nothing-to-order")}</Text>}

                    <ExternalLinkRow href={MPC_FILL_URL} label={t("button.open-mpc-fill")}>
                        <span className={"text-sm font-medium text-zinc-950 dark:text-white"}>{"MPCFill"}</span>
                    </ExternalLinkRow>
                </div>
            </DialogBody>
            <DialogActions>
                <Button plain={true} onClick={onClose}>
                    {tg("button.close")}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
