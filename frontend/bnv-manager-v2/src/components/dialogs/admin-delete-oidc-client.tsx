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
import { OidcClientSchema } from "src/api/generated";

/**
 * The properties for {@link AdminDeleteOidcClientDialog}
 */
export type AdminDeleteOidcClientDialogProps = DialogProps & {
    /** The client to delete */
    client?: OidcClientSchema;
    /** Callback when deletion was executed */
    onDelete: () => void;
};

/**
 * Dialog for deleting an OIDC client
 */
export default function AdminDeleteOidcClientDialog(props: AdminDeleteOidcClientDialogProps) {
    const [t] = useTranslation("dialog-delete-oidc-client");
    const [tg] = useTranslation();

    return (
        <Dialog open={props.open} onClose={props.onClose}>
            <DialogTitle>{t("heading.delete-oidc-client", { client: props.client?.name })}</DialogTitle>
            <DialogBody>
                <DialogDescription>{t("description.delete-oidc-client")}</DialogDescription>
                <DialogActions>
                    <Button plain={true} onClick={props.onClose}>
                        {tg("button.cancel")}
                    </Button>
                    <Button
                        color={"red"}
                        onClick={async () => {
                            if (!props.client) return;
                            await Api.admin.oidcClients.delete(props.client.client_id);
                            props.onDelete();
                        }}
                    >
                        {t("button.delete-oidc-client")}
                    </Button>
                </DialogActions>
            </DialogBody>
        </Dialog>
    );
}
