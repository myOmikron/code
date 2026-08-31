import { StackedList } from "components";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { DeckCardResponse, DeckTagResponse, DeckZone } from "src/api/generated";
import { DeckCardRow } from "src/components/deck-card-row";
import { GroupHeading } from "src/components/deck-card-grid";
import { useDeckLabels } from "src/components/deck-labels";
import { ManaCost } from "src/components/mana-cost";
import type { DeckGroup, DeckGrouping } from "src/utils/deck-grouping";
import type { SlotViolation } from "src/utils/deck-rules";

/**
 * The properties for {@link DeckCardList}
 */
export type DeckCardListProps = {
    /** The groups, already broken up and ordered */
    groups: Array<DeckGroup>;
    /** What the list is broken up by, which decides how a heading is named */
    grouping: DeckGrouping;
    /** What the format has to say, keyed by slot */
    violations: Map<string, Array<SlotViolation>>;
    /** The tags that exist */
    tags: Array<DeckTagResponse>;
    /** Opens a card's dialog */
    onInspect: (card: DeckCardResponse) => void;
    /** Records a new count, left out where the deck is only being looked at */
    onChangeQuantity?: (card: DeckCardResponse, quantity: number) => void;
    /** Takes a card out, left out where the deck is only being looked at */
    onDelete?: (card: DeckCardResponse) => void;
    /** Puts a tag on a card or takes it off, left out where it is only looked at */
    onToggleTag?: (card: DeckCardResponse, tag: DeckTagResponse, on: boolean) => void;
    /** Opens the tag manager */
    onManageTags?: () => void;
    /** Reports which card the pointer or the focus is on, for the number keys */
    onActivate?: (card: DeckCardResponse | null) => void;
    /** Whether a card is showing its back */
    isFlipped: (card: DeckCardResponse) => boolean;
    /** Turns a card over */
    onFlip: (card: DeckCardResponse) => void;
    /** Opens the card's menu where it was asked for */
    onMenu?: (card: DeckCardResponse, at: { x: number; y: number }) => void;
};

/**
 * A decklist under headings: what the deck is made of, in the order it is read.
 *
 * @returns the list
 */
export function DeckCardList({
    groups,
    grouping,
    violations,
    tags,
    onInspect,
    onChangeQuantity,
    onDelete,
    onToggleTag,
    onManageTags,
    onActivate,
    isFlipped,
    onFlip,
    onMenu,
}: DeckCardListProps) {
    const [t] = useTranslation("deck");
    const labels = useDeckLabels();

    /**
     * What a heading shows
     *
     * A colour is drawn as its mana symbol rather than spelled out: that is how
     * a decklist is read everywhere else, and five words of colour names in a
     * column of headings is noise.
     *
     * @param key the group's slug
     *
     * @returns the heading
     */
    function heading(key: string): ReactNode {
        switch (grouping) {
            case "zone":
                return labels.zone(key as DeckZone);
            case "mana":
                return key === "7" ? t("label.mana-value-cap", { value: key }) : t("label.mana-value", { value: key });
            case "color":
                if (key === "multicolor") return t("label.color-multicolor");
                if (key === "colorless") return <ManaCost value={"{C}"} />;
                return <ManaCost value={`{${key}}`} />;
            case "tag":
                if (key.startsWith("zone:")) return labels.zone(key.slice("zone:".length) as DeckZone);
                return tags.find((tag) => tag.uuid === key)?.name ?? t("label.untagged");
            case "type":
                return key.startsWith("zone:") ? labels.zone(key.slice("zone:".length) as DeckZone) : labels.type(key);
        }
    }

    return (
        <div className={"flex flex-col gap-8"}>
            {groups.map((group) => (
                <section key={group.key} className={"flex flex-col gap-2"}>
                    <GroupHeading
                        commander={group.key === "zone:Commander"}
                        copies={group.copies}
                        withMdfcs={group.withMdfcs}
                    >
                        {heading(group.key)}
                    </GroupHeading>
                    <StackedList>
                        {group.cards.map((card) => (
                            <DeckCardRow
                                key={card.uuid}
                                card={card}
                                violations={violations.get(card.uuid) ?? []}
                                tags={tags}
                                onInspect={onInspect}
                                onChangeQuantity={onChangeQuantity}
                                onDelete={onDelete}
                                onToggleTag={onToggleTag}
                                onManageTags={onManageTags}
                                onActivate={onActivate}
                                flipped={isFlipped(card)}
                                onFlip={() => onFlip(card)}
                                onMenu={onMenu}
                            />
                        ))}
                    </StackedList>
                </section>
            ))}
        </div>
    );
}
