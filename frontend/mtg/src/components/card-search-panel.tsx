import { FunnelIcon, MinusIcon, PlusIcon } from "@heroicons/react/20/solid";
import clsx from "clsx";
import { Button, Description, Field, Input, Label, Text } from "components";
import type { KeyboardEvent, ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CardFlipButton } from "src/components/card-flip-button";
import { GraphFilterDialog } from "src/components/graph-filter-dialog";
import {
    EMPTY_GRAPH_FILTERS,
    GraphFilters,
    PoolQueryInvalidError,
    hasGraphFilters,
    searchGraphPrintings,
} from "src/utils/graph-search";
import { gridColumns, stepHighlight } from "src/utils/grid-nav";
import { usePreloadImages } from "src/utils/use-preload-image";
import { QUERY_SYNTAX, correctCardWords, fuzzyCardName, searchPrintingPage } from "src/utils/scryfall";
import type { Printing } from "src/utils/scryfall";
import { useFlippedCards } from "src/utils/use-flipped-cards";

/** How long typing has to pause before a search goes out */
const DEBOUNCE_MS = 400;

/**
 * At most how many hits a search may have to still read as "looked up one card"
 *
 * A name typed out lands on a handful of hits; a word typed to browse — goblin,
 * signet — lands on dozens. The count is what tells those apart, and only the
 * first kind takes the query with it when its card is picked: whoever browses
 * is going to pick more cards from the same list.
 */
const NAME_SEARCH_LIMIT = 8;

/**
 * A rule the search is held to on top of what was typed
 *
 * Written in Scryfall's own syntax, so the same fragment could have been typed
 * by hand — which is the point: it is shown, it can be switched off, and what
 * it does is no mystery.
 */
export type SearchConstraint = {
    /** Tells the constraint apart, for switching it off */
    key: string;
    /** What the chip says */
    label: string;
    /** The Scryfall fragment, e.g. `legal:commander` */
    query?: string;
    /** Drops a hit after the fact, for what Scryfall cannot be asked */
    exclude?: (printing: Printing) => boolean;
    /** Whether this rule is part of the operation and cannot be switched off */
    fixed?: boolean;
};

/**
 * The properties for {@link CardSearchPanel}
 */
export type CardSearchPanelProps = {
    /** Called when a result is picked, left out where the counters do the work */
    onPick?: (printing: Printing) => void;
    /** What the search is held to besides the typed words */
    constraints?: Array<SearchConstraint>;
    /** How many copies of a hit are already filed, drawn on the result */
    countOf?: (printing: Printing) => number;
    /** Files one more copy of a hit */
    onAdd?: (printing: Printing) => void;
    /** Takes one copy of a hit back out */
    onRemove?: (printing: Printing) => void;
    /** Whether a card comes back once or once per print run */
    unique?: "prints" | "cards";
    /** Fixes the result grid to two columns instead of choosing responsively */
    twoColumns?: boolean;
    /** Controls placed immediately below the search field */
    toolbar?: ReactNode;
    /** Keeps the search field visible while its results scroll */
    stickySearch?: boolean;
    /** Saves vertical room on phones by hiding explanatory copy */
    hideInfoOnMobile?: boolean;
    /**
     * Whether the search field takes the cursor on mount.
     *
     * Right for a dialog that opened to search and wrong for a panel sitting on
     * a page: there the field grabs the cursor from whatever the reader came
     * to do, and a phone answers by opening its keyboard over the page.
     */
    autoFocus?: boolean;
    /** Offers the graph's own filters; any set filter flips the engine */
    graph?: boolean;
    /** Colour identity the graph search is held inside, as `W`, `U`, … */
    graphIdentity?: Array<string>;
    /**
     * Whether picking a card off a name search clears the search field.
     *
     * Right for a singleton deck, where adding cards is a run of one name after
     * another and every leftover query is one more thing to delete by hand.
     * The cursor goes back into the emptied field, ready for the next name.
     * Only a search that read as a name lookup is cleared — Scryfall syntax,
     * an active graph filter or a page of hits mean browsing, and a browser
     * wants the list to stay. The plus button never clears either: it counts
     * up copies of what is already on screen.
     */
    clearNameSearches?: boolean;
};

/**
 * Searches Scryfall and offers the hits as draggable cards.
 *
 * The drag payload is the card's public Scryfall url rather than a private
 * format. That means the same drop target accepts a card dragged straight out
 * of a scryfall.com tab, and it costs nothing — the url is what a browser hands
 * over for a link anyway.
 *
 * Where counters are given, clicking a hit files one copy, exactly as the
 * plus under it does: picking cards is the one thing this panel is open for,
 * and the artwork is a far bigger target than a button in the bar. The bar
 * keeps the count and the minus, so a card added by mistake still costs one
 * click rather than a trip back to the list.
 *
 * Enter in the field does the same to the top result, so a run of names never
 * needs the pointer at all: type, Enter, type the next one. Held off while a
 * search is still in flight, so it never fires on a query one keystroke stale.
 *
 * @returns the search panel
 */
export function CardSearchPanel({
    onPick,
    constraints = [],
    countOf,
    onAdd,
    onRemove,
    unique = "prints",
    twoColumns = false,
    toolbar,
    stickySearch = false,
    hideInfoOnMobile = false,
    autoFocus = true,
    graph = false,
    graphIdentity,
    clearNameSearches = false,
}: CardSearchPanelProps) {
    const [t] = useTranslation("collection");
    const { isFlipped, toggle } = useFlippedCards();
    const [query, setQuery] = useState("");
    const [off, setOff] = useState<Array<string>>([]);
    const [filters, setFilters] = useState<GraphFilters>(EMPTY_GRAPH_FILTERS);
    const [filtering, setFiltering] = useState(false);
    const [results, setResults] = useState<Printing[]>([]);
    const [searching, setSearching] = useState(false);
    // A dead graph must not read as "no card matches" — that is a claim about
    // the card pool the panel cannot make when it never got an answer.
    const [graphFailed, setGraphFailed] = useState(false);
    // The service's word on typed query syntax it could not compile. Mid-typing
    // this is the resting state of a half-written restriction, not a failure.
    const [poolError, setPoolError] = useState<string | null>(null);
    // The name the fallback corrected a zero-hit search to, for the banner.
    const [corrected, setCorrected] = useState<string | null>(null);
    const [loadingMore, setLoadingMore] = useState(false);
    const [nextPage, setNextPage] = useState<string | null>(null);
    const loadMoreRef = useRef<HTMLDivElement>(null);
    const searchInput = useRef<HTMLInputElement>(null);
    const pageRequest = useRef<AbortController>(null);
    // The arrow-key highlight over the result grid — `null` while unengaged,
    // which is also what leaves Enter targeting the top result as before.
    const [highlighted, setHighlighted] = useState<number | null>(null);
    const resultsList = useRef<HTMLUListElement>(null);

    // Any set graph filter flips the engine: the graph answers, and the typed
    // words are held against name and rules text instead of Scryfall syntax.
    const graphActive = graph && hasGraphFilters(filters);
    // Effects compare by identity; the content is what actually matters here.
    const filtersKey = JSON.stringify(filters);
    const identityKey = (graphIdentity ?? []).join("");

    const held = constraints.filter((constraint) => constraint.fixed === true || !off.includes(constraint.key));
    const asked = [...held.map((constraint) => constraint.query ?? ""), query.trim()]
        .filter((part) => part !== "")
        .join(" ");
    const shown = results.filter((printing) => !held.some((constraint) => constraint.exclude?.(printing) === true));
    // Results can shrink out from under the highlight (an owned-filter toggle,
    // a fresh page) — clamp here once, so nothing downstream reads a stale or
    // out-of-bounds index directly off `highlighted`.
    const active = highlighted !== null && shown.length > 0 ? Math.min(highlighted, shown.length - 1) : null;
    // The results can all be turned over, so their second sides are fetched
    // with the list rather than on the tap that asks for one.
    usePreloadImages(shown.map((printing) => printing.backLargeImageUrl ?? printing.backImageUrl));

    useEffect(() => {
        pageRequest.current?.abort();
        setNextPage(null);
        setLoadingMore(false);
        // A new search is a new result list, so any highlight left over from
        // the previous one would point at the wrong card.
        setHighlighted(null);
        // Likewise a correction banner: it belongs to the search that earned
        // it, not to whatever gets typed next.
        setCorrected(null);
        if (!graphActive && query.trim() === "") {
            setResults([]);
            setSearching(false);
            return;
        }
        // Debounced and abortable: `/cards/search` allows two calls a second,
        // and a keystroke-per-request would blow straight through that.
        const controller = new AbortController();
        setResults([]);
        setGraphFailed(false);
        setPoolError(null);
        setSearching(true);
        const timer = setTimeout(() => {
            if (graphActive) {
                // The graph ranks and cuts at its limit — there is no next page.
                void searchGraphPrintings(filters, query, graphIdentity, controller.signal)
                    .then((printings) => {
                        if (!controller.signal.aborted) {
                            setResults(printings);
                            setSearching(false);
                        }
                    })
                    .catch((error: unknown) => {
                        if (!controller.signal.aborted) {
                            setResults([]);
                            if (error instanceof PoolQueryInvalidError) setPoolError(error.message);
                            else setGraphFailed(true);
                            setSearching(false);
                        }
                    });
                return;
            }
            void (async () => {
                const page = await searchPrintingPage(asked, controller.signal, unique);
                if (controller.signal.aborted) return;
                if (page.printings.length > 0 || QUERY_SYNTAX.test(query) || query.trim().length < 3) {
                    setResults(page.printings);
                    setNextPage(page.nextPage);
                    setSearching(false);
                    return;
                }

                // Zero hits on what reads as a name: ask what the name meant
                // to be. The corrected name then goes through the ordinary
                // constrained search — the typed words are the final segment
                // of `asked` by construction, so slicing them off leaves
                // exactly the constraint fragments.
                const fragments = asked.slice(0, asked.length - query.trim().length);
                const name = await fuzzyCardName(query.trim(), controller.signal);
                if (controller.signal.aborted) return;
                if (name !== null && name.toLowerCase() !== query.trim().toLowerCase()) {
                    const retry = await searchPrintingPage(`${fragments}!"${name}"`, controller.signal, unique);
                    if (controller.signal.aborted) return;
                    setCorrected(name);
                    setResults(retry.printings);
                    setNextPage(retry.nextPage);
                    setSearching(false);
                    return;
                }

                // The fuzzy lookup only answers when the words pin down one
                // card, so a mistyped word that opens many names — Unnderworld
                // — gets nothing from it, and a word that happens to already
                // be a different real word — Hellfire, meaning Hailfire — is
                // never even flagged as wrong. Try each repaired candidate in
                // turn and only claim one on screen once it actually finds
                // something: a guessed word is not a known card name.
                if (name === null) {
                    const candidates = await correctCardWords(query, controller.signal);
                    for (const candidate of candidates) {
                        const retry = await searchPrintingPage(fragments + candidate, controller.signal, unique);
                        if (controller.signal.aborted) return;
                        if (retry.printings.length > 0) {
                            setCorrected(candidate);
                            setResults(retry.printings);
                            setNextPage(retry.nextPage);
                            setSearching(false);
                            return;
                        }
                    }
                    if (controller.signal.aborted) return;
                }

                // Nothing close — or the name was right and the constraints
                // are what excluded it; either way there is no correction to
                // show.
                setResults([]);
                setSearching(false);
            })();
        }, DEBOUNCE_MS);

        return () => {
            clearTimeout(timer);
            controller.abort();
            pageRequest.current?.abort();
        };
        // filtersKey and identityKey stand in for their objects — see above.
    }, [asked, query, unique, graphActive, filtersKey, identityKey]);

    /**
     * Hands a hit to the caller and, where the search read as a name lookup,
     * clears it — see {@link CardSearchPanelProps.clearNameSearches}
     *
     * The cursor goes back into the emptied field, so the loop closes on
     * itself: tap a card, type the next name. Focusing counts as part of the
     * tap, which is what lets a phone answer it with the keyboard.
     *
     * @param printing the card that was picked
     */
    function pick(printing: Printing) {
        (onPick ?? onAdd)?.(printing);
        if (clearNameSearches && !graphActive && shown.length <= NAME_SEARCH_LIMIT && !QUERY_SYNTAX.test(query)) {
            setQuery("");
            searchInput.current?.focus();
        }
    }

    /**
     * Picks the highlighted result on Enter, exactly as tapping its artwork
     * would, and moves the highlight itself on the arrow keys.
     *
     * Enter targets `shown[active ?? 0]`, so a query nobody arrowed through
     * still picks the top hit exactly as before. Ignored while a search is
     * still in flight: `searching` covers the debounce as well as the
     * request, so a fast typist who hits Enter right behind their last
     * keystroke gets nothing rather than the previous query's top hit — a
     * stray Enter is a smaller cost than filing the wrong card.
     *
     * The arrows move a highlight over the grid without the focus ever
     * leaving this field — down engages it, up walks it back out to release.
     * Left/Right stay with the text caret until the highlight is engaged, so
     * editing the query is unaffected; once engaged they step within a row.
     * The row stride is read from the grid's resolved column count, which
     * changes with the viewport and the column-count toggle.
     *
     * @param event the field's keyboard event
     */
    function onSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
        if (onPick === undefined && onAdd === undefined) return;
        if (event.key === "Enter") {
            if (searching) return;
            const top = shown[active ?? 0];
            if (top === undefined) return;
            event.preventDefault();
            pick(top);
            return;
        }
        if (
            event.key !== "ArrowDown" &&
            event.key !== "ArrowUp" &&
            event.key !== "ArrowLeft" &&
            event.key !== "ArrowRight"
        ) {
            return;
        }
        // Left/Right belong to the text caret until the highlight is engaged.
        if (active === null && (event.key === "ArrowLeft" || event.key === "ArrowRight")) return;
        if (active === null && event.key === "ArrowUp") return;
        const columns = resultsList.current === null ? 1 : gridColumns(resultsList.current);
        event.preventDefault();
        setHighlighted(stepHighlight(active, event.key, columns, shown.length));
    }

    const loadMore = useCallback(() => {
        if (nextPage === null || loadingMore) return;

        const controller = new AbortController();
        pageRequest.current?.abort();
        pageRequest.current = controller;
        setLoadingMore(true);
        void searchPrintingPage(asked, controller.signal, unique, nextPage).then((page) => {
            if (controller.signal.aborted) return;
            setResults((previous) => [...previous, ...page.printings]);
            setNextPage(page.nextPage);
            setLoadingMore(false);
            pageRequest.current = null;
        });
    }, [asked, loadingMore, nextPage, unique]);

    useEffect(() => {
        const element = loadMoreRef.current;
        if (element === null || nextPage === null || loadingMore || typeof IntersectionObserver === "undefined") return;

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries.some((entry) => entry.isIntersecting)) loadMore();
            },
            { rootMargin: "600px" },
        );
        observer.observe(element);
        return () => observer.disconnect();
    }, [loadMore, loadingMore, nextPage]);

    // Keeps the highlight on screen as the arrows carry it past the fold,
    // inside the dialog's own scroller rather than the whole page.
    useEffect(() => {
        if (active === null) return;
        resultsList.current?.children[active]?.scrollIntoView({ block: "nearest" });
    }, [active]);

    return (
        <div className={"flex flex-col gap-3"}>
            {/* Above the card tiles' own overlays — the flip button floats at
                z-10, and a sticky bar level with it loses by document order. */}
            <div className={clsx(stickySearch && "sticky top-0 z-20 bg-white pb-1 dark:bg-zinc-900")}>
                <Field>
                    <Label>{t("label.card-search")}</Label>
                    <Description className={hideInfoOnMobile ? "max-sm:hidden" : undefined}>
                        {t("description.card-search")}
                    </Description>
                    <Input
                        ref={searchInput}
                        type={"search"}
                        autoFocus={autoFocus}
                        value={query}
                        placeholder={t("label.card-search-placeholder")}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={onSearchKeyDown}
                    />
                </Field>
            </div>

            {toolbar}

            {graph && (
                <div className={"flex flex-wrap items-center gap-2"}>
                    <button
                        type={"button"}
                        onClick={() => setFiltering(true)}
                        className={
                            "flex items-center gap-1 rounded-(--radius-pill) px-2.5 py-1 text-xs font-medium ring-1 ring-zinc-950/10 transition hover:bg-zinc-950/5 dark:ring-white/15 dark:hover:bg-white/10"
                        }
                    >
                        <FunnelIcon className={"size-3.5"} />
                        {t("button.graph-filter")}
                    </button>
                    {(Object.entries(filters) as Array<[keyof GraphFilters, Array<string>]>).flatMap(([key, values]) =>
                        values.map((value) => (
                            <button
                                key={`${key}-${value}`}
                                type={"button"}
                                aria-label={t("accessibility.remove-graph-filter", { name: value })}
                                onClick={() =>
                                    setFilters({ ...filters, [key]: filters[key].filter((held) => held !== value) })
                                }
                                className={
                                    "rounded-(--radius-pill) bg-(--color-brand-600)/10 px-2.5 py-1 text-xs font-medium text-(--color-brand-700) capitalize ring-1 ring-(--color-brand-600)/20 dark:text-(--color-brand-300) dark:ring-(--color-brand-400)/25"
                                }
                            >
                                {value.replace(/_/g, " ")} ×
                            </button>
                        )),
                    )}
                    {graphActive && <Text className={"text-xs"}>{t("description.graph-mode")}</Text>}
                </div>
            )}

            {constraints.length > 0 && !graphActive && (
                <div className={"flex flex-wrap items-center gap-2"}>
                    {constraints.map((constraint) => {
                        const on = constraint.fixed === true || !off.includes(constraint.key);
                        return (
                            <button
                                key={constraint.key}
                                type={"button"}
                                aria-pressed={on}
                                disabled={constraint.fixed}
                                title={constraint.query ?? constraint.label}
                                onClick={() =>
                                    setOff((previous) =>
                                        on
                                            ? [...previous, constraint.key]
                                            : previous.filter((key) => key !== constraint.key),
                                    )
                                }
                                className={clsx(
                                    "rounded-(--radius-pill) px-2.5 py-1 text-xs font-medium transition",
                                    on
                                        ? "bg-(--color-brand-600)/10 text-(--color-brand-700) ring-1 ring-(--color-brand-600)/20 dark:text-(--color-brand-300) dark:ring-(--color-brand-400)/25"
                                        : "text-zinc-500 line-through ring-1 ring-zinc-950/10 dark:text-zinc-400 dark:ring-white/15",
                                )}
                            >
                                {constraint.label}
                            </button>
                        );
                    })}
                    <Text className={clsx("text-xs", hideInfoOnMobile && "max-sm:hidden")}>
                        {t("description.search-constraints")}
                    </Text>
                </div>
            )}

            {graphFailed && <Text>{t("description.graph-filter-unavailable")}</Text>}

            {poolError !== null && <Text>{t("description.graph-query-invalid", { message: poolError })}</Text>}

            {corrected !== null && shown.length > 0 && (
                <Text>{t("description.fuzzy-corrected", { query: query.trim(), name: corrected })}</Text>
            )}

            {!graphFailed &&
                poolError === null &&
                corrected === null &&
                (query.trim() !== "" || graphActive) &&
                shown.length === 0 &&
                !searching &&
                nextPage === null && <Text>{t("description.no-hits")}</Text>}

            {corrected !== null && shown.length === 0 && !searching && (
                <Text>{t("description.fuzzy-excluded", { name: corrected })}</Text>
            )}

            {shown.length > 0 && (
                <ul
                    ref={resultsList}
                    className={
                        twoColumns
                            ? "grid grid-cols-2 gap-3"
                            : "grid grid-cols-[repeat(auto-fill,minmax(min(100%,16rem),1fr))] gap-3"
                    }
                >
                    {shown.map((printing, index) => {
                        const count = countOf?.(printing) ?? 0;
                        const back = printing.backLargeImageUrl ?? printing.backImageUrl ?? null;
                        const showBack = back !== null && isFlipped(printing.id);
                        return (
                            <li key={printing.id} className={"group/hit flex flex-col gap-1"}>
                                <div className={"relative"}>
                                    <button
                                        type={"button"}
                                        draggable={true}
                                        title={`${printing.name} · ${printing.setCode} #${printing.collectorNumber}`}
                                        aria-label={t("accessibility.add-printing", {
                                            name: printing.name,
                                            set: printing.setCode,
                                        })}
                                        onDragStart={(event) => {
                                            const url = `https://scryfall.com/card/${printing.setCode.toLowerCase()}/${printing.collectorNumber}`;
                                            event.dataTransfer.setData("text/uri-list", url);
                                            event.dataTransfer.setData("text/plain", url);
                                            event.dataTransfer.effectAllowed = "copy";
                                        }}
                                        onClick={
                                            onPick === undefined && onAdd === undefined
                                                ? undefined
                                                : () => pick(printing)
                                        }
                                        className={clsx(
                                            "block w-full cursor-grab overflow-hidden rounded-xl ring-1 transition active:cursor-grabbing",
                                            index === active
                                                ? "ring-2 ring-(--color-brand-500)"
                                                : count > 0
                                                  ? "ring-2 ring-(--color-success)"
                                                  : "ring-transparent hover:ring-zinc-950/15 dark:hover:ring-white/20",
                                        )}
                                    >
                                        {(printing.largeImageUrl ?? printing.imageUrl) !== null ? (
                                            <img
                                                src={
                                                    showBack
                                                        ? back
                                                        : (printing.largeImageUrl ?? printing.imageUrl ?? "")
                                                }
                                                crossOrigin={"anonymous"}
                                                alt={printing.name}
                                                loading={"lazy"}
                                                className={
                                                    "aspect-5/7 w-full bg-zinc-200 object-cover dark:bg-zinc-700"
                                                }
                                            />
                                        ) : (
                                            <div
                                                className={
                                                    "flex aspect-5/7 items-center justify-center bg-zinc-200 p-2 text-center dark:bg-zinc-700"
                                                }
                                            >
                                                <span className={"text-xs text-zinc-950 dark:text-white"}>
                                                    {printing.name}
                                                </span>
                                            </div>
                                        )}
                                    </button>
                                    {back !== null && (
                                        <CardFlipButton
                                            flipped={showBack}
                                            onFlip={() => toggle(printing.id)}
                                            className={"absolute top-2 right-2"}
                                        />
                                    )}
                                </div>

                                {onAdd !== undefined && (
                                    <span
                                        className={
                                            "flex items-center justify-between gap-1 rounded-lg bg-zinc-950/5 px-1.5 py-1 dark:bg-white/10"
                                        }
                                    >
                                        <button
                                            type={"button"}
                                            disabled={count === 0 || onRemove === undefined}
                                            aria-label={t("accessibility.remove-printing", { name: printing.name })}
                                            onClick={() => onRemove?.(printing)}
                                            className={
                                                "rounded p-1 text-zinc-600 transition hover:bg-zinc-950/10 disabled:opacity-30 dark:text-zinc-300 dark:hover:bg-white/10"
                                            }
                                        >
                                            <MinusIcon className={"size-4"} />
                                        </button>
                                        <span
                                            className={
                                                count > 0
                                                    ? "text-xs font-semibold text-(--color-success) tabular-nums"
                                                    : "text-xs font-semibold text-zinc-500 tabular-nums dark:text-zinc-400"
                                            }
                                        >
                                            {count}
                                        </span>
                                        <button
                                            type={"button"}
                                            aria-label={t("accessibility.add-printing", {
                                                name: printing.name,
                                                set: printing.setCode,
                                            })}
                                            onClick={() => onAdd(printing)}
                                            className={
                                                "rounded p-1 text-zinc-600 transition hover:bg-zinc-950/10 dark:text-zinc-300 dark:hover:bg-white/10"
                                            }
                                        >
                                            <PlusIcon className={"size-4"} />
                                        </button>
                                    </span>
                                )}

                                <span className={"truncate text-xs text-zinc-500 dark:text-zinc-400"}>
                                    {printing.setCode} #{printing.collectorNumber}
                                </span>
                            </li>
                        );
                    })}
                </ul>
            )}

            {nextPage !== null && (
                <div ref={loadMoreRef} className={"flex justify-center py-2"}>
                    <Button outline disabled={loadingMore} onClick={loadMore}>
                        {loadingMore ? t("description.loading-more-hits") : t("button.load-more-hits")}
                    </Button>
                </div>
            )}

            {graph && (
                <GraphFilterDialog
                    open={filtering}
                    onClose={() => setFiltering(false)}
                    filters={filters}
                    onChange={setFilters}
                />
            )}
        </div>
    );
}
