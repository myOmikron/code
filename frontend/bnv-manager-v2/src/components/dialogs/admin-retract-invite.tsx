import React from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogActions, DialogBody, DialogProps, DialogTitle } from "src/components/base/dialog";
import { Button } from "src/components/base/button";
import { Api, UUID } from "src/api/api";

/**
 * The properties for {@link AdminRetractInviteDialog}
 */
export type AdminRetractInviteDialogProps = DialogProps & {
    /** Invite to retract */
    invite: UUID;
    /** Callback when deletion was executed */
    onRetract: () => void;
};

/**
 * Dialog for deleting a club
 */
export default function AdminRetractInviteDialog(props: AdminRetractInviteDialogProps) {
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
                            await Api.admin.invites.retract(props.invite);
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
