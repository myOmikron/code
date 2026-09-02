import { Text } from "components";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { ScannerSessionEntryResponse } from "src/api/generated";
import { CardZoomDialog } from "src/components/card-zoom-dialog";
import { SessionStackRow } from "src/components/session-stack-row";
import { useScannerSessions } from "src/context/scanner-session-context";
import type { CardRecord } from "src/types";
import { useSessionCards } from "src/utils/use-session-cards";

/**
 * The properties for {@link SessionStackList}
 */
export type SessionStackListProps = {
    /** What is staged */
    entries: readonly ScannerSessionEntryResponse[];
};

/**
 * Everything staged in a session, as rows that can be corrected.
 *
 * Cards are looked up rather than stored: a session keeps printing ids, and this is where they
 * become names and artwork. The lookup is asked for once per printing and answers for every row
 * showing it, so a phone that just scanned forty cards and a desk that has never loaded the
 * catalogue draw the same list.
 *
 * @returns the list
 */
export function SessionStackList({ entries }: SessionStackListProps) {
    const [t] = useTranslation("session");
    const { updateEntry, deleteEntry } = useScannerSessions();
    const [zoomed, setZoomed] = useState<CardRecord | null>(null);
    const cards = useSessionCards(entries);

    if (entries.length === 0) return <Text>{t("description.nothing-staged")}</Text>;

    return (
        <>
            <ul className="divide-y divide-zinc-950/5 dark:divide-white/10">
                {entries.map((entry) => (
                    <SessionStackRow
                        key={entry.uuid}
                        entry={entry}
                        card={cards[entry.printing] ?? null}
                        onZoom={setZoomed}
                        onChange={(patch) => void updateEntry(entry.uuid, patch)}
                        onRemove={() => void deleteEntry(entry.uuid)}
                    />
                ))}
            </ul>

            <CardZoomDialog card={zoomed} onClose={() => setZoomed(null)} />
        </>
    );
}
