import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { DeckTagMarker } from "src/components/deck-tag-marker";
import { TAG_COLORS, TAG_ICONS } from "src/utils/deck-tags";
import type { TagColor, TagIconName } from "src/utils/deck-tags";

/**
 * The properties for {@link TagColorChoice}
 */
export type TagColorChoiceProps = {
    /** The colour picked now */
    value: TagColor;
    /** The pictogram used to preview it */
    icon: TagIconName;
    /** Takes the picked colour */
    onChange: (color: TagColor) => void;
};

/**
 * The colour a tag is drawn in, as the colours themselves
 *
 * @returns the swatches
 */
export function TagColorChoice({ value, icon, onChange }: TagColorChoiceProps) {
    const [t] = useTranslation("deck");

    return (
        <div className={"flex flex-wrap gap-2"}>
            {TAG_COLORS.map((option) => (
                <button
                    key={option}
                    type={"button"}
                    aria-label={t("accessibility.tag-color", { color: option })}
                    title={option}
                    aria-pressed={value === option}
                    onClick={() => onChange(option)}
                    className={clsx(
                        "rounded-full transition",
                        value === option
                            ? "ring-2 ring-zinc-950 ring-offset-2 ring-offset-white dark:ring-white dark:ring-offset-zinc-900"
                            : "hover:opacity-75",
                    )}
                >
                    <DeckTagMarker color={option} icon={icon} size={"lg"} />
                </button>
            ))}
        </div>
    );
}

/** The properties for {@link TagIconChoice} */
export type TagIconChoiceProps = {
    /** The pictogram picked now */
    value: TagIconName;
    /** The colour used to preview it */
    color: TagColor;
    /** Takes the picked pictogram */
    onChange: (icon: TagIconName) => void;
};

/** The pictogram a tag carries, previewed in its current colour */
export function TagIconChoice({ value, color, onChange }: TagIconChoiceProps) {
    const [t] = useTranslation("deck");

    return (
        <div className={"flex flex-wrap gap-2"}>
            {TAG_ICONS.map((option) => (
                <button
                    key={option}
                    type={"button"}
                    aria-label={t("accessibility.tag-icon", { icon: option })}
                    title={option}
                    aria-pressed={value === option}
                    onClick={() => onChange(option)}
                    className={clsx(
                        "rounded-full transition",
                        value === option
                            ? "ring-2 ring-zinc-950 ring-offset-2 ring-offset-white dark:ring-white dark:ring-offset-zinc-900"
                            : "hover:opacity-75",
                    )}
                >
                    <DeckTagMarker color={color} icon={option} size={"lg"} />
                </button>
            ))}
        </div>
    );
}
