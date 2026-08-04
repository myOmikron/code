import React from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogActions, DialogBody, DialogProps, DialogTitle } from "src/components/base/dialog";
import { Button } from "src/components/base/button";
import { Api, UUID } from "src/api/api";

/**
 * The properties for {@link AdminDeleteClubAdmin}
 */
export type AdminDeleteClubAdminProps = DialogProps & {
    /** UUID of the club admin */
    clubAdmin: UUID;
    /** Callback when deletion was executed */
    onDelete: () => void;
};

/**
 * Dialog for deleting a club
 */
export default function AdminDeleteClubAdmin(props: AdminDeleteClubAdminProps) {
    const [t] = useTranslation("dialog-delete-club-admin");
    const [tg] = useTranslation();

    return (
        <Dialog open={props.open} onClose={props.onClose}>
            <DialogTitle>{t("heading.delete-club-admin")}</DialogTitle>
            <DialogBody>
                <DialogActions>
                    <Button plain={true} onClick={props.onClose}>
                        {tg("button.cancel")}
                    </Button>
                    <Button
                        color={"red"}
                        onClick={async () => {
                            await Api.admin.clubAdmins.delete(props.clubAdmin);
                            props.onDelete();
                        }}
                    >
                        {t("button.delete-club-admin")}
                    </Button>
                </DialogActions>
            </DialogBody>
        </Dialog>
    );
}
