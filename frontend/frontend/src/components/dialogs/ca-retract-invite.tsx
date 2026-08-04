import React from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogActions, DialogBody, DialogProps, DialogTitle } from "src/components/base/dialog";
import { Button } from "src/components/base/button";
import { Api, UUID } from "src/api/api";

/**
 * The properties for {@link ClubAdminRetractInviteDialog}
 */
export type ClubAdminRetractInviteDialogProps = DialogProps & {
    /** UUID of the club */
    club: UUID;
    /** Invite to retract */
    invite: UUID;
    /** Callback when deletion was executed */
    onRetract: () => void;
};

/**
 * Dialog for deleting a club
 */
export default function ClubAdminRetractInviteDialog(props: ClubAdminRetractInviteDialogProps) {
    const [t] = useTranslation("dialog-retract-invite");
    const [tg] = useTranslation();

    return (
        <Dialog open={props.open} onClose={props.onClose}>
            <DialogTitle>{t("heading.retract-invitation")}</DialogTitle>
            <DialogBody>
                <DialogActions>
                    <Button plain={true} onClick={props.onClose}>
                        {tg("button.cancel")}
                    </Button>
                    <Button
                        color={"red"}
                        onClick={async () => {
                            await Api.clubAdmins.invites.retract(props.invite, props.club);
                            props.onRetract();
                        }}
                    >
                        {t("button.retract-invite")}
                    </Button>
                </DialogActions>
            </DialogBody>
        </Dialog>
    );
}
