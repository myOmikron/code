import { createFileRoute } from "@tanstack/react-router";
import { Heading, Text, TextLink } from "components";
import { useTranslation } from "react-i18next";
import { LegalSection } from "src/components/legal-section";
import i18n from "src/i18n";
import { LEGAL } from "src/legal";

export const Route = createFileRoute("/_menu/legal")({
    loader: () => i18n.loadNamespaces("legal"),
    component: RouteComponent,
});

/**
 * The imprint, reachable without an account.
 *
 * @returns the page
 */
function RouteComponent() {
    const [t] = useTranslation("legal");

    return (
        <div className={"flex max-w-3xl flex-col gap-6 py-4"}>
            <Heading>{t("heading.imprint")}</Heading>

            <LegalSection title={t("heading.contact")}>
                <Text className={"whitespace-pre-line"}>{t("description.imprint-provider", LEGAL)}</Text>
                <Text>{t("description.contact", LEGAL)}</Text>
            </LegalSection>

            <LegalSection title={t("heading.responsible")}>{t("description.responsible", LEGAL)}</LegalSection>
            <LegalSection title={t("heading.liability")}>{t("description.liability")}</LegalSection>
            <LegalSection title={t("heading.trademarks")}>{t("description.trademarks")}</LegalSection>

            <Text>
                <TextLink href={"/privacy"}>{t("button.to-privacy")}</TextLink>
            </Text>
        </div>
    );
}
