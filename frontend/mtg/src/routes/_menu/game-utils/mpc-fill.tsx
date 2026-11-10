import { ArrowLeftIcon, PlusIcon } from "@heroicons/react/20/solid";
import { createFileRoute } from "@tanstack/react-router";
import { Button, EmptyState, Heading, Text, notify } from "components";
import { PrimaryButton } from "src/components/primary-button";
import { useDeferredValue, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import type { MpcFillImageResponse } from "src/api/generated";
import { MpcFillAddDialog } from "src/components/mpcfill-add-dialog";
import { MpcFillArtDialog } from "src/components/mpcfill-art-dialog";
import { MpcFillArtScopeDialog } from "src/components/mpcfill-art-scope-dialog";
import { MpcFillCardTile } from "src/components/mpcfill-card-tile";
import type { MpcFillTileFace } from "src/components/mpcfill-card-tile";
import { MpcFillOrderDialog } from "src/components/mpcfill-order-dialog";
import { MpcFillOrderDock } from "src/components/mpcfill-order-dock";
import { MpcFillOrderToolbar } from "src/components/mpcfill-order-toolbar";
import { ProxyGroupRow } from "src/components/proxy-group-row";
import {
    MPC_BRACKETS,
    MPC_MAX_NAMES,
    loadMpcArtScope,
    loadMpcSort,
    mpcBracket,
    mpcByDrives,
    mpcCards,
    mpcChoose,
    mpcCount,
    mpcFaces,
    mpcFavorite,
    mpcFillList,
    mpcGroupsWith,
    mpcNeedsArt,
    mpcPick,
    mpcQuery,
    mpcStarred,
    mpcTiles,
    saveMpcArtScope,
    saveMpcSort,
} from "src/utils/mpcfill";
import type { MpcArtScope, MpcFavoriteMatch, MpcFavoriteStatus, MpcPicks, MpcSort } from "src/utils/mpcfill";
import { DEFAULT_MPC_STOCK, mpcFillReady, mpcFillXml } from "src/utils/mpcfill-xml";
import type { MpcFillOrderCard, MpcStock } from "src/utils/mpcfill-xml";
import { groupKey, showsHeadings } from "src/utils/proxy-list";
import type { ProxyGroup } from "src/utils/proxy-list";
import { useMpcFavorites } from "src/utils/use-mpc-favorites";
import { useProxyPicks } from "src/utils/use-proxy-picks";

/** What the page can be opened on */
type MpcFillSearch = {
    /** The deck to start with, as a deck page links it over */
    deck?: string;
    /** Whether to load only the deck's proxy-marked slots */
    proxies?: boolean;
};

export const Route = createFileRoute("/_menu/game-utils/mpc-fill")({
    validateSearch: (search: Record<string, unknown>): MpcFillSearch => ({
        deck: typeof search.deck === "string" && search.deck !== "" ? search.deck : undefined,
        proxies: search.proxies === true ? true : undefined,
    }),
    component: RouteComponent,
});

/** The largest order MakePlayingCards prints in one go */
const MPC_MAX = MPC_BRACKETS[MPC_BRACKETS.length - 1] ?? 0;

/** How long adding cards has to pause before their art is searched for */
const SEARCH_DELAY_MS = 400;

/**
 * The order, laid out as the cards it is going to be printed as.
 *
 * The other way round than the printer: rather than nine cards on a sheet of
 * A4, the order goes to MPCFill, which holds the community's custom card art in
 * Google Drive folders and hands the finished order to MakePlayingCards —
 * printed on real cardboard, cut, and in the post.
 *
 * Which art each card gets is the whole job here, and it is a question about
 * pictures, so the page is pictures: one tile per card, filled with what is
 * going to be printed, steppable to the next candidate and clickable for all of
 * them. The list of names — and the search that adds to it — sits behind a
 * button, because it is read once and looked at never again.
 *
 * The art is searched as cards arrive, through our own service; MPCFill answers
 * cross-origin requests for their own site only.
 *
 * @returns the page
 */
function RouteComponent() {
    const [t] = useTranslation("game-utils");
    const { deck: opened, proxies } = Route.useSearch();
    const picks = useProxyPicks({ deck: opened, proxies, needsImage: false });

    const [stock, setStock] = useState<MpcStock>(DEFAULT_MPC_STOCK);
    const [foil, setFoil] = useState(false);

    const [art, setArt] = useState<Record<string, Array<MpcFillImageResponse>>>({});
    const [chosen, setChosen] = useState<MpcPicks>({});
    const [scope, setScope] = useState<MpcArtScope>(loadMpcArtScope);
    const [answered, setAnswered] = useState<Record<string, boolean>>({});
    const [confirming, setConfirming] = useState<{ group: ProxyGroup; face: string; id: string } | null>(null);
    const [cardbacks, setCardbacks] = useState<Array<MpcFillImageResponse>>([]);
    const [cardback, setCardback] = useState<string | null>(null);
    const favorites = useMpcFavorites();
    const healed = useRef(new Set<string>());
    const [renewed, setRenewed] = useState<ReadonlySet<string>>(new Set());
    const asking = useRef(new Set<string>());

    const [adding, setAdding] = useState(false);
    const [settings, setSettings] = useState(false);
    const [browsing, setBrowsing] = useState<{ group: ProxyGroup; face: string; label: string } | "cardback" | null>(
        null,
    );

    const [query, setQuery] = useState("");
    const [sort, setSort] = useState<MpcSort>(loadMpcSort);
    const [onlyMissing, setOnlyMissing] = useState(false);
    const found = useDeferredValue(query);

    const sections = picks.groups.map((group) => ({ group, rows: mpcCards(group.cards, false) }));
    const rows = sections.flatMap((section) => section.rows);
    const headed = showsHeadings(picks.groups);
    const count = mpcCount(rows);
    const bracket = mpcBracket(count);
    const list = mpcFillList(rows);

    /**
     * What was found for one face, the starred drives first
     *
     * @param face the name MPCFill is asked for
     *
     * @returns the images
     */
    function imagesOf(face: string): Array<MpcFillImageResponse> {
        return mpcByDrives(art[face] ?? [], favorites.drives);
    }

    /**
     * What the account's favorites say about one face
     *
     * @param face the name MPCFill is asked for
     *
     * @returns the match, `null` when nothing for the face is starred
     */
    function matchOf(face: string): MpcFavoriteMatch | null {
        return mpcFavorite(art[face] ?? [], favorites.images, face);
    }

    /**
     * How the account's favorite for one face was found, a healed re-upload staying "updated" for the visit
     *
     * @param face the name MPCFill is asked for
     *
     * @returns the status, `null` when nothing for the face is starred
     */
    function statusOf(face: string): MpcFavoriteStatus | null {
        const match = matchOf(face);
        if (match?.status === "favorite" && match.image !== null && renewed.has(match.image.id)) return "updated";
        return match?.status ?? null;
    }

    /**
     * The art taken for one face in one group
     *
     * @param group the group
     * @param face the name MPCFill is asked for
     *
     * @returns the image, `null` while there is none
     */
    function pickOf(group: ProxyGroup, face: string): MpcFillImageResponse | null {
        return mpcPick(chosen, imagesOf(face), group, face, matchOf(face)?.image ?? null);
    }

    /**
     * One side of a card, with the art there is for it
     *
     * @param group the group the card is in
     * @param name the name MPCFill is asked for
     *
     * @returns the face
     */
    function faceOf(group: ProxyGroup, name: string): MpcFillTileFace {
        return {
            name,
            images: imagesOf(name),
            chosen: pickOf(group, name),
            searched: art[name] !== undefined,
            favorite: statusOf(name),
        };
    }

    const orderCards: Array<MpcFillOrderCard> = sections.flatMap((section) =>
        section.rows.map((card) => {
            const { front, back } = mpcFaces(card);
            return {
                copies: card.copies,
                // The folded name, not the printed one: it is what MPCFill was
                // asked, and what it would search again on a re-import.
                frontQuery: mpcQuery(front),
                front: pickOf(section.group, front),
                backQuery: back === null ? null : mpcQuery(back),
                back: back === null ? null : pickOf(section.group, back),
            };
        }),
    );
    const ready = mpcFillReady(orderCards);
    const missing = picks.picked.filter((card) => card.name !== "" && mpcNeedsArt(art, card)).length;
    const missingOnly = onlyMissing && missing > 0;
    const filtering = missingOnly || found.trim() !== "";
    const shown = sections
        .map((section) => ({
            ...section,
            tiles: mpcTiles(section.group, sort, found).filter((card) => !missingOnly || mpcNeedsArt(art, card)),
        }))
        .filter((section) => !filtering || section.tiles.length > 0);

    // Every face on the order, and the ones nothing has been asked about yet.
    // Joined into a string as the effect's key: a new array every render would
    // fire it every render.
    const faces = rows.flatMap((card) => {
        const { front, back } = mpcFaces(card);
        return back === null ? [front] : [front, back];
    });
    const unsearched = [...new Set(faces)].filter((name) => art[name] === undefined);
    const pending = unsearched.join("|");

    const knownDrives = [...new Set([...Object.values(art).flat(), ...cardbacks].map((image) => image.source))].sort(
        (left, right) => left.localeCompare(right),
    );
    const browsingFace = browsing === null || browsing === "cardback" ? null : browsing.face;
    const backs = mpcByDrives(cardbacks, favorites.drives);
    const backMatch = mpcFavorite(cardbacks, favorites.images, null);
    const back = backs.find((image) => image.id === cardback) ?? backMatch?.image ?? backs[0] ?? null;

    const updated = [...[...new Set(faces)].map(matchOf), backMatch].flatMap((match) =>
        match?.status === "updated" && match.image !== null ? [{ favorite: match.favorite, image: match.image }] : [],
    );
    const browsingMatch = browsing === null ? null : browsing === "cardback" ? backMatch : matchOf(browsing.face);
    const healing = updated.map(({ favorite, image }) => `${favorite.image.drive_id}>${image.id}`).join("|");

    useEffect(() => {
        for (const { favorite, image } of updated) {
            const key = `${favorite.image.drive_id}>${image.id}`;
            if (healed.current.has(key)) continue;
            healed.current.add(key);
            setRenewed((previous) => new Set(previous).add(image.id));
            favorites.replace(favorite, image);
        }
    }, [healing]);

    // Searched as the cards arrive rather than on a button: a card with no
    // picture on it is not an order yet, and the service caches per name, so
    // adding four cards one after the other is four cheap requests.
    useEffect(() => {
        if (pending === "") return;

        const timer = window.setTimeout(() => void searchArt(pending.split("|")), SEARCH_DELAY_MS);
        return () => window.clearTimeout(timer);
        // Deliberately keyed on the names alone: `searchArt` is rebuilt on
        // every render, and the art it writes is what settles this.
    }, [pending]);

    /**
     * Asks MPCFill what art it has for these card faces
     *
     * A face nobody picked for shows the first hit: MPCFill ranks the drives,
     * so the top one is the answer most of the time.
     *
     * @param names the faces to look up
     */
    async function searchArt(names: Array<string>) {
        const fresh = names.filter((name) => !asking.current.has(name));
        if (fresh.length === 0) return;

        const batches: Array<Array<string>> = [];
        for (let at = 0; at < fresh.length; at += MPC_MAX_NAMES) batches.push(fresh.slice(at, at + MPC_MAX_NAMES));

        for (const name of fresh) asking.current.add(name);
        try {
            const [answers, backs] = await Promise.all([
                Promise.all(batches.map((batch) => Api.mpcfill.art(batch))),
                cardbacks.length === 0 ? Api.mpcfill.cardbacks() : Promise.resolve({ cardbacks }),
            ]);

            setArt((previous) => {
                // Every name that was asked about is written, found or not:
                // without that, a card nobody drew stays unsearched and is
                // asked about again on the next render.
                const next = { ...previous };
                for (const name of fresh) next[name] ??= [];
                for (const result of answers.flatMap((answer) => answer.results)) next[result.name] = result.images;
                return next;
            });
            setCardbacks(backs.cardbacks);
        } catch {
            // The names stay unwritten, so the next card added asks again.
            notify.error(t("toast.art-not-searched"));
        } finally {
            for (const name of fresh) asking.current.delete(name);
        }
    }

    /**
     * Takes an image for one face in one group, or asks first whether every group takes it
     *
     * @param group the group
     * @param face the name MPCFill is asked for
     * @param image the image
     */
    function pick(group: ProxyGroup, face: string, image: MpcFillImageResponse) {
        const everywhere = answered[face] ?? (scope === "ask" ? undefined : scope === "all");
        if (everywhere === undefined && mpcGroupsWith(picks.groups, face) > 1) {
            setConfirming({ group, face, id: image.id });
            return;
        }
        setChosen((previous) => mpcChoose(previous, group, face, image.id, everywhere === true));
    }

    /**
     * Takes the pick that was waiting on the question
     *
     * @param everywhere whether every group takes it
     * @param remember whether this device stops asking
     */
    function answer(everywhere: boolean, remember: boolean) {
        if (confirming === null) return;
        const { group, face, id } = confirming;

        if (remember) {
            changeScope(everywhere ? "all" : "deck");
        } else {
            setAnswered((previous) => ({ ...previous, [face]: everywhere }));
        }
        setChosen((previous) => mpcChoose(previous, group, face, id, everywhere));
        setConfirming(null);
    }

    /**
     * Changes whether new art is taken for every deck, and forgets the answers given per card
     *
     * @param next the answer
     */
    function changeScope(next: MpcArtScope) {
        setScope(next);
        saveMpcArtScope(next);
        setAnswered({});
    }

    /**
     * Takes the art a step along in what was found for one face
     *
     * @param group the group the card is in
     * @param face the face
     * @param step how far, in either direction
     */
    function cycle(group: ProxyGroup, face: MpcFillTileFace, step: number) {
        const at = face.images.findIndex((image) => image.id === face.chosen?.id);
        const next = face.images[(at + step + face.images.length) % face.images.length];
        if (next !== undefined) pick(group, face.name, next);
    }

    /**
     * Takes one image for whatever the picker is open on
     *
     * @param image the image that was clicked
     */
    function choose(image: MpcFillImageResponse) {
        if (browsing === null) return;
        if (browsing === "cardback") {
            setCardback(image.id);
        } else {
            pick(browsing.group, browsing.face, image);
        }
        setBrowsing(null);
    }

    /**
     * What to tell the reader about a favorite that was not found as it was starred
     *
     * @param match what the favorites say about the face
     *
     * @returns the notice, `null` when there is nothing to say
     */
    function favoriteNotice(match: MpcFavoriteMatch): string | null {
        if (match.status === "missing") return t("description.favorite-missing");
        if (match.suggestion !== null) return t("description.favorite-suggested", { source: match.suggestion.source });
        return null;
    }

    /** Shows only the cards still missing art, or everything again */
    function toggleMissing() {
        setOnlyMissing(!missingOnly);
    }

    /** Hands the order file to the browser as a download */
    function downloadXml() {
        const only = picks.groups.length === 1 ? picks.groups[0]?.deck : undefined;
        download(
            `${filename(only?.name)}.xml`,
            mpcFillXml({
                cards: orderCards,
                stock,
                foil,
                cardback: back === null ? null : { id: back.id, name: back.name },
            }),
        );
    }

    /** Puts the text list on the clipboard, which is what MPCFill's text import takes */
    async function copyList() {
        try {
            await navigator.clipboard.writeText(list);
            notify.success(t("toast.list-copied"));
        } catch {
            notify.error(t("toast.list-not-copied"));
        }
    }

    return (
        // Room at the bottom for the dock, which floats over the page.
        <div className={"mx-auto flex w-full max-w-7xl flex-col gap-6 pb-20"}>
            <header className={"flex flex-wrap items-center justify-between gap-2"}>
                <div className={"flex min-w-0 flex-1 items-center gap-2 max-sm:basis-full"}>
                    <Button plain={true} href={"/game-utils"} aria-label={t("button.back-to-tools")}>
                        <ArrowLeftIcon />
                    </Button>
                    <div className={"min-w-0"}>
                        <Heading className={"truncate"}>{t("heading.mpc-fill")}</Heading>
                        <Text className={"mt-1 text-xs"}>{t("description.mpc-order")}</Text>
                    </div>
                </div>
                <PrimaryButton
                    className={"max-sm:w-full"}
                    onClick={() => {
                        setQuery("");
                        setOnlyMissing(false);
                        setAdding(true);
                    }}
                >
                    <PlusIcon />
                    {t("button.add-cards")}
                </PrimaryButton>
            </header>

            {orderCards.length === 0 ? (
                <EmptyState title={t("heading.nothing-ordered")} description={t("description.choose-order")} />
            ) : (
                <>
                    {bracket === null && (
                        <Text className={"text-xs text-(--color-warning)"}>
                            {t("description.order-too-large", { cards: MPC_MAX })}
                        </Text>
                    )}

                    <MpcFillOrderToolbar
                        query={query}
                        onQuery={setQuery}
                        sort={sort}
                        onSort={(next) => {
                            setSort(next);
                            saveMpcSort(next);
                        }}
                        missing={missing}
                        onlyMissing={missingOnly}
                        onMissing={toggleMissing}
                    />

                    {shown.length === 0 && <Text className={"text-sm"}>{t("description.no-matching-card")}</Text>}

                    {shown.map(({ group, rows: groupRows, tiles }) => (
                        <section key={groupKey(group)} className={"flex flex-col gap-3"}>
                            {headed && (
                                <ProxyGroupRow
                                    group={group}
                                    count={mpcCount(groupRows)}
                                    level={2}
                                    onDropDeck={picks.dropDeck}
                                />
                            )}
                            <ul
                                className={
                                    "grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
                                }
                            >
                                {tiles.map((card) => {
                                    const { front, back } = mpcFaces(card);
                                    return (
                                        <li key={card.key} className={"min-w-0"}>
                                            <MpcFillCardTile
                                                label={card.name}
                                                copies={card.copies}
                                                front={faceOf(group, front)}
                                                back={back === null ? null : faceOf(group, back)}
                                                onCycle={(face, step) => cycle(group, face, step)}
                                                onBrowse={(face, label) =>
                                                    setBrowsing({ group, face: face.name, label })
                                                }
                                                onMore={() => picks.more(card.key)}
                                                onFewer={() => picks.fewer(card.key)}
                                                onDrop={() => picks.drop(card.key)}
                                            />
                                        </li>
                                    );
                                })}
                            </ul>
                        </section>
                    ))}
                </>
            )}

            {orderCards.length > 0 && (
                <MpcFillOrderDock
                    count={count}
                    bracket={bracket}
                    missing={missing}
                    onMissing={toggleMissing}
                    cardback={back?.thumbnail_small ?? null}
                    ready={ready.length > 0}
                    onCardback={() => setBrowsing("cardback")}
                    onSettings={() => setSettings(true)}
                    onDownload={downloadXml}
                />
            )}

            <MpcFillAddDialog open={adding} picks={picks} onClose={() => setAdding(false)} />

            <MpcFillOrderDialog
                open={settings}
                stock={stock}
                onStock={setStock}
                foil={foil}
                onFoil={setFoil}
                list={list}
                ready={ready.length > 0}
                onDownload={downloadXml}
                onCopyList={() => void copyList()}
                artScope={scope}
                onArtScope={changeScope}
                drives={favorites.drives}
                knownDrives={knownDrives}
                onDrives={favorites.setDrives}
                onClose={() => setSettings(false)}
            />

            <MpcFillArtScopeDialog
                face={confirming?.face ?? null}
                others={confirming === null ? 0 : mpcGroupsWith(picks.groups, confirming.face) - 1}
                onAnswer={answer}
                onClose={() => setConfirming(null)}
            />

            <MpcFillArtDialog
                open={browsing !== null}
                title={browsing === null ? "" : browsing === "cardback" ? t("heading.cardback") : browsing.label}
                images={browsing === null ? [] : browsing === "cardback" ? backs : imagesOf(browsing.face)}
                chosen={
                    browsing === null
                        ? null
                        : browsing === "cardback"
                          ? (back?.id ?? null)
                          : (pickOf(browsing.group, browsing.face)?.id ?? null)
                }
                notice={browsingMatch === null ? null : favoriteNotice(browsingMatch)}
                starred={(image) => mpcStarred(favorites.images, browsingFace, image.id)}
                onStar={(image) => favorites.toggle(browsingFace, image)}
                drives={favorites.drives}
                onStarDrive={favorites.toggleDrive}
                onChoose={choose}
                onClose={() => setBrowsing(null)}
            />
        </div>
    );
}

/**
 * Hands a file to the browser
 *
 * A blob and a click on a link that is never in the document: there is nothing
 * to upload the order to, so the file is made here and saved from here.
 *
 * @param name the file's name
 * @param text its contents
 */
function download(name: string, text: string) {
    const url = URL.createObjectURL(new Blob([text], { type: "application/xml" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
}

/**
 * What the order file is called
 *
 * Named after the deck it was written for, because an order kept next to three
 * others is only worth keeping if it says which deck it is.
 *
 * @param deck the deck's name, nothing for an order of several decks or hand picks
 *
 * @returns the file's name, without the extension
 */
function filename(deck: string | undefined): string {
    const slug = (deck ?? "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
    return slug === "" ? "mpcfill-order" : `${slug}-mpcfill`;
}
