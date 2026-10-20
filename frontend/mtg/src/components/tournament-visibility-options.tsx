import { GlobeAltIcon, LinkIcon, LockClosedIcon } from "@heroicons/react/20/solid";
import { ListboxDescription, ListboxLabel, ListboxOption } from "components";
import { useTranslation } from "react-i18next";
import { Visibility } from "src/api/generated";

/**
 * The three visibility choices, for a tournament visibility `Listbox`
 *
 * @returns the listbox options
 */
export function TournamentVisibilityOptions() {
    const [t] = useTranslation("tournament");

    return (
        <>
            <ListboxOption value={Visibility.Private}>
                <LockClosedIcon />
                <ListboxLabel>{t("label.visibility-private")}</ListboxLabel>
                <ListboxDescription>{t("description.visibility-private")}</ListboxDescription>
            </ListboxOption>
            <ListboxOption value={Visibility.Unlisted}>
                <LinkIcon />
                <ListboxLabel>{t("label.visibility-unlisted")}</ListboxLabel>
                <ListboxDescription>{t("description.visibility-unlisted")}</ListboxDescription>
            </ListboxOption>
            <ListboxOption value={Visibility.Public}>
                <GlobeAltIcon />
                <ListboxLabel>{t("label.visibility-public")}</ListboxLabel>
                <ListboxDescription>{t("description.visibility-public")}</ListboxDescription>
            </ListboxOption>
        </>
    );
}
