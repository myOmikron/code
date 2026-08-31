import { SparklesIcon } from "@heroicons/react/20/solid";
import clsx from "clsx";
import type { BadgeProps } from "components";
import { Badge } from "components";
import { useTranslation } from "react-i18next";
import type { CardCondition, CardFinish } from "src/api/generated";
import type { Translate } from "src/utils/translate";

/**
 * What a grade is called.
 *
 * Written as calls rather than as a table of key strings: the translation
 * scanner only ever reads keys spelled out inside a translate call, and one
 * reached through a variable is dropped as unused on its next sweep.
 *
 * The grades live in the general namespace: a grade is a property of a card,
 * not of the collection page, and the same badge shows up wherever cards are
 * listed.
 *
 * @param tg the general namespace's translate function
 * @param condition the grade to name
 *
 * @returns the label
 */
export function conditionLabel(tg: Translate, condition: CardCondition): string {
    switch (condition) {
        case "Mint":
            return tg("label.condition-mint");
        case "NearMint":
            return tg("label.condition-near-mint");
        case "Excellent":
            return tg("label.condition-excellent");
        case "Good":
            return tg("label.condition-good");
        case "LightPlayed":
            return tg("label.condition-light-played");
        case "Played":
            return tg("label.condition-played");
        case "Poor":
            return tg("label.condition-poor");
    }
}

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

/**
 * What a finish is called, see {@link conditionLabel}
 *
 * @param tg the general namespace's translate function
 * @param finish the finish to name
 *
 * @returns the label
 */
export function finishLabel(tg: Translate, finish: CardFinish): string {
    switch (finish) {
        case "Nonfoil":
            return tg("label.finish-nonfoil");
        case "Foil":
            return tg("label.finish-foil");
        case "Etched":
            return tg("label.finish-etched");
    }
}

/**
 * What a signed card is called, see {@link conditionLabel}
 *
 * @param tg the general namespace's translate function
 *
 * @returns the label
 */
export function signedLabel(tg: Translate): string {
    return tg("label.signed");
}

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
 * The properties for {@link FoilMark}
 */
export type FoilMarkProps = {
    /** The finish to mark, nothing is drawn for a plain one */
    finish: CardFinish | null | undefined;
    /** Additional CSS classes */
    className?: string;
};

/**
 * The little sheen that says a card is foil.
 *
 * A finish is the one property of a stack that is invisible in a list of names:
 * two rows of the same card, one worth five times the other. The badge says it
 * in words where there is room; this says it where there is not, and uses the
 * same pictogram the deck menu offers foil with.
 *
 * @returns the mark, or nothing for a plain card
 */
export function FoilMark({ finish, className }: FoilMarkProps) {
    const [tg] = useTranslation();

    if (finish == null || finish === "Nonfoil") return null;

    return (
        <SparklesIcon
            aria-label={finishLabel(tg, finish)}
            className={clsx("inline-block size-4 shrink-0 text-amber-500 dark:text-amber-400", className)}
        />
    );
}

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

    return <Badge color={CONDITION_COLOR[condition]}>{conditionLabel(tg, condition)}</Badge>;
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

    return <Badge color={FINISH_COLOR[finish]}>{finishLabel(tg, finish)}</Badge>;
}

/**
 * The properties for {@link SignedBadge}
 */
export type SignedBadgeProps = {
    /** Whether the cards carry a signature */
    signed: boolean;
};

/**
 * A badge for the stacks an artist has signed
 *
 * Only drawn when there is something to say: unsigned is what a card is, and a
 * badge on every row saying so would drown the two that are not.
 *
 * @returns the badge, or nothing for an unsigned stack
 */
export function SignedBadge({ signed }: SignedBadgeProps) {
    const [tg] = useTranslation();

    if (!signed) return null;

    return <Badge color={"pink"}>{signedLabel(tg)}</Badge>;
}
