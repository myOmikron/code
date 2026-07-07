import { useTranslation } from "react-i18next";
import { Dialog, DialogActions, DialogBody, DialogProps, DialogTitle } from "src/components/base/dialog";
import { Button, PrimaryButton } from "src/components/base/button";
import React from "react";
import { CredentialResetSchema, SimpleAccountSchema } from "src/api/generated/admin";
import { Api } from "src/api/api";
import { toast } from "react-toastify";
import { Text } from "src/components/base/text";

/**
 * Props for {@link AdminResetCredentialsDialog}
 */
export type AdminResetCredentialsDialogProps = DialogProps & {
    /** Account to reset */
    account: SimpleAccountSchema;
    /** Optional custom reset function. Defaults to the admin API. */
    resetFn?: (uuid: string) => Promise<CredentialResetSchema>;
};

/**
 * Dialog to reset credentials for an account
 */
export default function AdminResetCredentialsDialog(props: AdminResetCredentialsDialogProps) {
    const [t] = useTranslation("dialog-reset-credentials");
    const [tg] = useTranslation();

    const [reset, setReset] = React.useState<CredentialResetSchema>();

    const resetFn = props.resetFn ?? Api.admin.accounts.resetCredentials;

    const createReset = async () => {
        const credentialReset = await resetFn(props.account.uuid);
        setReset(credentialReset);
    };

    React.useEffect(() => {
        if (props.open) {
            createReset().then();
        }
    }, [props.open, props.account]);

    return (
        <Dialog open={props.open} onClose={props.onClose}>
            <DialogTitle>{t("heading.reset-credentials-for", { name: props.account.display_name })}</DialogTitle>
            <DialogBody>
                <div className={"flex flex-col gap-6"}>
                    <Text>{t("description.intro")}</Text>

                    <div className={"flex flex-col gap-2"}>
                        <Text className={"font-medium !text-black dark:!text-white"}>{t("heading.option-code")}</Text>
                        <Text>{t("description.code")}</Text>
                        <div className={"grid grid-cols-[auto_1fr] gap-x-8 gap-y-2"}>
                            <Text className={"!text-black dark:!text-white"}>{t("label.code")}</Text>
                            <Text className={"font-mono text-2xl tracking-widest !text-black dark:!text-white"}>
                                {reset?.code ?? "------"}
                            </Text>
                            <Text className={"!text-black dark:!text-white"}>{t("label.code-expires-at")}</Text>
                            <Text>
                                {reset?.code_expires_at
                                    ? new Date(reset.code_expires_at).toLocaleTimeString("de", {
                                          hour: "2-digit",
                                          minute: "2-digit",
                                      })
                                    : "-"}
                            </Text>
                        </div>
                    </div>

                    <div className={"flex flex-col gap-2"}>
                        <Text className={"font-medium !text-black dark:!text-white"}>{t("heading.option-link")}</Text>
                        <Text>{t("description.link")}</Text>
                        <div className={"grid grid-cols-[auto_1fr] gap-x-8 gap-y-2"}>
                            <Text className={"!text-black dark:!text-white"}>{t("label.link-expires-at")}</Text>
                            <Text>
                                {reset?.link_expires_at
                                    ? new Date(reset.link_expires_at).toLocaleDateString("de", {
                                          day: "2-digit",
                                          month: "2-digit",
                                          year: "numeric",
                                          hour: "2-digit",
                                          minute: "2-digit",
                                      })
                                    : "-"}
                            </Text>
                        </div>
                    </div>
                </div>
            </DialogBody>
            <DialogActions>
                <Button plain={true} onClick={props.onClose}>
                    {tg("button.cancel")}
                </Button>
                <Button
                    onClick={async () => {
                        if (reset) await navigator.clipboard.writeText(reset.link);
                        toast.success(tg("toast.copied-to-clipboard"));
                    }}
                >
                    {t("button.copy-link")}
                </Button>
                <PrimaryButton
                    onClick={async () => {
                        if (reset) await navigator.clipboard.writeText(reset.code);
                        toast.success(tg("toast.copied-to-clipboard"));
                    }}
                >
                    {t("button.copy-code")}
                </PrimaryButton>
            </DialogActions>
        </Dialog>
    );
}
