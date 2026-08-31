import { TrophyIcon } from "@heroicons/react/20/solid";
import { useTranslation } from "react-i18next";

/**
 * The properties for {@link GameChangerMarker}
 */
export type GameChangerMarkerProps = {
    /**
     * Where the marker sits.
     *
     * `overlay` is the badge dropped on a card's artwork, which has no room
     * for the words and says them in a `title` instead; `pill` is the labelled
     * chip that goes in a row of other facts about the card.
     */
    variant?: "overlay" | "pill";
    /** Whether the pill abbreviates itself, for rows with no room to spare */
    short?: boolean;
};

/**
 * The mark a Game Changer wears, wherever a card is shown.
 *
 * One component because it is one claim: this card is on the bracket system's
 * Game Changer list, which is the single card attribute that can move a deck
 * between brackets. It was drawn four different ways across the app — an amber
 * trophy over deck artwork, the same trophy as a pill in a card row, an
 * abbreviated pill in the hover preview, and a *red* text badge on advisor
 * suggestions, which read as an error rather than a fact and matched nothing
 * else on the page.
 *
 * The overlay owns its own placement. Both surfaces that use it put it in the
 * same corner of the artwork, and a shared look that each caller positions for
 * itself is a shared look waiting to come apart.
 *
 * The wording lives in the general namespace rather than the deck's or the
 * advisor's, because both of them need it and a component may not reach for a
 * third namespace to say one word.
 *
 * @returns the marker
 */
export function GameChangerMarker({ variant = "pill", short = false }: GameChangerMarkerProps) {
    const [tg] = useTranslation();
    const label = tg(short ? "label.game-changer-short" : "label.game-changer");

    if (variant === "overlay") {
        return (
            <span
                className={
                    "pointer-events-none absolute top-2 left-2 rounded-full bg-amber-400 p-1.5 text-amber-950 shadow-lg ring-2 ring-white/75"
                }
                title={tg("label.game-changer")}
            >
                <TrophyIcon className={"size-4"} />
                <span className={"sr-only"}>{tg("label.game-changer")}</span>
            </span>
        );
    }

    return (
        <span
            className={
                "flex items-center gap-1 rounded-(--radius-pill) bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-600/20 dark:text-amber-300 dark:ring-amber-400/25"
            }
            title={short ? tg("label.game-changer") : undefined}
        >
            <TrophyIcon className={"size-3"} />
            {label}
        </span>
    );
}
