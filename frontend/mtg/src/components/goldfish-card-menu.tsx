import {
    ArrowDownOnSquareIcon,
    ArrowPathIcon,
    ArrowUpOnSquareIcon,
    ArrowUturnLeftIcon,
    DocumentDuplicateIcon,
    FireIcon,
    HandRaisedIcon,
    MagnifyingGlassPlusIcon,
    PlayIcon,
    SparklesIcon,
    StarIcon,
    TagIcon,
    TrashIcon,
} from "@heroicons/react/20/solid";
import { useTranslation } from "react-i18next";
import { ContextMenu } from "src/components/context-menu";
import type { ContextMenuControl, ContextMenuItem, ContextMenuSection } from "src/components/context-menu";
import type { GoldfishCard, GoldfishZone, LibraryEnd } from "src/utils/goldfish";

/**
 * The properties for {@link GoldfishCardMenu}
 */
export type GoldfishCardMenuProps = {
    /** Which card the menu is open on, and where */
    control: ContextMenuControl<GoldfishCard>;
    /** Sends the card somewhere */
    onMove: (card: GoldfishCard, zone: GoldfishZone, end?: LibraryEnd) => void;
    /** Turns the card sideways or back */
    onTap: (card: GoldfishCard) => void;
    /** Turns a two-faced card over */
    onFlip: (card: GoldfishCard) => void;
    /** Opens the counter dialog */
    onCounters: (card: GoldfishCard) => void;
    /** Puts a token copy next to the card */
    onCopy: (card: GoldfishCard) => void;
    /** Shows the card as large as the screen allows */
    onZoom: (card: GoldfishCard) => void;
};

/**
 * Everything one card on the table can do, at the pointer.
 *
 * @returns the menu
 */
export function GoldfishCardMenu({
    control,
    onMove,
    onTap,
    onFlip,
    onCounters,
    onCopy,
    onZoom,
}: GoldfishCardMenuProps) {
    const [t] = useTranslation("goldfish");
    const card = control.open?.item ?? null;

    /**
     * Wraps a handler so the menu closes after it
     *
     * @param run the handler
     *
     * @returns the wrapped handler
     */
    function then(run: (card: GoldfishCard) => void): () => void {
        return () => {
            if (card !== null) run(card);
            control.close();
        };
    }

    const sections: Array<ContextMenuSection> = [];
    if (card !== null) {
        const table: Array<ContextMenuItem> = [
            {
                key: "zoom",
                label: t("button.zoom"),
                icon: <MagnifyingGlassPlusIcon />,
                shortcut: "Z",
                onSelect: then(onZoom),
            },
        ];
        if (card.zone === "battlefield") {
            table.push({
                key: "tap",
                label: card.tapped ? t("button.untap") : t("button.tap"),
                icon: <ArrowPathIcon />,
                shortcut: "Leertaste",
                onSelect: then(onTap),
            });
        }
        if (card.backImage !== null) {
            table.push({
                key: "flip",
                label: t("button.flip"),
                icon: <ArrowUturnLeftIcon />,
                shortcut: "F",
                onSelect: then(onFlip),
            });
        }
        if (card.zone === "battlefield") {
            table.push({
                key: "counters",
                label: t("button.counters"),
                icon: <TagIcon />,
                shortcut: "C",
                onSelect: then(onCounters),
            });
            table.push({
                key: "copy",
                label: t("button.copy"),
                icon: <DocumentDuplicateIcon />,
                shortcut: "V",
                onSelect: then(onCopy),
            });
        }
        if (table.length > 0) sections.push({ key: "table", items: table });

        const moves: Array<ContextMenuItem> = [];
        if (card.token) {
            moves.push({
                key: "remove",
                label: t("button.remove-token"),
                icon: <TrashIcon />,
                tone: "danger",
                shortcut: "G",
                onSelect: then((entry) => onMove(entry, "graveyard")),
            });
        } else {
            if (card.zone !== "battlefield")
                moves.push({
                    key: "battlefield",
                    label: t("button.to-battlefield"),
                    icon: <PlayIcon />,
                    shortcut: "P",
                    onSelect: then((entry) => onMove(entry, "battlefield")),
                });
            if (card.zone !== "hand")
                moves.push({
                    key: "hand",
                    label: t("button.to-hand"),
                    icon: <HandRaisedIcon />,
                    shortcut: "H",
                    onSelect: then((entry) => onMove(entry, "hand")),
                });
            if (card.zone !== "graveyard")
                moves.push({
                    key: "graveyard",
                    label: t("button.to-graveyard"),
                    icon: <FireIcon />,
                    shortcut: "G",
                    onSelect: then((entry) => onMove(entry, "graveyard")),
                });
            if (card.zone !== "exile")
                moves.push({
                    key: "exile",
                    label: t("button.to-exile"),
                    icon: <SparklesIcon />,
                    shortcut: "X",
                    onSelect: then((entry) => onMove(entry, "exile")),
                });
            moves.push({
                key: "top",
                label: t("button.to-library-top"),
                icon: <ArrowUpOnSquareIcon />,
                shortcut: "O",
                onSelect: then((entry) => onMove(entry, "library", "top")),
            });
            moves.push({
                key: "bottom",
                label: t("button.to-library-bottom"),
                icon: <ArrowDownOnSquareIcon />,
                shortcut: "B",
                onSelect: then((entry) => onMove(entry, "library", "bottom")),
            });
            if (card.zone !== "command")
                moves.push({
                    key: "command",
                    label: t("button.to-command"),
                    icon: <StarIcon />,
                    shortcut: "K",
                    onSelect: then((entry) => onMove(entry, "command")),
                });
        }
        sections.push({ key: "moves", heading: t("heading.move-to"), items: moves });
    }

    return <ContextMenu title={card?.name} at={control.open?.at ?? null} sections={sections} onClose={control.close} />;
}
