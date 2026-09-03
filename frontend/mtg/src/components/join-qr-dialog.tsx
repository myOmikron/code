import { Button, CopyButton, Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from "components";
import { QRCodeSVG } from "qrcode.react";
import { useTranslation } from "react-i18next";
import { displayJoinCode } from "src/components/tournament-join-code";

/** How big the QR renders in the full-screen dialog — a TV or whiteboard shot from across a shop */
const LARGE_QR_SIZE = 320;

/**
 * The properties for {@link JoinQrDialog}
 */
export type JoinQrDialogProps = {
    /** Whether the dialog is on screen */
    open: boolean;
    /** The raw join code, shown in its `XXX-XXX` display form */
    joinCode: string;
    /** The deep link the QR encodes, e.g. `{origin}/join/{CODE}` */
    joinUrl: string;
    /** Called when the dialog should close — the only action this dialog offers */
    onClose: () => void;
};

/**
 * Full-screen-ish version of the join code, meant to be put up on a shop TV or a whiteboard: a
 * large QR, the code in large mono type for anyone typing it by hand, and the URL as a fallback
 * for a screenshot. Read-only — rotating or revoking the code stays on the organizer's card
 * behind this dialog.
 *
 * @returns the dialog
 */
export function JoinQrDialog({ open, joinCode, joinUrl, onClose }: JoinQrDialogProps) {
    const [t] = useTranslation("tournament");
    const [tg] = useTranslation();

    return (
        <Dialog open={open} onClose={onClose} size={"lg"}>
            <DialogTitle>{t("heading.join-qr")}</DialogTitle>
            <DialogDescription>{t("description.join-qr", { origin: window.location.origin })}</DialogDescription>
            <DialogBody>
                <div className={"flex flex-col items-center gap-4"}>
                    {/* White backing plate: a QR rendered straight onto the dark theme's ground
                        does not scan, see `invite-dialog.tsx`. */}
                    <div className={"rounded-lg bg-white p-4"}>
                        <QRCodeSVG value={joinUrl} size={LARGE_QR_SIZE} />
                    </div>
                    <span className={"font-mono text-4xl font-semibold tracking-[0.2em] text-zinc-950 dark:text-white"}>
                        {displayJoinCode(joinCode)}
                    </span>
                    <div className={"flex w-full items-center gap-2"}>
                        <span className={"min-w-0 flex-1 text-sm break-all text-zinc-500 dark:text-zinc-400"}>
                            {joinUrl}
                        </span>
                        <CopyButton value={joinUrl} label={t("accessibility.copy-join-link")} />
                    </div>
                </div>
            </DialogBody>
            <DialogActions>
                <Button plain onClick={onClose}>
                    {tg("button.close")}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
