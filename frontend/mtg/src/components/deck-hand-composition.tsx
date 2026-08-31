import { Strong, Text } from "components";
import type { ReactNode } from "react";
import type { DeckTagResponse } from "src/api/generated";
import { seriesColor, TAG_CHART_COLORS } from "src/components/charts/colors";
import { DeckTagMarker } from "src/components/deck-tag-marker";
import type { HandGroup, HandSplit } from "src/utils/deck-odds";
import { MANA_CURVE_CAP } from "src/utils/deck-stats";
import { tagColor, TAG_COLOR_FALLBACK, TAG_ICON_FALLBACK } from "src/utils/deck-tags";
import { formatChance, formatExpected } from "src/utils/format";
import type { Translate } from "src/utils/translate";

/**
 * The properties for {@link DeckHandComposition}
 */
export type DeckHandCompositionProps = {
    /** The groups the hand is broken into, in the order they are drawn */
    groups: Array<HandGroup>;
    /** What they are groups of */
    split: HandSplit;
    /** The tags that exist, for naming and colouring the tag rows */
    tags: Array<DeckTagResponse>;
    /** The deck namespace's translate function */
    t: Translate;
};

/**
 * What the opening hand is made of, by mana value or by tag.
 *
 * The land distribution beside it says how many lands turn up; this says what
 * the rest of the hand is. Both numbers per row are worth having: how many
 * copies a hand holds on average is what a curve is judged by, and how often it
 * holds any at all is what decides whether a tag the deck leans on is actually
 * there on turn one.
 *
 * @returns the rows
 */
export function DeckHandComposition({ groups, split, tags, t }: DeckHandCompositionProps) {
    const most = Math.max(...groups.map((group) => group.expected), 0);

    return (
        <>
            <div className={"flex items-center gap-3"}>
                <span className={"min-w-0 flex-1"} />
                <Text className={"w-10 shrink-0 text-right text-[0.6875rem]"}>{t("label.hand-expected")}</Text>
                <Text className={"w-12 shrink-0 text-right text-[0.6875rem]"}>{t("label.hand-at-least-one")}</Text>
            </div>

            <ul className={"flex flex-col gap-1.5"}>
                {groups.map((group, index) => (
                    <Row
                        key={group.key}
                        group={group}
                        share={most === 0 ? 0 : group.expected / most}
                        label={split === "mana" ? manaLabel(t, group.key) : tagLabel(group.key, tags, t)}
                        color={split === "mana" ? seriesColor(0) : tagBarColor(group.key, tags, index)}
                        marker={split === "mana" ? undefined : <TagMarker uuid={group.key} tags={tags} />}
                    />
                ))}
            </ul>
        </>
    );
}

/**
 * The properties for {@link Row}
 */
type RowProps = {
    /** The group the row stands for */
    group: HandGroup;
    /** How long its bar is against the fullest one, between zero and one */
    share: number;
    /** What the group is called */
    label: string;
    /** The bar's colour */
    color: string;
    /** A symbol in front of the name */
    marker?: ReactNode;
};

/**
 * One group as a bar, an expected number and a chance
 *
 * @returns the row
 */
function Row({ group, share, label, color, marker }: RowProps) {
    return (
        <li className={"flex items-center gap-3"}>
            <span className={"flex w-28 shrink-0 items-center gap-1.5"}>
                {marker}
                <Text className={"truncate text-xs"} title={label}>
                    {label}
                </Text>
            </span>
            <div className={"h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-zinc-950/5 dark:bg-white/10"}>
                <div className={"h-full rounded-full"} style={{ width: `${share * 100}%`, backgroundColor: color }} />
            </div>
            <Strong className={"w-10 shrink-0 text-right text-xs tabular-nums"}>
                {formatExpected(group.expected)}
            </Strong>
            <Text className={"w-12 shrink-0 text-right text-xs tabular-nums"}>{formatChance(group.atLeastOne)}</Text>
        </li>
    );
}

/**
 * The properties for {@link TagMarker}
 */
type TagMarkerProps = {
    /** The tag's id, or the key the untagged cards are counted under */
    uuid: string;
    /** The tags that exist */
    tags: Array<DeckTagResponse>;
};

/**
 * A tag's marker, faded when it stands for the cards without one
 *
 * @returns the marker
 */
function TagMarker({ uuid, tags }: TagMarkerProps) {
    const tag = tags.find((candidate) => candidate.uuid === uuid);
    return (
        <DeckTagMarker
            size={"sm"}
            color={tag === undefined ? TAG_COLOR_FALLBACK : tagColor(tag.color)}
            icon={tag?.icon ?? TAG_ICON_FALLBACK}
            className={tag === undefined ? "opacity-60" : undefined}
        />
    );
}

/**
 * What a mana value row is called
 *
 * @param t the deck namespace's translate function
 * @param key the bucket, as it was counted
 *
 * @returns its name
 */
function manaLabel(t: Translate, key: string): string {
    return key === String(MANA_CURVE_CAP)
        ? t("label.mana-value-cap", { value: key })
        : t("label.mana-value", { value: key });
}

/**
 * What a tag row is called
 *
 * @param key the tag's id, or the key the untagged cards are counted under
 * @param tags the tags that exist
 * @param t the deck namespace's translate function
 *
 * @returns its name
 */
function tagLabel(key: string, tags: Array<DeckTagResponse>, t: Translate): string {
    return tags.find((candidate) => candidate.uuid === key)?.name ?? t("label.untagged");
}

/**
 * The colour a tag's bar is drawn in, as its marker is printed
 *
 * @param key the tag's id, or the key the untagged cards are counted under
 * @param tags the tags that exist
 * @param index where the row sits, which picks a fallback colour
 *
 * @returns the colour
 */
function tagBarColor(key: string, tags: Array<DeckTagResponse>, index: number): string {
    const tag = tags.find((candidate) => candidate.uuid === key);
    const slug = tag === undefined ? TAG_COLOR_FALLBACK : tagColor(tag.color);
    return TAG_CHART_COLORS[slug] ?? seriesColor(index);
}
