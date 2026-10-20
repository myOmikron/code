import clsx from "clsx";
import {
    Dropdown,
    DropdownButton,
    DropdownDescription,
    DropdownHeading,
    DropdownItem,
    DropdownLabel,
    DropdownMenu,
    DropdownSection,
} from "components";
import { useTranslation } from "react-i18next";
import { RULE_ICONS, ruleLabel } from "src/components/deck-bracket-menu";
import type { BracketRuleCheck } from "src/utils/deck-rules";

/**
 * The properties for {@link BracketBreakMark}
 */
export type BracketBreakMarkProps = {
    /** The rules adding the card would break, read as if it were in */
    breaks: Array<BracketRuleCheck>;
    /** The bracket the deck claims */
    bracket: number;
    /** Additional CSS classes for the trigger */
    className?: string;
};

/**
 * Says that a card would take the deck over its Bracket claim, before it is added.
 *
 * One amber mark per broken rule, the same marks the bracket chip wears. A
 * click opens the cards behind each rule, the new one among them. It never
 * adds the card, and it never stops the card from being added.
 *
 * @returns the mark, or nothing when no rule breaks
 */
export function BracketBreakMark({ breaks, bracket, className }: BracketBreakMarkProps) {
    const [t] = useTranslation("deck");

    if (breaks.length === 0) return null;

    const summary = t("label.breaks-bracket", {
        number: bracket,
        rules: breaks.map((check) => t(`label.rule-${check.kind}`)).join(", "),
    });

    return (
        <span
            className={"contents"}
            title={summary}
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
        >
            <Dropdown>
                <DropdownButton
                    plain={true}
                    aria-label={summary}
                    className={clsx(
                        "gap-1 rounded-(--radius-control) bg-amber-500/15 px-1.5 py-0.5 ring-1 ring-amber-600/25 dark:bg-amber-400/15 dark:ring-amber-400/30",
                        className,
                    )}
                >
                    {breaks.map((check) => {
                        const Icon = RULE_ICONS[check.kind];
                        return <Icon key={check.kind} className={"size-3.5 text-amber-600! dark:text-amber-400!"} />;
                    })}
                </DropdownButton>
                <DropdownMenu anchor={"bottom end"} className={"min-w-[min(20rem,calc(100vw-2rem))]"}>
                    <DropdownSection>
                        <DropdownHeading>{t("heading.breaks-bracket", { number: bracket })}</DropdownHeading>
                        {breaks.map((check) => {
                            const Icon = RULE_ICONS[check.kind];
                            return (
                                <DropdownItem key={check.kind}>
                                    <Icon className={"text-amber-600! dark:text-amber-400!"} />
                                    <DropdownLabel className={"text-amber-700 dark:text-amber-300"}>
                                        {t(`label.rule-${check.kind}`)}
                                    </DropdownLabel>
                                    <DropdownDescription>
                                        {ruleLabel(t, check, check.kind === "extra-turns")}
                                        {check.allowed !== 0 && (
                                            <span className={"block"}>{check.names.join(", ")}</span>
                                        )}
                                    </DropdownDescription>
                                </DropdownItem>
                            );
                        })}
                    </DropdownSection>
                </DropdownMenu>
            </Dropdown>
        </span>
    );
}
