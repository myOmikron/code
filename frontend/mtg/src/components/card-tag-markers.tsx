import type { DeckTagResponse } from "src/api/generated";
import { DeckTagMarker } from "src/components/deck-tag-marker";
import { tagColor, tagIcon } from "src/utils/deck-tags";

/**
 * The properties for {@link CardTagMarkers}
 */
export type CardTagMarkersProps = {
    /** The tags on this stack, by id */
    on: Array<string>;
    /** Every tag the account keeps, which is where the markers come from */
    tags?: Array<DeckTagResponse>;
    /** How big the markers are drawn */
    size?: "sm" | "md";
};

/**
 * The tags on a card, as their markers.
 *
 * Markers rather than names: a row already carries a name, a set and a price,
 * and what a tag is for is recognising a card at a glance. The name is in the
 * tooltip for the times that is not enough.
 *
 * @returns the markers, or nothing when the card carries no tag
 */
export function CardTagMarkers({ on, tags, size = "sm" }: CardTagMarkersProps) {
    const shown = (tags ?? []).filter((tag) => on.includes(tag.uuid));
    if (shown.length === 0) return null;

    return (
        <span className={"flex flex-wrap items-center gap-1"}>
            {shown.map((tag) => (
                <span key={tag.uuid} title={tag.name}>
                    <DeckTagMarker color={tagColor(tag.color)} icon={tagIcon(tag.icon)} size={size} />
                </span>
            ))}
        </span>
    );
}
