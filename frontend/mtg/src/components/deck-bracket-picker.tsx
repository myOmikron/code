import { CheckCircleIcon, ChevronDownIcon } from "@heroicons/react/20/solid";
import {
    BadgeButton,
    Dropdown,
    DropdownButton,
    DropdownDivider,
    DropdownItem,
    DropdownLabel,
    DropdownMenu,
} from "components";
import { useTranslation } from "react-i18next";
import type { BracketRulesResponse } from "src/api/generated";
import { useDeckLabels } from "src/components/deck-labels";

/**
 * The properties for {@link DeckBracketPicker}
 */
export type DeckBracketPickerProps = {
    /** The brackets on offer, empty for a format that has none */
    brackets: Array<BracketRulesResponse>;
    /** Which bracket the deck claims, `null` when it claims none */
    bracket: number | null;
    /** Records a claimed bracket */
    onChange: (bracket: number | null) => void;
    /** Whether the trigger is a chip beside the deck's name or a control in the deck bar */
    variant?: "badge" | "control";
    /** Additional CSS classes for the trigger */
    className?: string;
};

/**
 * Which bracket the deck claims, and the menu that changes it.
 *
 * One control, two places: the chip beside the deck's name — where the claim
 * belongs, because it is the deck's own statement and every tab reads it — and
 * the deck bar on the cards tab, next to the rules it is checked against. The
 * advisor holds the deck to this number and nothing else, so it has to be
 * legible from the advisor without going looking for it.
 *
 * @returns the picker
 */
export function DeckBracketPicker({
    brackets,
    bracket,
    onChange,
    variant = "control",
    className,
}: DeckBracketPickerProps) {
    const [t] = useTranslation("deck");
    const labels = useDeckLabels();

    if (brackets.length === 0) return null;

    const claimed = brackets.find((rules) => rules.number === bracket);

    return (
        <Dropdown>
            {variant === "badge" ? (
                <DropdownButton as={BadgeButton} color={"zinc"} className={className}>
                    {claimed === undefined
                        ? t("button.set-bracket")
                        : `${t("label.bracket")} ${claimed.number} · ${labels.bracket(claimed.slug)}`}
                    {/* The chip sits between two badges that open dialogs, so
                        it needs the one mark that says this one opens a menu. */}
                    <ChevronDownIcon className={"size-3.5"} />
                </DropdownButton>
            ) : (
                <DropdownButton outline={true} className={className} aria-label={t("label.bracket")}>
                    <span className={"tabular-nums"}>
                        {claimed === undefined ? t("label.bracket-short-none") : `B${claimed.number}`}
                    </span>
                    <span className={"max-lg:sr-only"}>
                        {claimed === undefined ? "" : labels.bracket(claimed.slug)}
                    </span>
                </DropdownButton>
            )}
            <DropdownMenu anchor={"bottom start"} className={"min-w-72"}>
                <DropdownItem onClick={() => onChange(null)}>
                    {bracket === null ? <CheckCircleIcon /> : <span className={"size-4"} />}
                    <DropdownLabel>{t("label.bracket-none")}</DropdownLabel>
                </DropdownItem>
                <DropdownDivider />
                {brackets.map((rules) => (
                    <DropdownItem key={rules.number} onClick={() => onChange(rules.number)}>
                        {bracket === rules.number ? <CheckCircleIcon /> : <span className={"size-4"} />}
                        <DropdownLabel>{`${rules.number} · ${labels.bracket(rules.slug)}`}</DropdownLabel>
                    </DropdownItem>
                ))}
            </DropdownMenu>
        </Dropdown>
    );
}
