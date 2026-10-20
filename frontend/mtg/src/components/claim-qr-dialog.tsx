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
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { InlineError } from "src/components/inline-error";

/** QR size in pixels, for a phone camera held close */
const QR_SIZE = 220;

/** Which row a {@link ClaimQrDialog} is open on */
export type ClaimQrDialogParticipant = {
    /** The participant row the token belongs to */
    uuid: string;
    /** Shown in the dialog's title and description */
    display_name: string;
};

/**
 * The properties for {@link ClaimQrDialog}
 */
export type ClaimQrDialogProps = {
    /** Whether the dialog is on screen */
    open: boolean;
    /** The tournament the participant belongs to */
    tournamentUuid: string;
    /** The walk-in row to hand a claim QR out for */
    participant: ClaimQrDialogParticipant;
    /** Called when the dialog should close */
    onClose: () => void;
};

/**
 * The QR that lets a walk-in take over their guest row on their own phone (`/join/claim/{token}`)
 *
 * The token is a bearer credential, so it is fetched on every open and never cached.
 *
 * @returns the dialog
 */
export function ClaimQrDialog({ open, tournamentUuid, participant, onClose }: ClaimQrDialogProps) {
    const [t] = useTranslation("tournament");
    const [tg] = useTranslation();

    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState<string | undefined>();
    const [claimToken, setClaimToken] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        setLoading(true);
        setLoadError(undefined);
        setClaimToken(null);

        let cancelled = false;
        Api.tournaments.participants
            .claimToken(tournamentUuid, participant.uuid)
            .then(
                (result) => {
                    if (!cancelled) setClaimToken(result.claim_token ?? null);
                },
                (error) => {
                    if (cancelled) return;
                    console.error(error);
                    setLoadError(t("error.action-failed"));
                },
            )
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [open, tournamentUuid, participant.uuid, t]);

    const claimUrl = claimToken !== null ? `${window.location.origin}/join/claim/${claimToken}` : "";

    return (
        <Dialog open={open} onClose={onClose} size={"sm"}>
            <DialogTitle>{t("heading.claim-qr", { name: participant.display_name })}</DialogTitle>
            <DialogDescription>{t("description.claim-qr", { name: participant.display_name })}</DialogDescription>
            <DialogBody>
                {loading ? (
                    <Text>{t("label.loading")}</Text>
                ) : loadError !== undefined ? (
                    <InlineError>{loadError}</InlineError>
                ) : claimToken === null ? (
                    <Text>{t("label.claim-token-none")}</Text>
                ) : (
                    <div className={"flex flex-col items-center gap-4"}>
                        {/* White plate: a QR on the dark theme's ground does not scan. */}
                        <div className={"rounded-lg bg-white p-4"}>
                            <QRCodeSVG value={claimUrl} size={QR_SIZE} />
                        </div>
                        <div className={"flex w-full items-center gap-2"}>
                            <span className={"min-w-0 flex-1 text-sm break-all text-zinc-500 dark:text-zinc-400"}>
                                {claimUrl}
                            </span>
                            <CopyButton value={claimUrl} label={t("accessibility.copy-claim-link")} />
                        </div>
                    </div>
                )}
            </DialogBody>
            <DialogActions>
                <Button plain onClick={onClose}>
                    {tg("button.close")}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
