import React from "react";
import { useTranslation } from "react-i18next";
import {
    Dialog,
    DialogActions,
    DialogBody,
    DialogDescription,
    DialogProps,
    DialogTitle,
} from "src/components/base/dialog";
import { Button } from "src/components/base/button";
import { Api } from "src/api/api";
import { ClubSchema } from "src/api/generated/admin";

/**
 * The properties for {@link AdminDeleteClubDialog}
 */
export type AdminDeleteClubDialogProps = DialogProps & {
    /** The club to delete */
    club?: ClubSchema;
    /** Callback when deletion was executed */
    onDelete: () => void;
};

/**
 * Dialog for deleting a club
 */
export default function AdminDeleteClubDialog(props: AdminDeleteClubDialogProps) {
    const [t] = useTranslation("dialog-delete-club");
    const [tg] = useTranslation();

    return (
        <Dialog open={props.open} onClose={props.onClose}>
            <DialogTitle>{t("heading.delete-club", { club: props.club?.name })}</DialogTitle>
            <DialogBody>
                <DialogDescription>{t("description.delete-club")}</DialogDescription>
                <DialogActions>
                    <Button plain={true} onClick={props.onClose}>
                        {tg("button.cancel")}
                    </Button>
                    <Button
                        color={"red"}
                        onClick={async () => {
                            if (!props.club) return;
                            await Api.admin.clubs.delete(props.club?.uuid);
                            props.onDelete();
                        }}
                    >
                        {t("button.delete-club")}
                    </Button>
                </DialogActions>
            </DialogBody>
        </Dialog>
    );
}
