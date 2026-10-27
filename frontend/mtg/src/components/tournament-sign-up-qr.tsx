import { ArrowsPointingOutIcon } from "@heroicons/react/20/solid";
import { Button, CopyButton, Dialog, DialogActions, DialogBody, DialogTitle, Subheading, Text } from "components";
import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { TournamentResponse } from "src/api/generated";
import { TournamentState, Visibility } from "src/api/generated";
import { tournamentShareLink } from "src/utils/share-link";

/**
 * The link players sign up through: the Tournament's page, or its share link while it is Unlisted
 *
 * @param tournament the Tournament as an Organizer reads it
 * @returns the link, `null` while nobody can sign up by it
 */
export function signUpLink(tournament: TournamentResponse): string | null {
    const open =
        tournament.state === TournamentState.Registration && (tournament.self_sign_up || tournament.guest_sign_up);
    if (!open) return null;
    switch (tournament.visibility) {
        case Visibility.Public:
            return `${window.location.origin}/tournaments/${tournament.uuid}`;
        case Visibility.Unlisted:
            return tournament.share_token == null ? null : tournamentShareLink(tournament.share_token);
        case Visibility.Private:
            return null;
    }
}

/**
 * The properties for {@link TournamentSignUpQr}
 */
export type TournamentSignUpQrProps = {
    /** The Tournament as an Organizer reads it */
    tournament: TournamentResponse;
};

/**
 * For the Organizers: a QR code of the link players sign up through, to show at the desk or on a projector, and
 * the link to copy. Shown while sign-up is open.
 *
 * @returns the code, or nothing while nobody can sign up
 */
export function TournamentSignUpQr({ tournament }: TournamentSignUpQrProps) {
    const [t] = useTranslation("tournament");
    const [tg] = useTranslation();
    const [fullscreen, setFullscreen] = useState(false);
    const link = signUpLink(tournament);
    if (link === null) return null;

    return (
        <section className={"flex flex-col gap-3"}>
            <Subheading>{t("heading.sign-up-qr")}</Subheading>
            <div className={"flex flex-wrap items-center gap-4"}>
                <div className={"shrink-0 rounded-lg bg-white p-3"}>
                    <QRCodeSVG value={link} size={144} aria-label={t("accessibility.sign-up-qr")} />
                </div>
                <div className={"flex min-w-0 flex-1 flex-col gap-2"}>
                    <span className={"flex min-w-0 items-center gap-2"}>
                        <Text className={"truncate"}>{link}</Text>
                        <CopyButton value={link} label={t("accessibility.copy-sign-up-link")} />
                    </span>
                    <div>
                        <Button outline onClick={() => setFullscreen(true)}>
                            <ArrowsPointingOutIcon />
                            {t("button.show-sign-up-qr")}
                        </Button>
                    </div>
                </div>
            </div>
            <Dialog open={fullscreen} onClose={() => setFullscreen(false)} size={"5xl"}>
                <DialogTitle>{tournament.name}</DialogTitle>
                <DialogBody>
                    <div className={"flex justify-center"}>
                        <div className={"w-full max-w-[min(80vh,100%)] rounded-lg bg-white p-4"}>
                            <QRCodeSVG
                                value={link}
                                size={1024}
                                className={"h-auto w-full"}
                                aria-label={t("accessibility.sign-up-qr")}
                            />
                        </div>
                    </div>
                </DialogBody>
                <DialogActions>
                    <Button plain onClick={() => setFullscreen(false)}>
                        {tg("button.close")}
                    </Button>
                </DialogActions>
            </Dialog>
        </section>
    );
}
