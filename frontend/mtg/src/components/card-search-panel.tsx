import { MinusIcon, PlusIcon } from "@heroicons/react/20/solid";
import clsx from "clsx";
import { Button, Description, Field, Input, Label, Text } from "components";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CardFlipButton } from "src/components/card-flip-button";
import { searchPrintingPage } from "src/utils/scryfall";
import type { Printing } from "src/utils/scryfall";
import { useFlippedCards } from "src/utils/use-flipped-cards";

/** How long typing has to pause before a search goes out */
const DEBOUNCE_MS = 400;

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
};

/**
 * Searches Scryfall and offers the hits as draggable cards.
 *
 * The drag payload is the card's public Scryfall url rather than a private
 * format. That means the same drop target accepts a card dragged straight out
 * of a scryfall.com tab, and it costs nothing — the url is what a browser hands
 * over for a link anyway.
 *
 * Where counters are given, a hit is not filed by clicking it: adding and
 * taking back out sit on the card as a bar, the way they do on a deck's own
 * tiles, so a card added by mistake costs one click rather than a trip back to
 * the list.
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
}: CardSearchPanelProps) {
    const [t] = useTranslation("collection");
    const { isFlipped, toggle } = useFlippedCards();
    const [query, setQuery] = useState("");
    const [off, setOff] = useState<Array<string>>([]);
    const [results, setResults] = useState<Printing[]>([]);
    const [searching, setSearching] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [nextPage, setNextPage] = useState<string | null>(null);
    const loadMoreRef = useRef<HTMLDivElement>(null);
    const pageRequest = useRef<AbortController>(null);

    const held = constraints.filter((constraint) => constraint.fixed === true || !off.includes(constraint.key));
    const asked = [...held.map((constraint) => constraint.query ?? ""), query.trim()]
        .filter((part) => part !== "")
        .join(" ");
    const shown = results.filter((printing) => !held.some((constraint) => constraint.exclude?.(printing) === true));

    useEffect(() => {
        pageRequest.current?.abort();
        setNextPage(null);
        setLoadingMore(false);
        if (query.trim() === "") {
            setResults([]);
            setSearching(false);
            return;
        }
        // Debounced and abortable: `/cards/search` allows two calls a second,
        // and a keystroke-per-request would blow straight through that.
        const controller = new AbortController();
        setResults([]);
        setSearching(true);
        const timer = setTimeout(() => {
            void searchPrintingPage(asked, controller.signal, unique).then((page) => {
                if (!controller.signal.aborted) {
                    setResults(page.printings);
                    setNextPage(page.nextPage);
                    setSearching(false);
                }
            });
        }, DEBOUNCE_MS);

        return () => {
            clearTimeout(timer);
            controller.abort();
            pageRequest.current?.abort();
        };
    }, [asked, query, unique]);

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

    return (
        <div className={"flex flex-col gap-3"}>
            <Field>
                <Label>{t("label.card-search")}</Label>
                <Description>{t("description.card-search")}</Description>
                <Input
                    type={"search"}
                    autoFocus
                    value={query}
                    placeholder={t("label.card-search-placeholder")}
                    onChange={(e) => setQuery(e.target.value)}
                />
            </Field>

            {constraints.length > 0 && (
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
                    <Text className={"text-xs"}>{t("description.search-constraints")}</Text>
                </div>
            )}

            {query.trim() !== "" && shown.length === 0 && !searching && nextPage === null && (
                <Text>{t("description.no-hits")}</Text>
            )}

            {shown.length > 0 && (
                <ul className={"grid grid-cols-[repeat(auto-fill,minmax(min(100%,16rem),1fr))] gap-3"}>
                    {shown.map((printing) => {
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
                                        onClick={onPick === undefined ? undefined : () => onPick(printing)}
                                        className={clsx(
                                            "block w-full cursor-grab overflow-hidden rounded-xl ring-1 transition active:cursor-grabbing",
                                            count > 0
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
        </div>
    );
}
