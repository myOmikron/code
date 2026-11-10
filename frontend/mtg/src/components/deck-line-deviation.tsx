import { Badge } from "components";
import { useTranslation } from "react-i18next";
import type { DeviationCopiesResponse } from "src/api/generated";
import { useLineDeviation } from "src/context/deck-deviation-context";
import { lineMarks } from "src/utils/deck-deviation";
import type { LineMark } from "src/utils/deck-deviation";

/**
 * The properties for {@link DeckLineDeviation}
 */
export type DeckLineDeviationProps = {
    /** The Deck entry's uuid */
    entry: string;
};

/**
 * What one line of the card list says about the Physical deck
 *
 * Copies missing, another printing standing in, too many copies, and how many
 * copies are Proxies, each as a badge beside the line's other marks. Nothing
 * for a line the box holds exactly in real cards, and nothing at all where the
 * Deviation is unknown.
 *
 * @returns the badges, or nothing
 */
export function DeckLineDeviation({ entry }: DeckLineDeviationProps) {
    const [t] = useTranslation("deck");
    const line = useLineDeviation(entry);
    const marks = lineMarks(line);
    if (marks.length === 0) return null;

    return marks.map((mark) => (
        <Badge
            key={mark.kind}
            color={mark.kind === "proxies" ? "purple" : "amber"}
            title={mark.kind === "other-printing" ? othersTitle(line?.other_printing ?? [], t) : undefined}
        >
            {label(mark, t)}
        </Badge>
    ));
}

/**
 * The words of one mark
 *
 * @param mark the mark
 * @param t the deck namespace's translate function
 *
 * @returns the label
 */
function label(mark: LineMark, t: (key: string, options?: Record<string, unknown>) => string): string {
    switch (mark.kind) {
        case "short":
            return t("label.deviation-short", { held: mark.held, wanted: mark.wanted });
        case "other-printing":
            return t("label.deviation-other-printing", { count: mark.copies });
        case "surplus":
            return t("label.deviation-surplus", { count: mark.copies });
        case "proxies":
            return t("label.deviation-proxies", { count: mark.copies });
    }
}

/**
 * Which printings stand in for the line, for the tooltip of its mark
 *
 * @param copies the copies of other printings
 * @param t the deck namespace's translate function
 *
 * @returns the tooltip
 */
function othersTitle(
    copies: Array<DeviationCopiesResponse>,
    t: (key: string, options?: Record<string, unknown>) => string,
): string {
    const printings = copies.map((entry) => `${entry.quantity}× ${copiesLabel(entry, t)}`).join(", ");
    return t("label.deviation-other-printing-title", { printings });
}

/**
 * How copies of one printing are written: set, collector number, finish, Proxy
 *
 * @param copies the copies
 * @param t the deck namespace's translate function
 *
 * @returns the label
 */
export function copiesLabel(
    copies: DeviationCopiesResponse,
    t: (key: string, options?: Record<string, unknown>) => string,
): string {
    const print =
        copies.card == null ? t("label.unknown-printing") : `${copies.card.set_code} #${copies.card.collector_number}`;
    const foil = copies.foil ? ` · ${t("label.foil")}` : "";
    const proxy = copies.proxy ? ` · ${t("label.proxy")}` : "";
    return `${print}${foil}${proxy}`;
}
