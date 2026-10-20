import { Badge, Button, Strong, Text } from "components";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import type { DeckChangeResponse, DeckEntryChangeResponse, FieldDifference } from "src/api/generated";
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

    const added = change.entries.reduce((sum, entry) => sum + Math.max(entry.after - entry.before, 0), 0);
    const removed = change.entries.reduce((sum, entry) => sum + Math.max(entry.before - entry.after, 0), 0);

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
                return <EntryLines entries={change.entries} />;
            case "Move":
                return (
                    <Headed heading={t("label.history-move")}>
                        <EntryLines entries={change.entries} />
                    </Headed>
                );
            case "Switch":
                return (
                    <Headed heading={t("label.history-switch")}>
                        <EntryLines entries={change.entries} />
                    </Headed>
                );
            case "Swap":
                return (
                    <Headed heading={t("label.history-swap")}>
                        <EntryLines entries={change.entries} />
                    </Headed>
                );
            case "Sourcing":
                return (
                    <Headed heading={t("label.history-sourcing")}>
                        <EntryLines entries={change.entries} />
                    </Headed>
                );
            case "Import":
                return <Collapsed heading={t("label.history-import", { count: added })} entries={change.entries} />;
            case "Fill":
                return <Collapsed heading={t("label.history-fill", { count: added })} entries={change.entries} />;
            case "Replace":
                return <Collapsed heading={t("label.history-replace", { added, removed })} entries={change.entries} />;
            case "Settings":
                return (
                    <ul className={"flex flex-col gap-1"}>
                        {change.fields.map((field) => (
                            <FieldLine key={field.field} field={field} />
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
 * The properties for {@link Headed}
 */
type HeadedProps = {
    /** What kind of Deck change it is, in words */
    heading: string;
    /** The lines under it */
    children: React.ReactNode;
};

/**
 * A Deck change's kind above what it did
 *
 * @returns the block
 */
function Headed({ heading, children }: HeadedProps) {
    return (
        <div className={"flex flex-col gap-1"}>
            <Strong>{heading}</Strong>
            {children}
        </div>
    );
}

/**
 * The properties for {@link Collapsed}
 */
type CollapsedProps = {
    /** What the Deck change did, summed up */
    heading: string;
    /** The Deck entries it touched */
    entries: Array<DeckEntryChangeResponse>;
};

/**
 * A summary of a Deck change touching many Deck entries, opened for the lines
 *
 * @returns the block
 */
function Collapsed({ heading, entries }: CollapsedProps) {
    const [t] = useTranslation("deck");

    return (
        <details className={"group flex flex-col gap-1"}>
            <summary className={"cursor-pointer"}>
                <Strong>{heading}</Strong> <Text className={"inline"}>{t("label.history-show-entries")}</Text>
            </summary>
            <div className={"pt-1"}>
                <EntryLines entries={entries} />
            </div>
        </details>
    );
}

/**
 * The properties for {@link EntryLines}
 */
type EntryLinesProps = {
    /** The Deck entries a Deck change touched */
    entries: Array<DeckEntryChangeResponse>;
};

/**
 * One line per Deck entry a Deck change touched
 *
 * @returns the list
 */
function EntryLines({ entries }: EntryLinesProps) {
    return (
        <ul className={"flex flex-col gap-1"}>
            {entries.map((entry) => (
                <EntryLine key={`${entry.printing}-${entry.zone}-${entry.foil}-${entry.proxy}`} entry={entry} />
            ))}
        </ul>
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
            <Text className={"tabular-nums"}>
                {t("label.history-quantities", { before: entry.before, after: entry.after })}
            </Text>
        </li>
    );
}

/**
 * The properties for {@link FieldLine}
 */
type FieldLineProps = {
    /** What happened to one deck field */
    field: FieldDifference;
};

/**
 * One deck field's change, e.g. "Format: Standard → Pioneer"
 *
 * @returns the line
 */
function FieldLine({ field }: FieldLineProps) {
    const [t] = useTranslation("deck");
    const labels = useDeckLabels();

    /**
     * The colours a deck may play, in words
     *
     * @param colors the colour letters, `null` for the commander's
     *
     * @returns the words
     */
    function colors(colors: string | null | undefined) {
        if (colors === null || colors === undefined) return t("label.history-value-commander-colors");
        if (colors === "") return labels.color("");
        return Array.from(colors, (letter) => labels.color(letter)).join(", ");
    }

    /**
     * Whether the table agreed to something, in words
     *
     * @param allowed the agreement
     *
     * @returns the words
     */
    function agreement(allowed: boolean) {
        return allowed ? t("label.history-value-allowed") : t("label.history-value-not-allowed");
    }

    /**
     * The field's name and both of its values, in words
     *
     * @returns name, before and after
     */
    function words(): [string, string, string] {
        const none = t("label.history-value-none");
        switch (field.field) {
            case "Name":
                return [t("label.history-field-name"), field.before, field.after];
            case "Description":
                return [t("label.history-field-description"), field.before ?? none, field.after ?? none];
            case "Format":
                return [t("label.history-field-format"), labels.format(field.before), labels.format(field.after)];
            case "Colors":
                return [t("label.history-field-colors"), colors(field.before), colors(field.after)];
            case "Bracket":
                return [
                    t("label.history-field-bracket"),
                    field.before?.toString() ?? none,
                    field.after?.toString() ?? none,
                ];
            case "AllowExtraCommanders":
                return [
                    t("label.history-field-allow-extra-commanders"),
                    agreement(field.before),
                    agreement(field.after),
                ];
            case "AllowDuplicates":
                return [t("label.history-field-allow-duplicates"), agreement(field.before), agreement(field.after)];
            case "AllowBanned":
                return [t("label.history-field-allow-banned"), agreement(field.before), agreement(field.after)];
            case "DeckSize":
                return [
                    t("label.history-field-deck-size"),
                    field.before?.toString() ?? t("label.history-value-format-size"),
                    field.after?.toString() ?? t("label.history-value-format-size"),
                ];
        }
    }

    const [name, before, after] = words();
    return (
        <li className={"flex flex-wrap items-baseline gap-2"}>
            <Strong>{name}</Strong>
            <Text className={"line-clamp-2 break-words"}>{t("label.history-field-change", { before, after })}</Text>
        </li>
    );
}
