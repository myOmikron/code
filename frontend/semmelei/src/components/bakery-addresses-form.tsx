import React from "react";
import { useTranslation } from "react-i18next";
import {
    Description,
    Field,
    FieldGroup,
    Fieldset,
    Input,
    Label,
    PrimaryButton,
    Subheading,
    Text,
    notify,
} from "components";
import { Api } from "src/api/api";

/**
 * Where the Bakery order goes at the Dispatch: the Bakery's address and the copy address
 *
 * @returns the form
 */
export function BakeryAddressesForm() {
    const [t] = useTranslation("admin");
    const [tg] = useTranslation();
    const [bakeryEmail, setBakeryEmail] = React.useState("");
    const [copyEmail, setCopyEmail] = React.useState("");
    const [saving, setSaving] = React.useState(false);

    React.useEffect(() => {
        Api.admin.bakery.get().then((addresses) => {
            setBakeryEmail(addresses.bakery_email ?? "");
            setCopyEmail(addresses.copy_email ?? "");
        });
    }, []);

    /** Save both addresses; an empty field unsets that address */
    async function save() {
        setSaving(true);
        try {
            const saved = await Api.admin.bakery.update({
                bakery_email: bakeryEmail.trim() || null,
                copy_email: copyEmail.trim() || null,
            });
            setBakeryEmail(saved.bakery_email ?? "");
            setCopyEmail(saved.copy_email ?? "");
            notify.success(t("toast.bakery-saved"));
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className={"flex flex-col gap-4"}>
            <Subheading>{t("heading.bakery")}</Subheading>
            <Text>{t("description.bakery")}</Text>

            <Fieldset className={"max-w-xl"}>
                <FieldGroup>
                    <Field>
                        <Label>{t("label.bakery-email")}</Label>
                        <Input
                            type={"email"}
                            inputMode={"email"}
                            placeholder={"bestellung@baeckerei.de"}
                            value={bakeryEmail}
                            onChange={(e) => setBakeryEmail(e.target.value)}
                        />
                        <Description>{t("description.bakery-email")}</Description>
                    </Field>

                    <Field>
                        <Label>{t("label.copy-email")}</Label>
                        <Input
                            type={"email"}
                            inputMode={"email"}
                            value={copyEmail}
                            onChange={(e) => setCopyEmail(e.target.value)}
                        />
                        <Description>{t("description.copy-email")}</Description>
                    </Field>

                    <PrimaryButton loading={saving} onClick={save} className={"self-start"}>
                        {tg("button.save")}
                    </PrimaryButton>
                </FieldGroup>
            </Fieldset>
        </div>
    );
}
