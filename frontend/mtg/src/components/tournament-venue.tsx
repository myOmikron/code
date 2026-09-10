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
    /** Where it is, in the organizer's words — `null`/absent renders no address line */
    address?: string | null;
    /** How to actually get in — "Hinterhof, bitte klingeln" and the like */
    instructions?: string | null;
};

/**
 * A venue's name, address and arrival instructions, plus a button that opens it in whatever maps
 * app the reader has.
 *
 * Shared by every surface that shows more than the bare venue name — the overview tab, the shared
 * tournament's public overview, and the join preview card all render exactly this. Only the shared
 * layout's single-line header strip keeps to the name alone, and stays a plain `<span>` there — a
 * button and two extra lines of text would break that line's whole point.
 *
 * Callers decide whether there is a venue at all: a blank/`null` name renders nothing useful, so
 * every call site already gates on it (an em dash or nothing, depending on the surrounding layout)
 * before reaching for this component.
 *
 * @returns the block
 */
export function TournamentVenue({ name, address, instructions }: TournamentVenueProps) {
    const [t] = useTranslation("tournament");

    return (
        <div className={"flex flex-col gap-1"}>
            {/* The name inherits whatever colour it is dropped into — a `Text` would mute it to
                zinc-500, and two of the three call sites are `DescriptionDetails`, whose whole
                job is to render a value at full contrast. The two lines under it are the muted
                ones, which is the hierarchy this block wants anyway. */}
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
