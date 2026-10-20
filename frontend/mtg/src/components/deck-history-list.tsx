import { Badge, Button, Strong, Text } from "components";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import type { DeckChangeResponse, DeckEntryChangeResponse } from "src/api/generated";
import { useDeckLabels } from "src/components/deck-labels";
import { formatDateTime } from "src/utils/format";

/**
 * The properties for {@link DeckHistoryList}
 */
export type DeckHistoryListProps = {
    /** The deck whose Deck history is shown */
    deckUuid: string;
};

/**
 * A deck's Deck history, newest first, read page by page
 *
 * @returns the list
 */
export function DeckHistoryList({ deckUuid }: DeckHistoryListProps) {
    const [t] = useTranslation("deck");

    const [changes, setChanges] = useState<Array<DeckChangeResponse> | null>(null);
    const [cursor, setCursor] = useState<string | null>(null);
    const [loadingMore, setLoadingMore] = useState(false);

    useEffect(() => {
        let current = true;
        Api.decks
            .history(deckUuid)
            .then((page) => {
                if (!current) return;
                setChanges(page.changes);
                setCursor(page.next_cursor ?? null);
            })
            .catch(() => undefined);
        return () => {
            current = false;
        };
    }, [deckUuid]);

    /**
     * Appends the page after the last loaded Deck change
     */
    async function loadMore() {
        if (cursor === null) return;
        setLoadingMore(true);
        try {
            const page = await Api.decks.history(deckUuid, cursor);
            setChanges((held) => [...(held ?? []), ...page.changes]);
            setCursor(page.next_cursor ?? null);
        } catch {
            return;
        } finally {
            setLoadingMore(false);
        }
    }

    if (changes === null) return <Text>{t("label.history-loading")}</Text>;

    return (
        <div className={"flex flex-col gap-6"}>
            <ol className={"divide-y divide-zinc-950/5 dark:divide-white/5"}>
                {changes.map((change) => (
                    <DeckChangeRow key={change.uuid} change={change} />
                ))}
            </ol>
            {cursor !== null && (
                <div className={"flex justify-center"}>
                    <Button outline={true} disabled={loadingMore} onClick={loadMore}>
                        {t("button.history-load-older")}
                    </Button>
                </div>
            )}
        </div>
    );
}

/**
 * The properties for {@link DeckChangeRow}
 */
type DeckChangeRowProps = {
    /** The Deck change */
    change: DeckChangeResponse;
};

/**
 * One Deck change in deck-building terms, with when it happened
 *
 * @returns the row
 */
function DeckChangeRow({ change }: DeckChangeRowProps) {
    const [t] = useTranslation("deck");

    /**
     * What the Deck change did, in words
     *
     * @returns the lines
     */
    function body() {
        switch (change.kind) {
            case "Created":
                return <Strong>{t("label.history-created")}</Strong>;
            case "Introduced":
                return (
                    <Strong>
                        {t("label.history-introduced", {
                            count: change.entries.reduce((sum, entry) => sum + entry.after, 0),
                        })}
                    </Strong>
                );
            case "Edit":
                return (
                    <ul className={"flex flex-col gap-1"}>
                        {change.entries.map((entry) => (
                            <EntryLine
                                key={`${entry.printing}-${entry.zone}-${entry.foil}-${entry.proxy}`}
                                entry={entry}
                            />
                        ))}
                    </ul>
                );
        }
    }

    return (
        <li className={"flex flex-col gap-1 py-3 sm:flex-row sm:gap-6"}>
            <Text className={"shrink-0 tabular-nums sm:w-40"}>{formatDateTime(change.changed_at)}</Text>
            <div className={"min-w-0"}>{body()}</div>
        </li>
    );
}

/**
 * The properties for {@link EntryLine}
 */
type EntryLineProps = {
    /** What happened to one Deck entry */
    entry: DeckEntryChangeResponse;
};

/**
 * One Deck entry's change, e.g. "+3 Forest (Main deck)"
 *
 * @returns the line
 */
function EntryLine({ entry }: EntryLineProps) {
    const [t] = useTranslation("deck");
    const labels = useDeckLabels();

    const delta = entry.after - entry.before;
    return (
        <li className={"flex flex-wrap items-center gap-2"}>
            <Strong className={"tabular-nums"}>{delta > 0 ? `+${delta}` : `−${-delta}`}</Strong>
            <Text>
                {t("label.history-entry", {
                    name: entry.name ?? t("label.unknown-printing"),
                    zone: labels.zone(entry.zone),
                })}
            </Text>
            {entry.foil && <Badge color={"amber"}>{t("label.foil")}</Badge>}
            {entry.proxy && <Badge color={"zinc"}>{t("label.proxy")}</Badge>}
        </li>
    );
}
