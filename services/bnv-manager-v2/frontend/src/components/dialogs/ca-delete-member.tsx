import { useTranslation } from "react-i18next";
import { Dialog, DialogActions, DialogDescription, DialogProps, DialogTitle } from "src/components/base/dialog";
import { Api, UUID } from "src/api/api";
import { Button } from "src/components/base/button";

/**
 * Props for {@link DeleteMemberDialog}
 */
export type DeleteMemberDialogProps = DialogProps & {
    /** UUID of the club to delete the member from */
    club_uuid: UUID;
    /** UUID of the member to delete */
    member_uuid: UUID;
    /** Callback when deletion was executed */
    onDelete: () => void;
};

/**
 * Dialog to delete a club member
 */
export default function DeleteMemberDialog(props: DeleteMemberDialogProps) {
    const [t] = useTranslation("ca-delete-member");
    const [tg] = useTranslation();

    return (
        <Dialog open={props.open} onClose={props.onClose}>
            <DialogTitle>{t("heading.delete-club-member")}</DialogTitle>
            <DialogDescription>{t("description.delete-club-member")}</DialogDescription>
            <DialogActions>
                <Button plain={true} onClick={props.onClose}>
                    {tg("button.cancel")}
                </Button>
                <Button
                    color={"red"}
                    onClick={async () => {
                        await Api.clubAdmins.club.deleteMember(props.club_uuid, props.member_uuid);
                        props.onDelete();
                    }}
                >
                    {t("button.delete-member")}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
