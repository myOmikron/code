import {
    ArrowsRightLeftIcon,
    CheckIcon,
    SparklesIcon,
    MagnifyingGlassIcon,
    MinusIcon,
    PhotoIcon,
    PlusIcon,
    TrashIcon,
} from "@heroicons/react/20/solid";
import { useTranslation } from "react-i18next";
import type { DeckCardResponse, DeckTagResponse, DeckZone } from "src/api/generated";
import { ContextMenu } from "src/components/context-menu";
import type { ContextMenuSection, MenuAt } from "src/components/context-menu";
import { useDeckLabels, ZONE_ORDER } from "src/components/deck-labels";
import { DeckTagMarker } from "src/components/deck-tag-marker";
import { canFoil, finishOf, onlyFoil } from "src/utils/deck-foil";

/**
 * The properties for {@link DeckCardMenu}
 */
export type DeckCardMenuProps = {
    /** The slot the menu belongs to, `null` while no menu is open */
    card: DeckCardResponse | null;
    /** Where it was opened, `null` while no menu is open */
    at: MenuAt | null;
    /** Every tag that can go on the card */
    tags: Array<DeckTagResponse>;
    /** The zones this card may be moved to */
    zones?: Array<DeckZone>;
    /** Opens the card in full */
    onInspect: (card: DeckCardResponse) => void;
    /** Records a new count */
    onChangeQuantity: (card: DeckCardResponse, quantity: number) => void;
    /** Moves the card into another zone */
    onMoveTo: (card: DeckCardResponse, zone: DeckZone) => void;
    /** Opens the print picker */
    onChangePrinting: (card: DeckCardResponse) => void;
    /** Sleeves the slot in foil, or takes the sheen off again */
    onToggleFoil: (card: DeckCardResponse, foil: boolean) => void;
    /** Puts a tag on the card or takes it off */
    onToggleTag: (card: DeckCardResponse, tag: DeckTagResponse, on: boolean) => void;
    /** Takes the card out of the deck */
    onDelete: (card: DeckCardResponse) => void;
    /** Called when the menu should close */
    onClose: () => void;
};

/**
 * Everything one card can be told, where the pointer already is.
 *
 * Right-clicking a card is the fastest route to the things that used to cost a
 * dialog: the count, the zone, the tags, the print. Only the lines are written
 * here; {@link ContextMenu} does the rest.
 *
 * @returns the menu
 */
export function DeckCardMenu({
    card,
    at,
    tags,
    zones = ZONE_ORDER,
    onInspect,
    onChangeQuantity,
    onMoveTo,
    onChangePrinting,
    onToggleFoil,
    onToggleTag,
    onDelete,
    onClose,
}: DeckCardMenuProps) {
    const [t] = useTranslation("deck");
    const labels = useDeckLabels();

    if (card === null) return null;

    const name = card.card?.name ?? t("label.unknown-printing");
    const sections: Array<ContextMenuSection> = [
        {
            key: "card",
            items: [
                {
                    key: "add",
                    label: t("button.add-one"),
                    icon: <PlusIcon />,
                    onSelect: () => onChangeQuantity(card, card.quantity + 1),
                },
                {
                    key: "remove",
                    label: t("button.remove-one"),
                    icon: <MinusIcon />,
                    onSelect: () => onChangeQuantity(card, card.quantity - 1),
                },
                {
                    key: "inspect",
                    label: t("button.inspect-card"),
                    icon: <MagnifyingGlassIcon />,
                    onSelect: () => onInspect(card),
                },
                {
                    key: "printing",
                    label: t("button.change-printing"),
                    icon: <PhotoIcon />,
                    shortcut: "P",
                    onSelect: () => onChangePrinting(card),
                },
                {
                    key: "foil",
                    label: t("button.use-foil"),
                    icon: finishOf(card) === "Nonfoil" ? <SparklesIcon /> : <CheckIcon />,
                    shortcut: "F",
                    disabled: !canFoil(card) || onlyFoil(card),
                    onSelect: () => onToggleFoil(card, !card.foil),
                },
            ],
        },
        {
            key: "zone",
            heading: t("label.zone"),
            items: zones
                .filter((zone) => zone !== card.zone)
                .map((zone) => ({
                    key: zone,
                    label: labels.zone(zone),
                    icon: <ArrowsRightLeftIcon />,
                    onSelect: () => onMoveTo(card, zone),
                })),
        },
        {
            key: "tags",
            heading: t("label.tags"),
            items: tags.map((tag, index) => ({
                key: tag.uuid,
                label: tag.name,
                icon: card.tags.includes(tag.uuid) ? (
                    <CheckIcon />
                ) : (
                    <DeckTagMarker color={tag.color} icon={tag.icon} size={"sm"} />
                ),
                shortcut: index < 9 ? String(index + 1) : undefined,
                keepOpen: true,
                onSelect: () => onToggleTag(card, tag, !card.tags.includes(tag.uuid)),
            })),
        },
        {
            key: "delete",
            items: [
                {
                    key: "delete",
                    label: t("button.remove-card"),
                    icon: <TrashIcon />,
                    tone: "danger",
                    onSelect: () => onDelete(card),
                },
            ],
        },
    ];

    return <ContextMenu title={name} at={at} sections={sections} onClose={onClose} />;
}
