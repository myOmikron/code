import { Badge } from "components";
import { useTranslation } from "react-i18next";

/**
 * The properties for {@link DeckProxyMarker}
 */
export type DeckProxyMarkerProps = {
    /** How many Proxies lie in the deck's Physical deck, `null` for a caller who may not know */
    count: number | null | undefined;
};

/**
 * Says that a deck contains Proxies, so a deck that is not proxy-free is told
 * apart at a glance; in the colour of the badge on a Proxy itself.
 *
 * @returns the marker, or nothing for a proxy-free deck
 */
export function DeckProxyMarker({ count }: DeckProxyMarkerProps) {
    const [tg] = useTranslation();

    if (count == null || count === 0) return null;

    return <Badge color={"purple"}>{tg("label.contains-proxies", { count })}</Badge>;
}
