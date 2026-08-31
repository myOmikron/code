import { Strong, Text } from "components";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { DeckCardResponse, DeckTagResponse } from "src/api/generated";
import { CardThumbnail } from "src/components/card-thumbnail";
import { useDeckLabels } from "src/components/deck-labels";
import { DeckTagBadge } from "src/components/deck-tag-picker";
import { ManaCost } from "src/components/mana-cost";
import { GameChangerMarker } from "src/components/game-changer-marker";
import { usePreloadImage } from "src/utils/use-preload-image";
import { artworkOf } from "src/utils/card-artwork";
import { finishOf, priceOf } from "src/utils/deck-foil";
import { formatCurrency } from "src/utils/format";
import { tagsOn } from "src/utils/deck-tags";

/**
 * The properties for {@link DeckCardPreview}
 */
export type DeckCardPreviewProps = {
    /** The card the pointer is on, `null` while it is on none */
    card: DeckCardResponse | null;
    /** The deck's commander, which the corner falls back to */
    commander: DeckCardResponse | null;
    /** The tags that exist, to name the ones on the card */
    tags: Array<DeckTagResponse>;
    /** Whether the shown card is displaying its back */
    flipped?: boolean;
};

/**
 * The card under the pointer, big enough to read, always in the same corner.
 *
 * A deck is scanned by running the pointer down it, and at the sizes a whole
 * deck fits on screen at, the rules text is a texture rather than a text. The
 * corner is fixed rather than following the pointer: the eye learns one place
 * and stops chasing.
 *
 * Under the artwork stands what the artwork cannot say — how many copies are
 * in, which zone they sit in, what the slot is worth, which print it is, and
 * the tags it carries.
 *
 * The commander holds that place from the moment the deck is opened, and every
 * card the pointer touches borrows it for as long as it is touched.
 *
 * The place itself belongs to the page: this is a panel, and the column it
 * lives in decides where that column sits and when it exists at all.
 *
 * @returns the preview
 */
export function DeckCardPreview({ card, commander, tags, flipped = false }: DeckCardPreviewProps) {
    const [t] = useTranslation("deck");
    const labels = useDeckLabels();
    const shown = card ?? commander;
    const printing = shown?.card ?? null;

    // Every hook runs before the panel decides whether it has anything to show.
    // Leaving early first and preloading afterwards meant this component
    // rendered three hooks with a card in hand and two without, which React
    // reports as "rendered fewer hooks than expected" the moment the pointer
    // leaves the last row of a deck without a commander.
    const back = artworkOf(printing, "back");
    usePreloadImage(back.image);

    if (shown === null) return null;

    const image = flipped && back.image !== null ? back.image : artworkOf(printing, "front").image;
    const finish = finishOf(shown);
    const price = priceOf(shown);
    const onSlot = tagsOn(shown, tags);

    return (
        <div className={"transition duration-300 ease-out starting:-translate-x-6 starting:opacity-0"}>
            <div
                className={
                    "flex flex-col gap-2 rounded-2xl bg-(--surface-card) p-2 shadow-2xl ring-1 ring-zinc-950/10 dark:ring-white/10"
                }
            >
                <CardThumbnail
                    name={printing?.name ?? ""}
                    image={image}
                    finish={finish}
                    className={"w-full rounded-xl"}
                />

                <div className={"flex flex-col gap-2 px-1 pb-1"}>
                    <div className={"flex items-start justify-between gap-2"}>
                        <Strong className={"min-w-0 truncate text-sm"}>
                            {printing?.name ?? t("label.unknown-printing")}
                        </Strong>
                        {printing != null && printing.mana_cost !== "" && (
                            <ManaCost value={printing.mana_cost} className={"shrink-0"} />
                        )}
                    </div>

                    {printing != null && <Text className={"truncate text-xs"}>{printing.type_line}</Text>}

                    <div className={"flex flex-wrap items-center gap-1.5"}>
                        <Chip>{`${shown.quantity}×`}</Chip>
                        {shown.zone !== "Main" && <Chip>{labels.zone(shown.zone)}</Chip>}
                        {finish !== "Nonfoil" && <Chip>{t("label.foil")}</Chip>}
                        {shown.proxy && <Chip>{t("label.proxy")}</Chip>}
                        {printing != null && <Chip>{`${printing.set_code} #${printing.collector_number}`}</Chip>}
                        {price !== null && <Chip>{formatCurrency((price * shown.quantity) / 100)}</Chip>}
                        {printing?.game_changer === true && <GameChangerMarker short />}
                    </div>

                    {onSlot.length > 0 && (
                        <div className={"flex flex-wrap items-center gap-1.5"}>
                            {onSlot.map((tag) => (
                                <DeckTagBadge key={tag.uuid} tag={tag} />
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

/**
 * One fact about the card, in the quiet style the tiles use
 *
 * @param props what the chip says
 * @param props.children the text
 *
 * @returns the chip
 */
function Chip({ children }: { children: ReactNode }) {
    return (
        <span
            className={
                "rounded-(--radius-pill) bg-zinc-950/5 px-2 py-0.5 text-xs font-medium text-zinc-600 tabular-nums dark:bg-white/10 dark:text-zinc-300"
            }
        >
            {children}
        </span>
    );
}
