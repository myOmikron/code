import { MapPinIcon } from "@heroicons/react/20/solid";
import { Button, Text } from "components";
import { useTranslation } from "react-i18next";
import { mapsUrl } from "src/utils/maps";

/**
 * The properties for {@link TournamentVenue}
 */
export type TournamentVenueProps = {
    /** Name of the place */
    name: string;
    /** Free-text address, if any */
    address?: string | null;
    /** Arrival instructions, if any */
    instructions?: string | null;
};

/**
 * A venue's name, address and arrival instructions, with an "open in maps" button
 *
 * Callers only render it for a non-blank venue name.
 *
 * @returns the block
 */
export function TournamentVenue({ name, address, instructions }: TournamentVenueProps) {
    const [t] = useTranslation("tournament");

    return (
        <div className={"flex flex-col gap-1"}>
            <span>{name}</span>
            {address != null && address !== "" && <Text>{address}</Text>}
            {instructions != null && instructions !== "" && <Text>{instructions}</Text>}
            <div>
                <Button
                    outline={true}
                    external={true}
                    href={mapsUrl(name, address ?? null)}
                    target={"_blank"}
                    rel={"noreferrer"}
                >
                    <MapPinIcon />
                    {t("button.open-in-maps")}
                </Button>
            </div>
        </div>
    );
}
