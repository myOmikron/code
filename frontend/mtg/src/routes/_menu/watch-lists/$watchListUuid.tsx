import {
    BellAlertIcon,
    CheckCircleIcon,
    ChevronLeftIcon,
    MagnifyingGlassIcon,
    PlusIcon,
} from "@heroicons/react/20/solid";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import clsx from "clsx";
import {
    Button,
    EmptyState,
    FilterBar,
    FilterBarControl,
    FilterBarSearch,
    FilterChip,
    FilterChipGroup,
    Heading,
    Input,
    InputGroup,
    Link,
    Listbox,
    ListboxLabel,
    ListboxOption,
    PrimaryButton,
    Text,
    notify,
} from "components";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import type { CardFinish, WatchListEntryResponse, WatchedCopyResponse } from "src/api/generated";
import { PrintingDialog } from "src/components/printing-dialog";
import { RequireAccount } from "src/components/require-account";
import { WatchListAddDialog } from "src/components/watch-list-add-dialog";
import { WatchListEntryDialog } from "src/components/watch-list-entry-dialog";
import type { WatchListEntryEdit } from "src/components/watch-list-entry-dialog";
import { WatchLanguageDialog } from "src/components/watch-language-dialog";
import { WatchListPriceNote } from "src/components/watch-list-price-note";
import { WATCH_VIEWS } from "src/components/watch-view";
import type { WatchView } from "src/components/watch-view";
import { WatchViewCards } from "src/components/watch-view-cards";
import { WatchViewGrid } from "src/components/watch-view-grid";
import { WatchViewTable } from "src/components/watch-view-table";
import { formatCurrency } from "src/utils/format";
import { useShortcutHelpOpen } from "src/context/shortcut-help-context";
import i18n from "src/i18n";
import { hapticTap } from "src/utils/haptics";
import type { Printing } from "src/utils/scryfall";
import { usePointerCard } from "src/utils/use-pointer-card";
import { useShortcuts } from "src/utils/use-shortcuts";
import { useWatchMutations } from "src/utils/use-watch-mutations";
import {
    WATCH_LENSES,
    WATCH_SORTS,
    applyPatch,
    countEntry,
    matchesLens,
    nextFinish,
    sortEntries,
} from "src/utils/watch-list";
import type { WatchLens, WatchMatchPatch, WatchSort } from "src/utils/watch-list";

/**
 * How a watch list is being looked at
 *
 * In the url rather than in state, the same way a collection carries its own:
 * a link to a want list should arrive showing what the sender was looking at,
 * not reset to the default.
 */
export type WatchSearch = {
    /** How the rows are laid out */
    view?: WatchView;
    /** Which lens the rows are seen through */
    lens?: WatchLens;
    /** What the rows are ordered by */
    sort?: WatchSort;
    /** Whether that order is reversed */
    desc?: boolean;
    /** What was typed into the search field */
    q?: string;
};

export const Route = createFileRoute("/_menu/watch-lists/$watchListUuid")({
    validateSearch: (search: Record<string, unknown>): WatchSearch => ({
        view: WATCH_VIEWS.find((option) => option === search.view),
        lens: WATCH_LENSES.find((option) => option === search.lens),
        sort: WATCH_SORTS.find((option) => option === search.sort),
        desc: search.desc === true ? true : undefined,
        q: typeof search.q === "string" && search.q !== "" ? search.q : undefined,
    }),
    loader: async ({ params }) => {
        // `deck` comes along for the shortcut help dialog, which is shared
        // chrome and names itself out of that namespace. Nothing on this page
        // reads from it.
        await i18n.loadNamespaces(["watch-list", "deck"]);
        return Api.watchLists.entriesIfThere(params.watchListUuid);
    },
    component: RouteComponent,
});

/**
 * One watch list: the cards on it, what is already owned, and what they cost.
 *
 * Built as a single column on every width. A want list is read the way a
 * shopping list is read — top to bottom, one thumb, often standing up — and the
 * three lenses above it are the three errands somebody actually opens it for:
 * what went cheap, what is still missing, what is done.
 *
 * @returns the page
 */
function RouteComponent() {
    const [t] = useTranslation("watch-list");
    const { watchListUuid } = Route.useParams();
    const page = Route.useLoaderData();
    const search = Route.useSearch();
    const navigate = useNavigate({ from: Route.fullPath });
    const view = search.view ?? "cards";
    const lens = search.lens ?? "all";
    const sort = search.sort ?? "added";
    const descending = search.desc === true;
    const query = search.q ?? "";
    const router = useRouter();
    const [adding, setAdding] = useState(false);
    const [editing, setEditing] = useState<WatchListEntryResponse | null>(null);
    const [repicking, setRepicking] = useState<WatchListEntryResponse | null>(null);
    const [languaging, setLanguaging] = useState<WatchListEntryResponse | null>(null);
    // One row open at a time, and its stacks cached until something is written:
    // a shelf of full collections is a lot of rows to keep in memory, and the
    // answer goes stale the moment a card moves.
    const [unfolded, setUnfolded] = useState<string | null>(null);
    const [copies, setCopies] = useState<Record<string, Array<WatchedCopyResponse>>>({});
    // Rows whose stacks a write has outdated. Kept apart from the cache above
    // so the old answer stays on screen while the new one is being read:
    // dropping it would fold the open row down to a skeleton and jolt
    // everything below it, twice, for a switch that changes one badge.
    const [staleCopies, setStaleCopies] = useState<Record<string, true>>({});
    // The rows whose stacks are being read right now.
    //
    // A ref, not state, because it exists to stop the effect below from
    // starting a second read and must therefore be true the moment the first
    // one starts, not one render later.
    const readingCopies = useRef<Set<string>>(new Set());
    const [busy, setBusy] = useState<string | null>(null);
    // What the keys act on: the row under the pointer, or the one holding
    // focus. The same rule the deck builder's keys follow, so `F` means the
    // same thing in both places.
    const [hovered, setHovered] = useState<string | null>(null);
    const searchField = useRef<HTMLInputElement>(null);
    const shortcutHelpOpen = useShortcutHelpOpen();
    // Only a positive answer is taken. The correction exists to follow a row
    // that has moved under a stationary pointer, and it reports `null` for "the
    // point is over nothing" — which is also what it reports for one render in
    // the middle of a write, while the list is being replaced. Letting that
    // through cleared the marked row and left every row key dead until the
    // mouse moved again.
    // `router.invalidate` rather than the `refresh` below it: this runs after a
    // round trip, and by then the component may have taken the "list is gone"
    // branch, past which `refresh` was never initialised.
    const mutations = useWatchMutations(watchListUuid, () => router.invalidate());

    usePointerCard((key) => {
        if (key !== null) setHovered(key);
    });

    // The overlay over a written row is dropped here and nowhere else: only
    // with the loader's new rows on screen is there something to drop it in
    // favour of. Dropping it when the write came back showed the old value
    // for the frames until the re-read arrived, which is what made a single
    // tap read as foil → any → foil → any.
    const settleMutations = mutations.settle;
    useEffect(() => {
        settleMutations();
    }, [page, settleMutations]);

    // Everything below reads the rows through the pending changes, so a row
    // says what was last asked of it rather than what the loader last heard.
    const entries = useMemo(
        () => (page?.entries ?? []).map((entry) => applyPatch(entry, mutations.pending[entry.uuid])),
        [page, mutations.pending],
    );

    const counts = useMemo(
        () => ({
            all: entries.length,
            alarm: entries.filter((entry) => matchesLens(entry, "alarm")).length,
            missing: entries.filter((entry) => matchesLens(entry, "missing")).length,
            complete: entries.filter((entry) => matchesLens(entry, "complete")).length,
        }),
        [entries],
    );

    const shown = useMemo(() => {
        const needle = query.trim().toLowerCase();
        const kept = entries.filter((entry) => {
            if (!matchesLens(entry, lens)) return false;
            if (needle === "") return true;
            const card = entry.card;
            return (
                (card?.name ?? "").toLowerCase().includes(needle) ||
                (card?.set_name ?? "").toLowerCase().includes(needle) ||
                entry.note.toLowerCase().includes(needle)
            );
        });
        return sortEntries(kept, sort, descending);
    }, [entries, lens, query, sort, descending]);

    // Fetches the open row's stacks whenever there are none held for it, which
    // covers both opening a row for the first time and a write having dropped
    // what was held. `unfolded` is cleared on failure so the row does not sit
    // on a skeleton forever.
    //
    // What stops a second read is the ref, not the cache: the cache only fills
    // when the answer lands, and every render between the request and the
    // answer would otherwise start the request again. `staleCopies` is a
    // dependency and clearing the mark causes such a render, so "otherwise" was
    // a loop that fired the read as fast as the browser could re-render — some
    // forty round trips for one opened row, each holding a database connection
    // for a third of a second, which is what drained the pool.
    useEffect(() => {
        if (unfolded === null) return;
        if (copies[unfolded] !== undefined && staleCopies[unfolded] !== true) return;
        if (readingCopies.current.has(unfolded)) return;
        readingCopies.current.add(unfolded);

        // Returns what it was handed when there is nothing to clear, so a row
        // that was never stale does not replace the whole record with an equal
        // copy and re-run this effect for it.
        setStaleCopies((held) => {
            if (held[unfolded] !== true) return held;
            const { [unfolded]: _read, ...rest } = held;
            return rest;
        });

        // Held apart from `unfolded` so the answer is filed under the row it was
        // asked for. A row that was closed again in the meantime still keeps its
        // answer: it is keyed by row, and opening it once more should not cost a
        // second read.
        const row = unfolded;
        void Api.watchLists.entry
            .copies(watchListUuid, row)
            .then((answer) => {
                setCopies((held) => ({ ...held, [row]: answer.copies }));
            })
            .catch(() => {
                setUnfolded((open) => (open === row ? null : open));
            })
            .finally(() => {
                readingCopies.current.delete(row);
            });
    }, [unfolded, copies, staleCopies, watchListUuid]);

    const marked = entries.find((entry) => entry.uuid === hovered) ?? null;

    /**
     * Writes the way the list is being looked at back into the url
     *
     * The default of every key is left out rather than spelled in, so a plain
     * link stays a plain link.
     *
     * @param next what changed about it
     */
    function go(next: Partial<WatchSearch>) {
        void navigate({
            search: (held: WatchSearch) => ({ ...held, ...next }),
            replace: true,
            resetScroll: false,
        });
    }

    useShortcuts(
        {
            a: () => setAdding(true),
            "mod+f": () => {
                searchField.current?.focus();
                searchField.current?.select();
            },
            e: () => {
                if (marked !== null) setEditing(marked);
            },
            v: () => {
                const next = WATCH_VIEWS[(WATCH_VIEWS.indexOf(view) + 1) % WATCH_VIEWS.length] ?? "cards";
                go({ view: next === "cards" ? undefined : next });
            },
            enter: () => {
                if (marked !== null) toggleCopies(marked);
            },
            f: () => {
                if (marked === null) return;
                // Nothing on a row that accepts any version: there is no finish
                // badge on screen there, and a key that acts on something
                // invisible is a key nobody can undo.
                const patch = nextFinish(marked, marked.card?.finishes ?? "");
                if (patch === null) return;
                hapticTap();
                void guarded(marked.uuid, () => Api.watchLists.entry.update(watchListUuid, marked.uuid, patch));
            },
        },
        adding === false && editing === null && repicking === null && languaging === null && !shortcutHelpOpen,
    );

    const bill = useMemo(
        () => entries.reduce((sum, entry) => sum + countEntry(entry).missing * (entry.market?.price_cents ?? 0), 0),
        [entries],
    );
    const missing = useMemo(() => entries.reduce((sum, entry) => sum + countEntry(entry).missing, 0), [entries]);

    if (page === null) {
        return (
            <RequireAccount>
                <div className={"p-4 sm:p-6"}>
                    <EmptyState
                        title={t("heading.list-gone")}
                        description={t("description.list-gone")}
                        action={<Button href={"/watch-lists"}>{t("button.back-to-lists")}</Button>}
                    />
                </div>
            </RequireAccount>
        );
    }

    const { list, prices_updated_at } = page;

    /**
     * Reloads the page after a change, so what it shows is the server's word
     *
     * @returns a promise resolving once the loader has finished
     */
    const refresh = () => router.invalidate();

    /**
     * Runs a write with the entry marked busy, so its controls cannot be
     * double-fired while the round trip is out
     *
     * @param uuid the entry being written
     * @param write what to do
     */
    async function guarded(uuid: string, write: () => Promise<unknown>) {
        setBusy(uuid);
        try {
            await write();
            // What was written is very likely what this row's open stacks were
            // about, so they are re-read rather than left contradicting it. The
            // old answer stays up meanwhile; folding the row down and back is
            // the jolt, not the wrong number for one round trip.
            setStaleCopies((held) => ({ ...held, [uuid]: true }));
            await refresh();
        } finally {
            setBusy(null);
        }
    }

    /**
     * Marks a standing alarm as read
     *
     * @param entry the row whose alarm was read
     */
    function acknowledge(entry: WatchListEntryResponse) {
        void guarded(entry.uuid, () => Api.watchLists.entry.acknowledge(watchListUuid, entry.uuid));
    }

    /**
     * Changes what a row counts
     *
     * Shown at once and written behind it: the badge is what the tap is waiting
     * on, and the counts underneath cannot be worked out here anyway.
     *
     * @param entry the row being changed
     * @param patch the new reading
     */
    function match(entry: WatchListEntryResponse, patch: WatchMatchPatch) {
        // Only this row's stacks: what a row counts is a statement about that
        // row, and the shelf under every other one is unchanged by it.
        setStaleCopies((held) => ({ ...held, [entry.uuid]: true }));
        mutations.change(entry.uuid, patch);
    }

    /**
     * Marks the row the keys act on
     *
     * @param entry the row the pointer or the focus arrived on
     */
    function activate(entry: WatchListEntryResponse) {
        setHovered(entry.uuid);
    }

    /**
     * Records which languages a row accepts
     *
     * @param entry the row being narrowed
     * @param languages the codes it now accepts, empty for any
     */
    function saveLanguages(entry: WatchListEntryResponse, languages: Array<string>) {
        setLanguaging(null);
        match(entry, { languages });
    }

    /**
     * Opens the stacks under a row, or folds them away again
     *
     * Only the flag; the fetching is the effect's job, so a row that is open
     * when its cache is dropped fills itself in again instead of showing a
     * skeleton nobody is loading anything into.
     *
     * @param entry the row being toggled
     */
    function toggleCopies(entry: WatchListEntryResponse) {
        setUnfolded((open) => (open === entry.uuid ? null : entry.uuid));
    }

    /**
     * Puts a freshly picked print on the list
     *
     * @param printing the print that was picked
     * @param finish the finish it was picked for
     */
    async function add(printing: Printing, finish: CardFinish) {
        // Wide to start with: somebody putting a card on a list is after the
        // card, and narrowing it to the print they happened to tap is a
        // decision they did not make. The chip on the row is where they do.
        await Api.watchLists.entry.add(watchListUuid, {
            printing: printing.id,
            finish,
            exact_printing: false,
            match_finish: false,
            languages: [],
            wanted: 1,
            note: "",
            alarm_price_cents: null,
        });
        setAdding(false);
        notify.success(t("toast.entry-added"));
        await refresh();
    }

    /**
     * Saves an edited entry
     *
     * @param entry the entry that was edited
     * @param edit what it now says
     */
    async function save(entry: WatchListEntryResponse, edit: WatchListEntryEdit) {
        await Api.watchLists.entry.update(watchListUuid, entry.uuid, edit);
        setEditing(null);
        notify.success(t("toast.entry-saved"));
        await refresh();
    }

    /**
     * Takes a card off the list
     *
     * @param entry the entry to remove
     */
    async function remove(entry: WatchListEntryResponse) {
        await Api.watchLists.entry.delete(watchListUuid, entry.uuid);
        setEditing(null);
        notify.success(t("toast.entry-removed"));
        await refresh();
    }

    /**
     * Points an entry at a different print of the same card
     *
     * @param entry the entry being repointed
     * @param printing the print it should name
     */
    async function repick(entry: WatchListEntryResponse, printing: Printing) {
        setRepicking(null);
        setEditing(null);
        await guarded(entry.uuid, () =>
            Api.watchLists.entry.update(watchListUuid, entry.uuid, { printing: printing.id }),
        );
        notify.success(t("toast.entry-saved"));
    }

    return (
        <RequireAccount>
            <div
                className={clsx(
                    "mx-auto flex w-full flex-col gap-4 p-4 sm:gap-5 sm:p-6",
                    // A column of cards reads badly once it is wider than a
                    // paragraph; a grid of artwork and a table of numbers both
                    // want every pixel there is.
                    view === "cards" ? "max-w-3xl" : "max-w-7xl",
                )}
            >
                <div className={"flex flex-col gap-3"}>
                    <Link
                        href={"/watch-lists"}
                        className={
                            "flex items-center gap-1 self-start text-sm text-zinc-500 hover:underline dark:text-zinc-400"
                        }
                    >
                        <ChevronLeftIcon className={"size-4"} /> {t("button.back-to-lists")}
                    </Link>

                    <div className={"flex flex-wrap items-start justify-between gap-3"}>
                        <div className={"min-w-0"}>
                            <Heading>{list.name}</Heading>
                            {list.description !== "" && <Text className={"mt-1"}>{list.description}</Text>}
                        </div>
                        {/* Full width on a phone, where a primary action that
                            has to be aimed at is a primary action that gets
                            missed. */}
                        <PrimaryButton onClick={() => setAdding(true)} className={"max-sm:w-full"}>
                            <PlusIcon />
                            {t("button.add-card")}
                        </PrimaryButton>
                    </div>
                </div>

                {/* What the list adds up to, before any of the rows. Three
                    numbers because there are three: how much is left to get,
                    what that would cost, and whether anything has gone cheap. */}
                <dl
                    className={
                        "grid grid-cols-3 gap-px overflow-hidden rounded-(--radius-card) bg-zinc-950/5 ring-1 ring-zinc-950/5 dark:bg-white/10 dark:ring-white/10"
                    }
                >
                    <Summary label={t("label.still-missing")} value={String(missing)} />
                    <Summary label={t("label.bill")} value={bill === 0 ? "—" : formatCurrency(bill / 100)} />
                    <Summary label={t("label.alarms")} value={String(counts.alarm)} loud={counts.alarm > 0} />
                </dl>

                <WatchListPriceNote updatedAt={prices_updated_at} />

                {entries.length > 0 && (
                    <div className={"flex flex-col gap-3"}>
                        <FilterBar>
                            <FilterBarSearch>
                                <InputGroup>
                                    <MagnifyingGlassIcon data-slot={"icon"} />
                                    <Input
                                        ref={searchField}
                                        type={"search"}
                                        value={query}
                                        placeholder={t("label.search")}
                                        onChange={(event) =>
                                            go({ q: event.target.value === "" ? undefined : event.target.value })
                                        }
                                    />
                                </InputGroup>
                            </FilterBarSearch>
                            {/* Also a search param, so a link carries the way
                                somebody was looking at the list and not just
                                which cards are on it. */}
                            <FilterBarControl>
                                <Listbox
                                    value={view}
                                    aria-label={t("label.view")}
                                    onChange={(next) => go({ view: next === "cards" ? undefined : next })}
                                >
                                    {WATCH_VIEWS.map((option) => (
                                        <ListboxOption key={option} value={option}>
                                            <ListboxLabel>{t(`label.view-${option}`)}</ListboxLabel>
                                        </ListboxOption>
                                    ))}
                                </Listbox>
                            </FilterBarControl>
                        </FilterBar>
                        <FilterChipGroup>
                            <FilterChip
                                active={lens === "all"}
                                label={t("label.lens-all")}
                                count={counts.all}
                                onClick={() => go({ lens: undefined })}
                            />
                            <FilterChip
                                active={lens === "alarm"}
                                icon={<BellAlertIcon />}
                                label={t("label.lens-alarm")}
                                count={counts.alarm}
                                onClick={() => go({ lens: "alarm" })}
                            />
                            <FilterChip
                                active={lens === "missing"}
                                label={t("label.lens-missing")}
                                count={counts.missing}
                                onClick={() => go({ lens: "missing" })}
                            />
                            <FilterChip
                                active={lens === "complete"}
                                icon={<CheckCircleIcon />}
                                label={t("label.lens-complete")}
                                count={counts.complete}
                                onClick={() => go({ lens: "complete" })}
                            />
                        </FilterChipGroup>
                    </div>
                )}

                {entries.length === 0 ? (
                    <EmptyState
                        title={t("heading.no-entries")}
                        description={t("description.no-entries")}
                        action={
                            <PrimaryButton onClick={() => setAdding(true)}>
                                <PlusIcon />
                                {t("button.add-card")}
                            </PrimaryButton>
                        }
                    />
                ) : shown.length === 0 ? (
                    <EmptyState
                        variant={"bare"}
                        title={t("heading.nothing-here")}
                        description={t("description.nothing-here")}
                    />
                ) : view === "grid" ? (
                    <WatchViewGrid
                        entries={shown}
                        onEdit={setEditing}
                        onAcknowledge={acknowledge}
                        onMatch={match}
                        onLanguages={setLanguaging}
                        onActivate={activate}
                        busy={busy}
                    />
                ) : view === "table" ? (
                    // `Table` brings its own sideways scroller, so there is no
                    // wrapper here: a second one would nest a scroll container
                    // inside a scroll container and show two bars.
                    <WatchViewTable
                        entries={shown}
                        onEdit={setEditing}
                        onAcknowledge={acknowledge}
                        onMatch={match}
                        onLanguages={setLanguaging}
                        onActivate={activate}
                        busy={busy}
                        sort={sort}
                        descending={descending}
                        onSort={(next, reversed) =>
                            go({ sort: next === "added" ? undefined : next, desc: reversed ? true : undefined })
                        }
                    />
                ) : (
                    <WatchViewCards
                        entries={shown}
                        onEdit={setEditing}
                        onAcknowledge={acknowledge}
                        onMatch={match}
                        onLanguages={setLanguaging}
                        onActivate={activate}
                        onToggleCopies={toggleCopies}
                        unfolded={unfolded}
                        copies={copies}
                        busy={busy}
                    />
                )}
            </div>

            <WatchListAddDialog
                open={adding}
                onClose={() => setAdding(false)}
                onPick={(printing, finish) => void add(printing, finish)}
            />

            <WatchListEntryDialog
                entry={editing}
                onClose={() => setEditing(null)}
                onSave={save}
                onRemove={(entry) => void remove(entry)}
                onChangePrinting={setRepicking}
            />

            <WatchLanguageDialog
                languages={languaging?.languages ?? null}
                onClose={() => setLanguaging(null)}
                onSave={(languages) => {
                    if (languaging !== null) saveLanguages(languaging, languages);
                }}
            />

            <PrintingDialog
                card={repicking === null ? null : { name: repicking.card?.name ?? "", printing: repicking.printing }}
                onClose={() => setRepicking(null)}
                onPick={(printing) => {
                    if (repicking !== null) void repick(repicking, printing);
                }}
            />
        </RequireAccount>
    );
}

/**
 * The properties for {@link Summary}
 */
type SummaryProps = {
    /** What the number is */
    label: string;
    /** The number itself, already formatted */
    value: string;
    /** Whether it is worth noticing rather than just knowing */
    loud?: boolean;
};

/**
 * One of the three numbers above the list
 *
 * @returns the cell
 */
function Summary({ label, value, loud = false }: SummaryProps) {
    return (
        <div className={"flex flex-col gap-0.5 bg-(--surface-card) px-3 py-2.5"}>
            <dt className={"truncate text-[0.6875rem] tracking-wide text-zinc-500 uppercase dark:text-zinc-400"}>
                {label}
            </dt>
            <dd
                className={clsx(
                    // Steps down on a phone rather than truncating: three cells
                    // across 360px leave a four-figure sum about 110px, and a
                    // clipped price is worse than a smaller one.
                    "truncate text-base font-semibold tabular-nums sm:text-lg",
                    loud ? "text-amber-600 dark:text-amber-400" : "text-zinc-950 dark:text-white",
                )}
            >
                {value}
            </dd>
        </div>
    );
}
