import { ExclamationTriangleIcon } from "@heroicons/react/20/solid";
import { Strong, Text } from "components";
import { useTranslation } from "react-i18next";
import type { DeckDriftResponse, DeckDriftRowResponse } from "src/api/generated";
import { driftCopies, driftSections } from "src/utils/deck-drift";
import type { DriftKind } from "src/utils/deck-drift";

/**
 * The properties for {@link DeckDriftPanel}
 */
export type DeckDriftPanelProps = {
    /** What the service found between the list and the deck's collection */
    drift: DeckDriftResponse;
};

/**
 * Why the header says the list and the deck do not match.
 *
 * The chip in the header is a claim; this is the evidence for it, in the place
 * somebody lands when they tap it. Every reason is read out with the cards it
 * applies to, because "something is off" is not an answer anybody can act on —
 * and the two lists below the panel are where the acting happens.
 *
 * @returns the panel, or nothing when the two agree
 */
export function DeckDriftPanel({ drift }: DeckDriftPanelProps) {
    const [t] = useTranslation("collection");

    const sections = driftSections(drift);
    if (sections.length === 0) return null;

    return (
        <section
            className={
                "flex flex-col gap-4 rounded-(--radius-card) bg-amber-500/5 p-4 ring-1 ring-amber-600/20 dark:ring-amber-400/25"
            }
        >
            <div className={"flex items-start gap-2"}>
                <ExclamationTriangleIcon className={"mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400"} />
                <div className={"flex flex-col gap-1"}>
                    <Strong>{t("heading.drift", { count: driftCopies(drift) })}</Strong>
                    <Text className={"text-sm"}>{t("description.drift")}</Text>
                </div>
            </div>

            <div className={"flex flex-col gap-4"}>
                {sections.map((section) => (
                    <div key={section.kind} className={"flex flex-col gap-1"}>
                        <Strong className={"text-sm"}>{t(reasonKey(section.kind), { count: section.copies })}</Strong>
                        <Text className={"text-xs"}>{t(adviceKey(section.kind))}</Text>
                        <ul className={"mt-1 flex flex-col gap-0.5"}>
                            {section.rows.map((row, index) => (
                                <li
                                    key={`${row.printing}-${index}`}
                                    className={"text-xs text-zinc-600 dark:text-zinc-400"}
                                >
                                    {line(row, t)}
                                </li>
                            ))}
                        </ul>
                    </div>
                ))}
            </div>
        </section>
    );
}

/**
 * The heading one reason is read out under
 *
 * @param kind the reason
 *
 * @returns its translation key
 */
function reasonKey(kind: DriftKind): string {
    return `label.drift-${kind}`;
}

/**
 * What to do about one reason
 *
 * @param kind the reason
 *
 * @returns its translation key
 */
function adviceKey(kind: DriftKind): string {
    return `description.drift-${kind}`;
}

/**
 * One card of a reason, as one line
 *
 * A row of the `other-printing` kind carries both prints, which is the whole
 * point of it: the deck holds one and the list asks for the other.
 *
 * @param row the card
 * @param t the translator of the collection namespace
 *
 * @returns the line
 */
function line(row: DeckDriftRowResponse, t: (key: string) => string): string {
    const held = print(row.card, t);
    const name = row.card?.name ?? t("label.unknown-printing");
    const foil = row.foil ? ` ${t("label.foil")}` : "";
    if (row.wanted == null) return `${row.quantity}× ${name} (${held})${foil}`;
    return `${row.quantity}× ${name} (${held})${foil} → ${print(row.wanted, t)}`;
}

/**
 * How one printing is written on a line
 *
 * @param card what the catalog knows, absent for a printing it has not caught up with
 * @param t the translator of the collection namespace
 *
 * @returns set code and collector number
 */
function print(card: DeckDriftRowResponse["card"], t: (key: string) => string): string {
    if (card == null) return t("label.unknown-printing");
    return `${card.set_code} ${card.collector_number}`;
}
