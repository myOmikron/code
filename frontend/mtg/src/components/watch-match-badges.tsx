import { ArrowsRightLeftIcon, Square2StackIcon } from "@heroicons/react/20/solid";
import { BadgeButton } from "components";
import { useTranslation } from "react-i18next";
import type { CardFinish } from "src/api/generated";
import { finishLabel } from "src/components/card-attribute-badge";
import { hapticTap } from "src/utils/haptics";
import { nextFinish } from "src/utils/watch-list";
import type { WatchMatchPatch } from "src/utils/watch-list";

/**
 * The properties for {@link WatchMatchBadges}
 */
export type WatchMatchBadgesProps = {
    /** Whether only the named printing counts */
    exactPrinting: boolean;
    /** Whether only the named finish counts */
    matchFinish: boolean;
    /** The finish the entry names */
    finish: CardFinish;
    /** Scryfall's finishes for this printing, comma separated */
    finishes: string;
    /** Asks for the new reading */
    onChange: (patch: WatchMatchPatch) => void;
    /** Whether a write is in flight, which locks both badges */
    busy?: boolean;
};

/**
 * What a watched row currently counts, as two badges that say it outright.
 *
 * These were switches, then chips whose off state read as "not chosen" rather
 * than "any". A badge that carries the value as its own label cannot be
 * misread: "Any version" is a statement about the row, not an unlit option, and
 * tapping it makes the next statement true.
 *
 * The finish badge disappears under "any version". Accepting any print of a
 * card and then insisting on the finish is a combination almost nobody means,
 * and offering it made the two badges look like a pair of unrelated filters
 * instead of one narrowing decision followed by an optional second.
 *
 * @returns the badges
 */
export function WatchMatchBadges({
    exactPrinting,
    matchFinish,
    finish,
    finishes,
    onChange,
    busy = false,
}: WatchMatchBadgesProps) {
    const [t] = useTranslation("watch-list");
    const [tg] = useTranslation();

    return (
        <>
            <BadgeButton
                color={exactPrinting ? "blue" : "zinc"}
                disabled={busy}
                onClick={() => {
                    hapticTap();
                    // Loosening the print loosens the finish with it, and
                    // narrowing back down restores the finish the entry still
                    // remembers, so the pair cannot end up in a state nobody
                    // asked for.
                    onChange(
                        exactPrinting
                            ? { exact_printing: false, match_finish: false }
                            : { exact_printing: true, match_finish: true },
                    );
                }}
            >
                <Square2StackIcon className={"size-3.5"} />
                {exactPrinting ? t("label.exact-version") : t("label.any-version")}
            </BadgeButton>

            {exactPrinting && (
                <BadgeButton
                    color={matchFinish ? "blue" : "zinc"}
                    disabled={busy}
                    onClick={() => {
                        hapticTap();
                        // The same step the `F` key takes, out of the same
                        // function: a key that does something the visible
                        // control does not is worse than no key.
                        const patch = nextFinish(
                            { exact_printing: exactPrinting, match_finish: matchFinish, finish },
                            finishes,
                        );
                        if (patch !== null) onChange(patch);
                    }}
                >
                    <ArrowsRightLeftIcon className={"size-3.5"} />
                    {matchFinish ? finishLabel(tg, finish) : t("label.any-finish")}
                </BadgeButton>
            )}
        </>
    );
}
