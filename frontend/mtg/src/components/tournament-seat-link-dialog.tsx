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
import type { ParticipantResponse, TournamentResponse } from "src/api/generated";
import { isFormError } from "src/utils/error";
import { seatLinkErrorKey, seatLinkUrl } from "src/utils/tournament-guest";

/**
 * The properties for {@link TournamentSeatLinkDialog}
 */
export type TournamentSeatLinkDialogProps = {
    /** The Tournament as an Organizer reads it */
    tournament: TournamentResponse;
    /** The Guest to issue a Seat link for; the dialog is closed while `null` */
    participant: ParticipantResponse | null;
    /** Closes the dialog */
    onClose: () => void;
};

/** A Seat link as the dialog shows it, or why it was refused */
type Issued = { link: string } | { error: string };

/**
 * For the Organizers: a single-use Seat link, as a QR code, for a Guest whose device lost its Guest seat.
 *
 * Issued each time the dialog opens; a new link replaces the last.
 *
 * @returns the dialog
 */
export function TournamentSeatLinkDialog({ tournament, participant, onClose }: TournamentSeatLinkDialogProps) {
    const [t] = useTranslation("tournament");
    const [tg] = useTranslation();
    const [issued, setIssued] = useState<Issued | null>(null);
    const guest = participant?.uuid ?? null;

    useEffect(() => {
        setIssued(null);
        if (guest === null) return;
        let gone = false;
        Api.tournaments.guests
            .seatLink(tournament.uuid, guest)
            .then((result) => {
                if (gone) return;
                setIssued(
                    isFormError(result)
                        ? { error: t(seatLinkErrorKey(result.error)) }
                        : { link: seatLinkUrl(tournament, result.secret) },
                );
            })
            .catch(() => undefined);
        return () => {
            gone = true;
        };
    }, [guest, tournament, t]);

    return (
        <Dialog open={participant !== null} onClose={onClose} size={"md"}>
            <DialogTitle>{t("heading.seat-link", { name: participant?.name ?? "" })}</DialogTitle>
            <DialogDescription>{t("description.seat-link")}</DialogDescription>
            <DialogBody>
                {issued !== null && "error" in issued && <Text>{issued.error}</Text>}
                {issued !== null && "link" in issued && (
                    <div className={"flex flex-col items-center gap-4"}>
                        <div className={"rounded-lg bg-white p-3"}>
                            <QRCodeSVG value={issued.link} size={220} aria-label={t("accessibility.seat-link-qr")} />
                        </div>
                        <div className={"flex w-full min-w-0 items-center gap-2"}>
                            <Text className={"truncate"}>{issued.link}</Text>
                            <CopyButton value={issued.link} label={t("accessibility.copy-seat-link")} />
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
