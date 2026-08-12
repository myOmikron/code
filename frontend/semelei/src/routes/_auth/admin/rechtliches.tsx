import { createFileRoute } from "@tanstack/react-router";
import React from "react";
import { useTranslation } from "react-i18next";
import {
    Description,
    Field,
    FieldGroup,
    Fieldset,
    Heading,
    Input,
    Label,
    PrimaryButton,
    Text,
    notify,
} from "components";
import { Api } from "src/api/api";

/**
 * The imprint and privacy policy links shown in the public footer
 *
 * @returns the page
 */
function Legal() {
    const [t] = useTranslation("admin");
    const [tg] = useTranslation();
    const [imprintUrl, setImprintUrl] = React.useState("");
    const [privacyUrl, setPrivacyUrl] = React.useState("");
    const [saving, setSaving] = React.useState(false);

    React.useEffect(() => {
        Api.admin.legal.get().then((links) => {
            setImprintUrl(links.imprint_url ?? "");
            setPrivacyUrl(links.privacy_url ?? "");
        });
    }, []);

    /** Save both links; an empty field removes that link from the footer */
    async function save() {
        setSaving(true);
        try {
            const saved = await Api.admin.legal.update({
                imprint_url: imprintUrl.trim() || null,
                privacy_url: privacyUrl.trim() || null,
            });
            setImprintUrl(saved.imprint_url ?? "");
            setPrivacyUrl(saved.privacy_url ?? "");
            notify.success(t("toast.legal-saved"));
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className={"flex flex-col gap-4"}>
            <Heading>{t("heading.legal")}</Heading>
            <Text>{t("description.legal")}</Text>

            <Fieldset className={"max-w-xl"}>
                <FieldGroup>
                    <Field>
                        <Label>{t("label.imprint-url")}</Label>
                        <Input
                            type={"url"}
                            inputMode={"url"}
                            placeholder={"https://example.de/impressum/"}
                            value={imprintUrl}
                            onChange={(e) => setImprintUrl(e.target.value)}
                        />
                        <Description>{t("description.imprint-url")}</Description>
                    </Field>

                    <Field>
                        <Label>{t("label.privacy-url")}</Label>
                        <Input
                            type={"url"}
                            inputMode={"url"}
                            placeholder={"https://example.de/datenschutz/"}
                            value={privacyUrl}
                            onChange={(e) => setPrivacyUrl(e.target.value)}
                        />
                        <Description>{t("description.privacy-url")}</Description>
                    </Field>

                    <PrimaryButton loading={saving} onClick={save} className={"self-start"}>
                        {tg("button.save")}
                    </PrimaryButton>
                </FieldGroup>
            </Fieldset>
        </div>
    );
}

export const Route = createFileRoute("/_auth/admin/rechtliches")({
    component: Legal,
});
