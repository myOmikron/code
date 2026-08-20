import { CheckIcon } from "@heroicons/react/20/solid";
import { Badge, Strong, Text } from "components";
import { CardImage } from "./card-image";
import { formatCurrency, printingCoordinate } from "src/utils/format";
import type { CardRecord } from "src/types";

/**
 * The properties for {@link CardChooser}
 */
export type CardChooserProps = {
    cards: CardRecord[];
    selectedId: string;
    onSelect: (card: CardRecord) => void;
    /** Accessible name for the group, e.g. "Erkannte Karte wählen". */
    label: string;
    /**
     * `swipe` for a handful of candidates next to a result, `grid` for the full printing list —
     *  swiping sideways through forty printings is worse than scrolling down through them.
     */
    layout?: "swipe" | "grid";
};

/**
 * A swipeable row of candidate cards, one selected.
 *
 * Recognition is frequently right about the *card* and wrong about the *printing* — across the
 * labelled photos the correct printing sits in the top three even when the top one is wrong. So
 * the runners-up are worth showing rather than hiding behind a disclosure: picking the right one
 * is a swipe, not a rescan.
 *
 * Swiping is CSS scroll-snap rather than a gesture handler, which gives touch, trackpad, mouse
 * wheel and keyboard for free and stays accessible.
 *
 * @returns the candidate row, or nothing when there is no candidate
 */
export function CardChooser({ cards, selectedId, onSelect, label, layout = "swipe" }: CardChooserProps) {
    if (cards.length === 0) return null;

    const grid = layout === "grid";
    return (
        <div
            className={
                grid
                    ? "grid max-h-[58vh] grid-cols-1 gap-3 overflow-y-auto sm:grid-cols-2"
                    : "-mx-1 flex snap-x snap-mandatory [scrollbar-width:none] gap-3 overflow-x-auto px-1 pb-2 [&::-webkit-scrollbar]:hidden"
            }
            role="radiogroup"
            aria-label={label}
        >
            {cards.map((card) => {
                const selected = card.id === selectedId;
                return (
                    <button
                        key={card.id}
                        role="radio"
                        aria-checked={selected}
                        onClick={() => onSelect(card)}
                        className={`flex items-start gap-3 rounded-2xl border p-3 text-left transition-colors ${
                            grid ? "w-full" : "w-[15rem] shrink-0 snap-start"
                        } ${selected ? "border-brand-600 bg-brand-600/10" : "border-zinc-200 dark:border-zinc-700"}`}
                    >
                        <CardImage card={card} className="h-[101px] w-[72px] shrink-0 rounded-md" />
                        <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                                <Strong className="block min-w-0 truncate">{card.name}</Strong>
                                {selected && <CheckIcon className="text-brand-600 size-5 shrink-0" />}
                            </div>
                            <Text className="truncate">{card.setName}</Text>
                            <Text className="truncate">{printingCoordinate(card)}</Text>
                            {card.priceEur !== null && <Badge className="mt-1">{formatCurrency(card.priceEur)}</Badge>}
                        </div>
                    </button>
                );
            })}
        </div>
    );
}
