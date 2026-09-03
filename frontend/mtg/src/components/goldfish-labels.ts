import { useTranslation } from "react-i18next";
import type { GoldfishZone } from "src/utils/goldfish";

/**
 * What the zones of a test game are called
 *
 * @returns a function naming a zone
 */
export function useGoldfishZoneLabel(): (zone: GoldfishZone) => string {
    const [t] = useTranslation("goldfish");
    return (zone) => {
        switch (zone) {
            case "library":
                return t("label.library");
            case "hand":
                return t("label.hand");
            case "battlefield":
                return t("label.battlefield");
            case "graveyard":
                return t("label.graveyard");
            case "exile":
                return t("label.exile");
            case "command":
                return t("label.command");
        }
    };
}
