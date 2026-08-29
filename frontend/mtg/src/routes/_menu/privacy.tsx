import { createFileRoute } from "@tanstack/react-router";
import { Heading, Text, TextLink } from "components";
import { useTranslation } from "react-i18next";
import { LegalSection } from "src/components/legal-section";
import i18n from "src/i18n";
import { LEGAL } from "src/legal";

export const Route = createFileRoute("/_menu/privacy")({
    loader: () => i18n.loadNamespaces("legal"),
    component: RouteComponent,
});

/**
 * The privacy policy, reachable without an account.
 *
 * Written against what the application actually does rather than from a
 * template: every section below names a processing that exists in the code, in
 * the order a reader meets it, from opening the page to deleting the account.
 *
 * @returns the page
 */
function RouteComponent() {
    const [t] = useTranslation("legal");

    return (
        <div className={"flex max-w-3xl flex-col gap-6 py-4"}>
            <div className={"flex flex-col gap-1"}>
                <Heading>{t("heading.privacy")}</Heading>
                <Text className={"text-xs"}>{t("label.updated", LEGAL)}</Text>
            </div>

            <Text>{t("description.privacy-intro")}</Text>

            <LegalSection title={t("heading.controller")}>{t("description.controller", LEGAL)}</LegalSection>
            <LegalSection title={t("heading.hosting")}>{t("description.hosting", LEGAL)}</LegalSection>
            <LegalSection title={t("heading.telemetry")}>{t("description.telemetry")}</LegalSection>
            <LegalSection title={t("heading.account")}>{t("description.account")}</LegalSection>
            <LegalSection title={t("heading.passkeys")}>{t("description.passkeys")}</LegalSection>
            <LegalSection title={t("heading.registration-mail")}>
                {t("description.registration-mail", LEGAL)}
            </LegalSection>
            <LegalSection title={t("heading.contact-mail")}>{t("description.contact-mail")}</LegalSection>
            <LegalSection title={t("heading.session")}>{t("description.session")}</LegalSection>
            <LegalSection title={t("heading.content")}>{t("description.content")}</LegalSection>
            <LegalSection title={t("heading.publishing")}>{t("description.publishing")}</LegalSection>
            <LegalSection title={t("heading.import")}>{t("description.import")}</LegalSection>

            <LegalSection title={t("heading.scryfall")}>
                <Text>{t("description.scryfall")}</Text>
                <Text>
                    <a
                        href={"https://scryfall.com/docs/privacy"}
                        target={"_blank"}
                        rel={"noreferrer"}
                        className={
                            "text-zinc-950 underline decoration-zinc-950/50 hover:decoration-zinc-950 dark:text-white dark:decoration-white/50 dark:hover:decoration-white"
                        }
                    >
                        {t("button.scryfall-privacy")}
                    </a>
                </Text>
            </LegalSection>

            <LegalSection title={t("heading.external-links")}>{t("description.external-links")}</LegalSection>
            <LegalSection title={t("heading.scanner")}>{t("description.scanner")}</LegalSection>
            <LegalSection title={t("heading.local-storage")}>{t("description.local-storage")}</LegalSection>

            <LegalSection title={t("heading.retention")}>
                <Text>{t("description.retention", LEGAL)}</Text>
                <Text>
                    <TextLink href={"/profile/settings"}>{t("button.account-settings")}</TextLink>
                </Text>
            </LegalSection>

            <LegalSection title={t("heading.rights")}>{t("description.rights")}</LegalSection>
            <LegalSection title={t("heading.complaint")}>{t("description.complaint", LEGAL)}</LegalSection>
            <LegalSection title={t("heading.obligation")}>{t("description.obligation")}</LegalSection>
            <LegalSection title={t("heading.changes")}>{t("description.changes")}</LegalSection>

            <Text>
                <TextLink href={"/legal"}>{t("button.to-imprint")}</TextLink>
            </Text>
        </div>
    );
}
