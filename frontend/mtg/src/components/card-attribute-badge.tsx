import type { BadgeProps } from "components";
import { Badge } from "components";
import { useTranslation } from "react-i18next";
import type { CardCondition, CardFinish } from "src/api/generated";

/**
 * Translation key per grade — spelled out because the scanner only sees literal
 * `t()` arguments, and because the enum names are not kebab-case slugs.
 *
 * These live in the general namespace: a grade is a property of a card, not of
 * the collection page, and the same badge shows up wherever cards are listed.
 */
export const CONDITION_KEY: Record<CardCondition, string> = {
    Mint: "label.condition-mint",
    NearMint: "label.condition-near-mint",
    Excellent: "label.condition-excellent",
    Good: "label.condition-good",
    LightPlayed: "label.condition-light-played",
    Played: "label.condition-played",
    Poor: "label.condition-poor",
};

/**
 * Badge colour per grade, following Cardmarket's scale.
 *
 * Cardmarket runs the grades along a green-to-red gradient, which is what makes
 * a condition readable at a glance without reading the label. Mapped onto the
 * component library's palette rather than Cardmarket's own hex values, so the
 * badges stay consistent with the rest of the app in both light and dark mode.
 */
const CONDITION_COLOR: Record<CardCondition, BadgeProps["color"]> = {
    Mint: "emerald",
    NearMint: "green",
    Excellent: "lime",
    Good: "yellow",
    LightPlayed: "amber",
    Played: "orange",
    Poor: "red",
};

/** Translation key per finish, see {@link CONDITION_KEY} */
export const FINISH_KEY: Record<CardFinish, string> = {
    Nonfoil: "label.finish-nonfoil",
    Foil: "label.finish-foil",
    Etched: "label.finish-etched",
};

/** Badge colour per finish — only the foils are worth setting apart */
const FINISH_COLOR: Record<CardFinish, BadgeProps["color"]> = {
    Nonfoil: "zinc",
    Foil: "sky",
    Etched: "violet",
};

/** The grades in Cardmarket's order, best first */
export const CONDITION_ORDER: Array<CardCondition> = [
    "Mint",
    "NearMint",
    "Excellent",
    "Good",
    "LightPlayed",
    "Played",
    "Poor",
];

/** The finishes, plainest first */
export const FINISH_ORDER: Array<CardFinish> = ["Nonfoil", "Foil", "Etched"];

/**
 * The properties for {@link ConditionBadge}
 */
export type ConditionBadgeProps = {
    /** The grade to show */
    condition: CardCondition;
};

/**
 * A card's condition as a colour-coded badge
 *
 * @returns the badge
 */
export function ConditionBadge({ condition }: ConditionBadgeProps) {
    const [tg] = useTranslation();

    return <Badge color={CONDITION_COLOR[condition]}>{tg(CONDITION_KEY[condition])}</Badge>;
}

/**
 * The properties for {@link FinishBadge}
 */
export type FinishBadgeProps = {
    /** The finish to show */
    finish: CardFinish;
};

/**
 * A card's finish as a colour-coded badge
 *
 * @returns the badge
 */
export function FinishBadge({ finish }: FinishBadgeProps) {
    const [tg] = useTranslation();

    return <Badge color={FINISH_COLOR[finish]}>{tg(FINISH_KEY[finish])}</Badge>;
}
