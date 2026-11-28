import { Description, Field, Label, Listbox, ListboxLabel, ListboxOption } from "components";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Role } from "src/api/generated";
import { useAccount } from "src/context/account";
import { DEFAULT_EMBEDDING_MODEL } from "src/scanner/embedding-models";
import type { EmbeddingModel } from "src/scanner/embedding-models";
import { chooseEmbeddingModel, chosenEmbeddingModel } from "src/scanner/scan-client";

/**
 * The properties for {@link ScanModelSwitch}
 */
export type ScanModelSwitchProps = {
    className?: string;
};

/**
 * Picks the embedding model this device scans with, for Admins comparing them.
 *
 * Stored per device; choosing another model reloads the page, which starts the scanner over with
 * that model and its own index.
 *
 * @returns the field, nothing for anyone but an Admin
 */
export function ScanModelSwitch({ className }: ScanModelSwitchProps) {
    const [t] = useTranslation("scan");
    const { account } = useAccount();
    const [model, setModel] = useState<EmbeddingModel>(chosenEmbeddingModel);

    if (account?.role !== Role.Admin) return null;

    return (
        <Field className={className}>
            <Label>{t("label.recognition")}</Label>
            <Listbox<EmbeddingModel>
                value={model}
                onChange={(next) => {
                    if (next === model) return;
                    setModel(next);
                    chooseEmbeddingModel(next);
                }}
            >
                <ListboxOption value={DEFAULT_EMBEDDING_MODEL}>
                    <ListboxLabel>{t("label.recognition-standard")}</ListboxLabel>
                </ListboxOption>
                <ListboxOption value={"dhv-embed"}>
                    <ListboxLabel>{t("label.recognition-dhv")}</ListboxLabel>
                </ListboxOption>
            </Listbox>
            <Description>{t("description.recognition")}</Description>
        </Field>
    );
}
