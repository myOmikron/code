import { ArrowTrendingDownIcon } from "@heroicons/react/20/solid";
import { Button } from "components";
import { useTranslation } from "react-i18next";
import { ThemeLean } from "src/api/graph-generated";

/**
 * The properties for {@link DeckAdvisorOffTheme}
 */
export type DeckAdvisorOffThemeProps = {
    /** Themes the answer leans on that the deck does not play */
    leans: Array<ThemeLean>;
    /** Excludes one theme from the advisor's ranking */
    onExclude: (themeId: string) => void;
};

/**
 * "These suggestions are about something your deck isn't."
 *
 * A commander's recommendations are its *popular* build, and popularity is
 * measured across other people's decks. Build the archetype the crowd ignores
 * and the advisor keeps answering for the archetype it knows — every card
 * individually defensible, the page as a whole about the wrong deck. That is
 * hard to see one row at a time and obvious when stated as a share.
 *
 * Stated rather than acted on. Whether an off-theme lean is wrong is a
 * judgement only the deck's owner can make, and a build that departs from the
 * commander's usual one is a choice, not a mistake to correct. So this offers
 * the exclusion and never applies it.
 *
 * Undoing it lives elsewhere by design: {@link DeckAdvisorThemes} keeps a chip
 * for any theme the user has an opinion about, including ones the deck does
 * not read as, which is exactly the case an exclusion from here creates.
 *
 * @returns the banner, or nothing when the answer matches the deck
 */
export function DeckAdvisorOffTheme({ leans, onExclude }: DeckAdvisorOffThemeProps) {
    const [t] = useTranslation("advisor");

    // Only the strongest. Two banners stacked is a wall to dismiss rather than
    // a thing to read, and the runner-up is reachable from the theme chips.
    const lean = leans[0];
    if (lean === undefined) return null;

    return (
        <div
            className={
                "mb-4 flex flex-col gap-3 rounded-(--radius-lg) bg-amber-50 p-4 ring-1 ring-amber-950/10 sm:flex-row sm:items-center sm:justify-between dark:bg-amber-400/10 dark:ring-amber-400/20"
            }
        >
            <div className={"flex gap-3"}>
                <ArrowTrendingDownIcon
                    className={"size-5 shrink-0 text-amber-700 dark:text-amber-300"}
                    aria-hidden={"true"}
                />
                <div className={"flex flex-col gap-0.5"}>
                    <p className={"text-sm/6 font-medium text-amber-900 dark:text-amber-200"}>
                        {t("heading.off-theme")}
                    </p>
                    <p className={"text-sm/6 text-amber-800 dark:text-amber-200/80"}>
                        {t("description.off-theme", {
                            theme: lean.label,
                            share: Math.round(lean.share * 100),
                        })}
                    </p>
                </div>
            </div>
            <Button outline className={"shrink-0"} onClick={() => onExclude(lean.theme)}>
                {t("button.exclude-theme", { theme: lean.label })}
            </Button>
        </div>
    );
}
