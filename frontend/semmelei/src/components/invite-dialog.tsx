import { QRCodeSVG } from "qrcode.react";
import React from "react";
import { useTranslation } from "react-i18next";
import {
    Button,
    CopyButton,
    Dialog,
    DialogActions,
    DialogBody,
    DialogDescription,
    DialogTitle,
    Text,
} from "components";

/**
 * The properties for {@link InviteDialog}
 */
export type InviteDialogProps = {
    /** The link to show; the dialog is closed while unset */
    link?: string;
    /** Close the dialog */
    onClose: () => void;
};

/**
 * Dialog showing a freshly created registration link (+ QR for phones)
 *
 * @param props {@link InviteDialogProps}
 *
 * @returns the dialog
 */
export function InviteDialog(props: InviteDialogProps) {
    const [t] = useTranslation("admin");
    const [tg] = useTranslation();
    return (
        <Dialog open={props.link !== undefined} onClose={props.onClose} size={"md"}>
            <DialogTitle>{t("heading.invite")}</DialogTitle>
            <DialogDescription>{t("description.invite")}</DialogDescription>
            <DialogBody>
                <div className={"flex flex-col items-center gap-4"}>
                    {props.link && (
                        <div className={"rounded-lg bg-white p-3"}>
                            <QRCodeSVG value={props.link} size={180} />
                        </div>
                    )}
                    <div className={"flex w-full items-center gap-2"}>
                        <Text className={"break-all"}>{props.link}</Text>
                        <CopyButton value={props.link ?? ""} label={t("accessibility.copy-invite")} />
                    </div>
                </div>
            </DialogBody>
            <DialogActions>
                <Button plain onClick={props.onClose}>
                    {tg("button.close")}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
