import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { BarsArrowDownIcon, BarsArrowUpIcon } from "@heroicons/react/20/solid";
import {
    Button,
    EmptyState,
    Heading,
    Input,
    Listbox,
    ListboxLabel,
    ListboxOption,
    Pagination,
    PaginationGap,
    PaginationList,
    PaginationNext,
    PaginationPage,
    PaginationPrevious,
    Text,
} from "components";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import type { PublicDeckSort } from "src/api/generated";
import { useDeckLabels } from "src/components/deck-labels";
import { PublicDeckTile } from "src/components/public-deck-tile";
import { pageWindow } from "src/utils/pagination";
import i18n from "src/i18n";

/** Decks per page */
const PAGE_SIZE = 24;

/** How long typing has to pause before a filter reaches the url */
const SEARCH_DEBOUNCE_MS = 300;

/** The brackets a deck can claim, one to five */
const BRACKET_NUMBERS = [1, 2, 3, 4, 5];

/** The orders offered, in the order they are listed */
const SORTS: Array<PublicDeckSort> = ["Created", "Name", "Cards", "Price"];

/**
 * Search params of the public deck search
 */
export type GlobalDeckSearch = {
    /** Which page to show, counted from one */
    page?: number;
    /** What to search the deck and commander names for */
    q?: string;
    /** Only decks built for this format */
    format?: string;
    /** Only decks built by this account */
    owner?: string;
    /** Only decks claiming this Commander bracket */
    bracket?: number;
    /** What to order by */
    sort?: PublicDeckSort;
    /** Whether to reverse that order */
    desc?: boolean;
};

export const Route = createFileRoute("/_menu/global/decks/")({
    validateSearch: (search: Record<string, unknown>): GlobalDeckSearch => {
        const page = Number(search.page);
        const text = (value: unknown) => (typeof value === "string" && value !== "" ? value : undefined);
        return {
            page: Number.isInteger(page) && page >= 1 ? page : undefined,
            q: text(search.q),
            format: text(search.format),
            owner: text(search.owner),
            bracket: BRACKET_NUMBERS.find((number) => number === Number(search.bracket)),
            sort: SORTS.find((option) => option === search.sort),
            desc:
                search.desc === true || search.desc === "true"
                    ? true
                    : search.desc === false || search.desc === "false"
                      ? false
                      : undefined,
        };
    },

    loaderDeps: ({ search }) => ({
        page: search.page,
        q: search.q,
        format: search.format,
        owner: search.owner,
        bracket: search.bracket,
        sort: search.sort,
        desc: search.desc,
    }),
    loader: async ({ deps }) => {
        // The format names live in the deck namespace, which this page borrows
        // through `useDeckLabels` rather than translating itself.
        const strings = Promise.all([i18n.loadNamespaces("deck"), i18n.loadNamespaces("global")]);
        const [page, offered] = await Promise.all([
            Api.explore.decks.search({
                limit: PAGE_SIZE,
                offset: ((deps.page ?? 1) - 1) * PAGE_SIZE,
                search: deps.q,
                format: deps.format,
                owner: deps.owner,
                bracket: deps.bracket,
                sort: deps.sort,
                descending: deps.desc ?? naturalDescending(deps.sort ?? "Created"),
            }),
            Api.decks.formats(),
            strings,
        ]);
        return { page, formats: offered.formats, brackets: offered.brackets };
    },
    component: RouteComponent,
});

/**
 * Every deck the app's accounts put on show.
 *
 * The way in for somebody who has not built anything yet: search by name, by
 * the format it is built for, or by the commander at the head of it, and follow
 * a deck's author to everything else they published.
 *
 * @returns the page
 */
function RouteComponent() {
    const { page: listing, formats, brackets } = Route.useLoaderData();
    const search = Route.useSearch();
    const navigate = useNavigate();
    const [t] = useTranslation("global");
    const labels = useDeckLabels();

    const [query, setQuery] = useState(search.q ?? "");

    const page = (search.page ?? 1) - 1;
    const pages = Math.max(1, Math.ceil(listing.total / PAGE_SIZE));
    const sort = search.sort ?? "Created";
    const descending = search.desc ?? naturalDescending(sort);
    const filtering =
        search.q !== undefined ||
        search.format !== undefined ||
        search.owner !== undefined ||
        search.bracket !== undefined;

    /**
     * Writes new search params, keeping the ones not mentioned
     *
     * @param next what to change
     * @param options how to navigate
     * @param options.replace whether to overwrite the current history entry
     */
    function go(next: Partial<GlobalDeckSearch>, options: { replace?: boolean } = {}) {
        void navigate({ to: "/global/decks", search: { ...search, ...next }, replace: options.replace });
    }

    useEffect(() => {
        if (query === (search.q ?? "")) return;
        const timer = setTimeout(
            () => go({ q: query === "" ? undefined : query, page: undefined }, { replace: true }),
            SEARCH_DEBOUNCE_MS,
        );
        return () => clearTimeout(timer);
    }, [query, search.q]);

    useEffect(() => {
        if (page > 0 && page >= pages) go({ page: pages }, { replace: true });
    }, [page, pages]);

    return (
        <div className={"flex flex-col gap-6"}>
            <div className={"flex flex-col gap-2"}>
                <Heading>{t("heading.public-decks")}</Heading>
                <Text>{t("description.public-decks")}</Text>
            </div>

            <div className={"flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center"}>
                {/* One field for both: whether the words somebody types are a
                    deck's name or its commander's is the search's problem, not
                    theirs. */}
                <Input
                    type={"search"}
                    value={query}
                    placeholder={t("label.filter-decks")}
                    aria-label={t("label.filter-decks")}
                    onChange={(event) => setQuery(event.target.value)}
                    className={"w-full min-w-0 sm:w-auto sm:flex-1 sm:basis-64"}
                />
                <div className={"flex min-w-0 shrink items-center gap-2"}>
                    <Listbox
                        value={search.format ?? ""}
                        aria-label={t("label.filter-format")}
                        onChange={(next) => go({ format: next === "" ? undefined : next, page: undefined })}
                        className={"min-w-0 flex-1 sm:w-44 sm:flex-none"}
                    >
                        <ListboxOption value={""}>
                            <ListboxLabel>{t("label.every-format")}</ListboxLabel>
                        </ListboxOption>
                        {formats.map((format) => (
                            <ListboxOption key={format.slug} value={format.slug}>
                                <ListboxLabel>{labels.format(format.slug)}</ListboxLabel>
                            </ListboxOption>
                        ))}
                    </Listbox>
                    {/* Only Commander decks claim a bracket, so the filter is
                        offered whenever the format allows one rather than
                        always: on a Modern search it would answer nothing. */}
                    {brackets.length > 0 && (
                        <Listbox
                            value={search.bracket ?? 0}
                            aria-label={t("label.bracket")}
                            onChange={(next) => go({ bracket: next === 0 ? undefined : next, page: undefined })}
                            className={"min-w-0 flex-1 sm:w-44 sm:flex-none"}
                        >
                            <ListboxOption value={0}>
                                <ListboxLabel>{t("label.every-bracket")}</ListboxLabel>
                            </ListboxOption>
                            {brackets.map((bracket) => (
                                <ListboxOption key={bracket.slug} value={bracket.number}>
                                    <ListboxLabel>
                                        {`B${bracket.number} · ${labels.bracket(bracket.slug)}`}
                                    </ListboxLabel>
                                </ListboxOption>
                            ))}
                        </Listbox>
                    )}
                    <Listbox
                        value={sort}
                        aria-label={t("label.sort")}
                        onChange={(next) => go({ sort: next === "Created" ? undefined : next, page: undefined })}
                        className={"min-w-0 flex-1 sm:w-44 sm:flex-none"}
                    >
                        {SORTS.map((option) => (
                            <ListboxOption key={option} value={option}>
                                <ListboxLabel>{sortLabel(option, t)}</ListboxLabel>
                            </ListboxOption>
                        ))}
                    </Listbox>
                    <Button
                        outline
                        aria-label={descending ? t("accessibility.sort-ascending") : t("accessibility.sort-descending")}
                        onClick={() => go({ desc: !descending, page: undefined })}
                    >
                        {descending ? <BarsArrowUpIcon /> : <BarsArrowDownIcon />}
                    </Button>
                </div>
            </div>

            {search.owner !== undefined && (
                <Text className={"flex flex-wrap items-center gap-2"}>
                    <span>{t("label.by-author", { owner: search.owner })}</span>
                    <Button plain onClick={() => go({ owner: undefined, page: undefined })}>
                        {t("button.clear-author")}
                    </Button>
                </Text>
            )}

            {listing.decks.length === 0 ? (
                <EmptyState
                    title={filtering ? t("heading.no-hits") : t("heading.nothing-public")}
                    description={filtering ? t("description.no-hits") : t("description.nothing-public")}
                />
            ) : (
                <>
                    <Text>{t("label.deck-count", { count: listing.total })}</Text>
                    <ul className={"grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"}>
                        {listing.decks.map((deck) => (
                            <PublicDeckTile key={deck.uuid} deck={deck} />
                        ))}
                    </ul>
                </>
            )}

            {pages > 1 && (
                <div className={"flex flex-col gap-2"}>
                    <Pagination>
                        <PaginationPrevious href={page > 0 ? "/global/decks" : null} search={{ ...search, page }}>
                            {t("button.previous-page")}
                        </PaginationPrevious>
                        <PaginationList>
                            {pageWindow(page + 1, pages).map((entry, index) =>
                                entry === null ? (
                                    <PaginationGap key={`gap-${index}`} />
                                ) : (
                                    <PaginationPage
                                        key={entry}
                                        href={"/global/decks"}
                                        search={{ ...search, page: entry }}
                                        current={entry === page + 1}
                                    >
                                        {String(entry)}
                                    </PaginationPage>
                                ),
                            )}
                        </PaginationList>
                        <PaginationNext
                            href={page + 1 < pages ? "/global/decks" : null}
                            search={{ ...search, page: page + 2 }}
                        >
                            {t("button.next-page")}
                        </PaginationNext>
                    </Pagination>
                    <Text className={"text-center text-xs sm:hidden"}>
                        {t("label.page-of", { page: page + 1, pages })}
                    </Text>
                </div>
            )}
        </div>
    );
}

/**
 * Which way round an order is read when nothing says otherwise
 *
 * Newest, most cards and most valuable all read best from the top; only the
 * alphabet reads from A.
 *
 * @param sort the order
 *
 * @returns whether it starts at the far end
 */
function naturalDescending(sort: PublicDeckSort): boolean {
    return sort !== "Name";
}

/**
 * What an order is called
 *
 * Spelled out rather than looked up in a table, like `deck-labels.ts`: the
 * translation scanner only sees keys written inside a `t(...)`.
 *
 * @param sort the order
 * @param t the deck search's translations
 *
 * @returns its name
 */
function sortLabel(sort: PublicDeckSort, t: (key: string) => string): string {
    switch (sort) {
        case "Created":
            return t("label.sort-created");
        case "Name":
            return t("label.sort-name");
        case "Cards":
            return t("label.sort-cards");
        case "Price":
            return t("label.sort-price");
    }
}
