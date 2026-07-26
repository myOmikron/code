import { CheckIcon } from "@heroicons/react/24/outline";
import { Badge, Strong, Text } from "components";
import { CardImage } from "./CardImage";
import { formatCurrency } from "../utils/format";
import type { CardRecord } from "../types";

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
 */
export function CardChooser({
  cards,
  selectedId,
  onSelect,
  label,
}: {
  cards: CardRecord[];
  selectedId: string;
  onSelect: (card: CardRecord) => void;
  /** Accessible name for the group, e.g. "Erkannte Karte wählen". */
  label: string;
}) {
  if (cards.length === 0) return null;

  return (
    <div
      className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
            className={`flex w-[15rem] shrink-0 snap-start items-start gap-3 rounded-2xl border p-3 text-left transition-colors ${
              selected ? "border-acid bg-acid/8" : "border-line bg-white/2"
            }`}
          >
            <CardImage card={card} className="h-[101px] w-[72px] shrink-0 rounded-md" />
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <Strong className="block min-w-0 truncate">{card.name}</Strong>
                {selected && <CheckIcon className="size-4 shrink-0 text-acid" />}
              </div>
              <Text className="truncate">{card.setName}</Text>
              <Text className="truncate">{card.setCode} · #{card.collectorNumber}</Text>
              {card.priceEur !== null && <Badge className="mt-1">{formatCurrency(card.priceEur)}</Badge>}
            </div>
          </button>
        );
      })}
    </div>
  );
}
