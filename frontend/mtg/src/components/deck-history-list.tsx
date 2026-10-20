import { BookmarkIcon } from "@heroicons/react/16/solid";
import clsx from "clsx";
import { Badge, Button, Strong, Text, TextLink } from "components";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import type {
    DeckChangeResponse,
    DeckEntryChangeResponse,
    DeckHistoryResponse,
    DeckSettingsResponse,
    FieldDifference,
} from "src/api/generated";
import { useDeckLabels } from "src/components/deck-labels";
import { formatDateTime } from "src/utils/format";

/**
 * The properties for {@link DeckHistoryList}
 */
export type DeckHistoryListProps = {
    /** The deck whose Deck history is shown */
    deckUuid: string;
    /** The newest page of the Deck history, as the route loaded it */
    firstPage: DeckHistoryResponse;
};

/**
 * A deck's Deck history, newest first, read page by page
 *
 * @returns the list
 */
export function DeckHistoryList({ deckUuid, firstPage }: DeckHistoryListProps) {
    const [t] = useTranslation("deck");

    const [older, setOlder] = useState<Array<DeckChangeResponse>>([]);
    const [cursor, setCursor] = useState<string | null>(firstPage.next_cursor ?? null);
    const [loadingMore, setLoadingMore] = useState(false);

    useEffect(() => {
        setOlder([]);
        setCursor(firstPage.next_cursor ?? null);
    }, [firstPage]);

    const changes = [...firstPage.changes, ...older];

    /**
     * Appends the page after the last loaded Deck change
     */
    async function loadMore() {
        if (cursor === null) return;
        setLoadingMore(true);
        try {
            const page = await Api.decks.history(deckUuid, cursor);
            setOlder((held) => [...held, ...page.changes]);
            setCursor(page.next_cursor ?? null);
        } catch {
            return;
        } finally {
            setLoadingMore(false);
        }
    }

    return (
        <div className={"flex flex-col gap-6"}>
            <ol className={"divide-y divide-zinc-950/5 dark:divide-white/5"}>
                {changes.map((change) => (
                    <DeckChangeRow
                        key={change.uuid}
                        deckUuid={deckUuid}
                        change={change}
                        referenced={changes.find((other) => other.uuid === change.reference)}
                    />
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
    /** The deck the Deck change belongs to */
    deckUuid: string;
    /** The Deck change */
    change: DeckChangeResponse;
    /** The Deck change an undo, redo or reset refers to, when it is loaded */
    referenced?: DeckChangeResponse;
};

/**
 * One Deck change in deck-building terms, with when it happened as a link to the deck at that point
 *
 * @returns the row
 */
function DeckChangeRow({ deckUuid, change, referenced }: DeckChangeRowProps) {
    const [t] = useTranslation("deck");

    return (
        <li
            className={clsx(
                "flex flex-col gap-1 py-3 sm:flex-row sm:gap-6",
                change.checkpoint != null &&
                    "-mx-3 rounded-lg bg-blue-50 px-3 ring-1 ring-blue-600/20 dark:bg-blue-950/40 dark:ring-blue-400/30",
            )}
        >
            <Text className={"shrink-0 tabular-nums sm:w-40"}>
                <TextLink href={"/decks/$deckUuid/history/$changeUuid"} params={{ deckUuid, changeUuid: change.uuid }}>
                    {formatDateTime(change.changed_at)}
                    <span className={"sr-only"}>{t("accessibility.history-view-point")}</span>
                </TextLink>
            </Text>
            <div className={clsx("flex min-w-0 flex-col gap-1", change.undone && "opacity-60")}>
                {change.checkpoint != null && <CheckpointBadge name={change.checkpoint} />}
                {change.undone && (
                    <span>
                        <Badge color={"zinc"}>{t("label.history-undone")}</Badge>
                    </span>
                )}
                <DeckChangeBody change={change} referenced={referenced} />
            </div>
        </li>
    );
}

/**
 * The properties for {@link CheckpointBadge}
 */
export type CheckpointBadgeProps = {
    /** The Deck checkpoint's name */
    name: string;
};

/**
 * The Deck checkpoint naming a Deck change
 *
 * @returns the badge
 */
export function CheckpointBadge({ name }: CheckpointBadgeProps) {
    const [t] = useTranslation("deck");

    return (
        <span>
            <Badge color={"blue"}>
                <BookmarkIcon className={"size-3.5"} aria-label={t("accessibility.history-checkpoint")} />
                <span className={"break-all"}>{name}</span>
            </Badge>
        </span>
    );
}

/**
 * The properties for {@link DeckChangeBody}
 */
export type DeckChangeBodyProps = {
    /** The Deck change */
    change: DeckChangeResponse;
    /** The Deck change an undo, redo or reset refers to, when it is loaded */
    referenced?: DeckChangeResponse;
};

/**
 * What one Deck change did, in deck-building terms
 *
 * @returns the lines
 */
export function DeckChangeBody({ change, referenced }: DeckChangeBodyProps) {
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
            case "Quantity":
                return <EntryLines entries={change.entries} />;
            case "Move":
            case "Switch":
            case "Swap":
            case "Sourcing":
                return (
                    <Headed heading={t(ENTRY_HEADINGS[change.kind])}>
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
                return <FieldLines fields={change.fields} />;
            case "Undo":
            case "Redo":
                return (
                    <Headed heading={change.kind === "Undo" ? t("label.history-undo") : t("label.history-redo")}>
                        {referenced !== undefined && (
                            <Text>{t("label.history-undo-of", { date: formatDateTime(referenced.changed_at) })}</Text>
                        )}
                        <EntryLines entries={change.entries} />
                        <FieldLines fields={change.fields} />
                    </Headed>
                );
            case "Reset":
                return (
                    <Headed heading={t("label.history-reset")}>
                        {referenced !== undefined && (
                            <Text>{t("label.history-reset-to", { date: formatDateTime(referenced.changed_at) })}</Text>
                        )}
                        <Collapsed
                            heading={t("label.history-reset-summary", { added, removed })}
                            entries={change.entries}
                            fields={change.fields}
                        />
                    </Headed>
                );
        }
    }

    return body();
}

/** The heading of each kind of Deck change that lists its Deck entries under one */
const ENTRY_HEADINGS = {
    Move: "label.history-move",
    Switch: "label.history-switch",
    Swap: "label.history-swap",
    Sourcing: "label.history-sourcing",
} as const;

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
    /** The deck fields it changed, if any */
    fields?: Array<FieldDifference>;
};

/**
 * A summary of a Deck change touching many Deck entries, opened for the lines
 *
 * @returns the block
 */
function Collapsed({ heading, entries, fields = [] }: CollapsedProps) {
    const [t] = useTranslation("deck");

    return (
        <details className={"group flex flex-col gap-1"}>
            <summary className={"cursor-pointer"}>
                <Strong>{heading}</Strong> <Text className={"inline"}>{t("label.history-show-entries")}</Text>
            </summary>
            <div className={"flex flex-col gap-1 pt-1"}>
                <EntryLines entries={entries} />
                <FieldLines fields={fields} />
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
 * The properties for {@link FieldLines}
 */
type FieldLinesProps = {
    /** The deck fields a Deck change changed */
    fields: Array<FieldDifference>;
};

/**
 * One line per deck field a Deck change changed
 *
 * @returns the list
 */
function FieldLines({ fields }: FieldLinesProps) {
    return (
        <ul className={"flex flex-col gap-1"}>
            {fields.map((field) => (
                <FieldLine key={field.field} field={field} />
            ))}
        </ul>
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
    const words = useFieldWords();

    const [name, before, after] = words(field);
    return (
        <li className={"flex flex-wrap items-baseline gap-2"}>
            <Strong>{name}</Strong>
            <Text className={"line-clamp-2 break-words"}>{t("label.history-field-change", { before, after })}</Text>
        </li>
    );
}

/**
 * Words for recorded deck fields, the one place that names each field and says how its value reads
 *
 * @returns a function giving a field's name and both of its values, in words
 */
export function useFieldWords(): (field: FieldDifference) => [string, string, string] {
    const [t] = useTranslation("deck");
    const labels = useDeckLabels();
    const { colors, agreement } = useSettingWords();

    return (field) => {
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
    };
}

/**
 * A deck's recorded fields at one point, each as a change that kept its value
 *
 * @param settings the recorded fields
 *
 * @returns one field difference per recorded field, before and after alike
 */
export function settingsFields(settings: DeckSettingsResponse): Array<FieldDifference> {
    return [
        { field: "Name", before: settings.name, after: settings.name },
        { field: "Description", before: settings.description, after: settings.description },
        { field: "Format", before: settings.format, after: settings.format },
        { field: "Colors", before: settings.allowed_color_identity, after: settings.allowed_color_identity },
        { field: "Bracket", before: settings.bracket, after: settings.bracket },
        {
            field: "AllowExtraCommanders",
            before: settings.allow_extra_commanders,
            after: settings.allow_extra_commanders,
        },
        { field: "AllowDuplicates", before: settings.allow_duplicates, after: settings.allow_duplicates },
        { field: "AllowBanned", before: settings.allow_banned, after: settings.allow_banned },
        { field: "DeckSize", before: settings.deck_size, after: settings.deck_size },
    ];
}

/**
 * Words for the values of recorded deck fields that are no plain text
 *
 * @returns one function per kind of value
 */
function useSettingWords() {
    const [t] = useTranslation("deck");
    const labels = useDeckLabels();

    return {
        /**
         * The colours a deck may play, in words
         *
         * @param colors the colour letters, `null` for the commander's
         *
         * @returns the words
         */
        colors: (colors: string | null | undefined): string => {
            if (colors === null || colors === undefined) return t("label.history-value-commander-colors");
            if (colors === "") return labels.color("");
            return Array.from(colors, (letter) => labels.color(letter)).join(", ");
        },
        /**
         * Whether the table agreed to something, in words
         *
         * @param allowed the agreement
         *
         * @returns the words
         */
        agreement: (allowed: boolean): string =>
            allowed ? t("label.history-value-allowed") : t("label.history-value-not-allowed"),
    };
}
