import { ArrowsRightLeftIcon, LanguageIcon, Square2StackIcon } from "@heroicons/react/20/solid";
import { BadgeButton } from "components";
import { useTranslation } from "react-i18next";
import type { CardFinish } from "src/api/generated";
import { finishLabel } from "src/components/card-attribute-badge";
import { useWatchLanguageLabels } from "src/components/watch-language-labels";
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
    /** The languages the row accepts, empty for any */
    languages: Array<string>;
    /** Opens the language picker */
    onLanguages: () => void;
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
 * Which second badge appears follows from the first. Under "exact version" the
 * printing settles the set and the language, and only the finish is still open.
 * Under "any version" the finish is deliberately left open — accepting any
 * print and then insisting on foil is a combination almost nobody means — while
 * the language becomes worth naming, because "any print" otherwise quietly
 * includes every language the card was ever printed in.
 *
 * @returns the badges
 */
export function WatchMatchBadges({
    exactPrinting,
    matchFinish,
    finish,
    finishes,
    languages,
    onLanguages,
    onChange,
    busy = false,
}: WatchMatchBadgesProps) {
    const [t] = useTranslation("watch-list");
    const [tg] = useTranslation();
    const labels = useWatchLanguageLabels();

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

            {/* Complementary to the finish badge: a pinned printing already is
                one language, so narrowing it again could only ever mean the
                same thing or nothing at all. */}
            {!exactPrinting && (
                <BadgeButton
                    color={languages.length > 0 ? "blue" : "zinc"}
                    disabled={busy}
                    onClick={() => {
                        hapticTap();
                        onLanguages();
                    }}
                >
                    <LanguageIcon className={"size-3.5"} />
                    {labels.languages(languages)}
                </BadgeButton>
            )}

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
