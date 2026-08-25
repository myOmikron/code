import { UserGroupIcon } from "@heroicons/react/20/solid";
import { useTranslation } from "react-i18next";
import { useDeckLabels } from "src/components/deck-labels";
import type { HouseRule } from "src/utils/deck-rules";

/**
 * The properties for {@link DeckAdvisorRuleZero}
 */
export type DeckAdvisorRuleZeroProps = {
    /** The agreed deviations that are actually in effect */
    houseRules: Array<HouseRule>;
};

/**
 * What the table agreed to, said once before any advice is read.
 *
 * The advisor grades a deck against a size and a colour identity, and this
 * deck's are not the format's. Without this the page reads as an opinion about
 * a Commander deck by the book — and the two things the reader would need in
 * order to know otherwise, the claimed colours and the claimed size, are the
 * two the requests quietly carry.
 *
 * Zinc rather than amber, unlike the off-theme banner it sits above: nothing
 * here is a fault. The deck is played this way on purpose, and the panel says
 * so rather than warning about it.
 *
 * @returns the banner, or nothing when the deck is played by the book
 */
export function DeckAdvisorRuleZero({ houseRules }: DeckAdvisorRuleZeroProps) {
    const [t] = useTranslation("advisor");
    const labels = useDeckLabels();

    if (houseRules.length === 0) return null;

    return (
        <div
            className={
                "mb-4 flex gap-3 rounded-(--radius-lg) bg-zinc-100 p-4 ring-1 ring-zinc-950/10 dark:bg-white/5 dark:ring-white/10"
            }
        >
            <UserGroupIcon className={"size-5 shrink-0 text-zinc-500 dark:text-zinc-400"} aria-hidden={"true"} />
            <div className={"flex flex-col gap-0.5"}>
                <p className={"text-sm/6 font-medium text-zinc-950 dark:text-white"}>{t("heading.rule-zero")}</p>
                <p className={"text-sm/6 text-zinc-600 dark:text-zinc-400"}>{t("description.rule-zero")}</p>
                <ul className={"mt-1 flex flex-col gap-0.5"}>
                    {houseRules.map((rule) => (
                        <li key={rule.kind} className={"text-sm/6 text-zinc-600 dark:text-zinc-400"}>
                            {labels.houseRule(rule)}
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}
