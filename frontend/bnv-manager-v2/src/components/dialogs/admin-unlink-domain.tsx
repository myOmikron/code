import React from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogActions, DialogBody, DialogProps, DialogTitle } from "src/components/base/dialog";
import { Button } from "src/components/base/button";
import { Api, UUID } from "src/api/api";

/**
 * The properties for {@link AdminUnlinkDomainDialog}
 */
export type AdminUnlinkDomainDialogProps = DialogProps & {
    /** The club the domain is associated with */
    club: UUID;
    /** The domain to unlink */
    domain: UUID;
    /** Callback when the unlinking was successful */
    onUnlink: () => void;
};

/**
 * Dialog for deleting a club
 */
export default function AdminUnlinkDomainDialog(props: AdminUnlinkDomainDialogProps) {
    const [t] = useTranslation("dialog-unlink-domain");
    const [tg] = useTranslation();

    return (
        <Dialog open={props.open} onClose={props.onClose}>
            <DialogTitle>{t("heading.unlink-domain")}</DialogTitle>
            <DialogBody>
                <DialogActions>
                    <Button plain={true} onClick={props.onClose}>
                        {tg("button.cancel")}
                    </Button>
                    <Button
                        color={"red"}
                        onClick={async () => {
                            await Api.admin.clubs.unassociateDomain(props.club, props.domain);
                            props.onUnlink();
                        }}
                    >
                        {t("button.unlink-domain")}
                    </Button>
                </DialogActions>
            </DialogBody>
        </Dialog>
    );
}
