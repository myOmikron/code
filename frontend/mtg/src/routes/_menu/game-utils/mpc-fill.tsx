import { ArrowLeftIcon, PlusIcon } from "@heroicons/react/20/solid";
import { createFileRoute } from "@tanstack/react-router";
import { Button, EmptyState, Heading, PrimaryButton, Text, notify } from "components";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import type { MpcFillImageResponse } from "src/api/generated";
import { MpcFillAddDialog } from "src/components/mpcfill-add-dialog";
import { MpcFillArtDialog } from "src/components/mpcfill-art-dialog";
import { MpcFillCardTile } from "src/components/mpcfill-card-tile";
import type { MpcFillTileFace } from "src/components/mpcfill-card-tile";
import { MpcFillOrderDialog } from "src/components/mpcfill-order-dialog";
import { MpcFillOrderDock } from "src/components/mpcfill-order-dock";
import { MPC_BRACKETS, mpcBracket, mpcCards, mpcCount, mpcFaces, mpcFillList, mpcQuery } from "src/utils/mpcfill";
import { DEFAULT_MPC_STOCK, mpcFillReady, mpcFillXml } from "src/utils/mpcfill-xml";
import type { MpcFillOrderCard, MpcFillPick, MpcStock } from "src/utils/mpcfill-xml";
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

    // The art, keyed by the name it was searched under, and what was taken out
    // of it. Keyed by face rather than by card: four copies of a card are four
    // slots of the same picture, and a card in two decks is the same picture
    // again.
    const [art, setArt] = useState<Record<string, Array<MpcFillImageResponse>>>({});
    const [chosen, setChosen] = useState<Record<string, MpcFillPick>>({});
    const [cardbacks, setCardbacks] = useState<Array<MpcFillImageResponse>>([]);
    const [cardback, setCardback] = useState<MpcFillPick | null>(null);

    const [adding, setAdding] = useState(false);
    const [settings, setSettings] = useState(false);
    const [browsing, setBrowsing] = useState<{ face: string; label: string } | "cardback" | null>(null);

    // What the order adds up to: the same print asked for twice is one card
    // with two copies, however it got onto the list.
    const rows = mpcCards(picks.picked, false);
    const count = mpcCount(rows);
    const bracket = mpcBracket(count);
    const list = mpcFillList(rows);

    /**
     * One side of a card, with the art there is for it
     *
     * @param name the name MPCFill is asked for
     *
     * @returns the face
     */
    function faceOf(name: string): MpcFillTileFace {
        const images = art[name];
        const pick = chosen[name];
        return {
            name,
            images: images ?? [],
            chosen: images?.find((image) => image.id === pick?.id) ?? null,
            searched: images !== undefined,
        };
    }

    const orderCards: Array<MpcFillOrderCard> = rows.map((card) => {
        const { front, back } = mpcFaces(card);
        return {
            copies: card.copies,
            // The folded name, not the printed one: it is what MPCFill was
            // asked, and what it would search again on a re-import.
            frontQuery: mpcQuery(front),
            front: chosen[front] ?? null,
            backQuery: back === null ? null : mpcQuery(back),
            back: back === null ? null : (chosen[back] ?? null),
        };
    });
    const ready = mpcFillReady(orderCards);
    const missing = orderCards.length - ready.length;
    const xml = mpcFillXml({ cards: orderCards, stock, foil, cardback });

    // Every face on the order, and the ones nothing has been asked about yet.
    // Joined into a string as the effect's key: a new array every render would
    // fire it every render.
    const faces = rows.flatMap((card) => {
        const { front, back } = mpcFaces(card);
        return back === null ? [front] : [front, back];
    });
    const unsearched = [...new Set(faces)].filter((name) => art[name] === undefined);
    const pending = unsearched.join("|");

    // The tiles are the rows as they were picked, not the merged ones: a tile's
    // copies and its way off the order act on the row it came from, and a
    // merged row is nobody's. Sorted by name, because that is how a card is
    // found again in a grid of a hundred.
    const tiles = [...picks.picked]
        .filter((card) => card.name !== "")
        .sort((left, right) => left.name.localeCompare(right.name));

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
     * The first hit of each is taken right away: MPCFill ranks the drives, so
     * the top one is the answer most of the time and the picker is for the
     * times it is not. Anything already picked keeps its pick.
     *
     * @param names the faces to look up
     */
    async function searchArt(names: Array<string>) {
        try {
            const [found, backs] = await Promise.all([
                Api.mpcfill.art(names),
                cardbacks.length === 0 ? Api.mpcfill.cardbacks() : Promise.resolve({ cardbacks }),
            ]);

            setArt((previous) => {
                // Every name that was asked about is written, found or not:
                // without that, a card nobody drew stays unsearched and is
                // asked about again on the next render.
                const next = { ...previous };
                for (const name of names) next[name] ??= [];
                for (const result of found.results) next[result.name] = result.images;
                return next;
            });
            setChosen((previous) => {
                const next = { ...previous };
                for (const result of found.results) {
                    const first = result.images[0];
                    if (next[result.name] === undefined && first !== undefined) {
                        next[result.name] = { id: first.id, name: first.name };
                    }
                }
                return next;
            });

            setCardbacks(backs.cardbacks);
            const back = backs.cardbacks[0];
            if (cardback === null && back !== undefined) setCardback({ id: back.id, name: back.name });
        } catch {
            // The names stay unwritten, so the next card added asks again.
            notify.error(t("toast.art-not-searched"));
        }
    }

    /**
     * Takes the art a step along in what was found for one face
     *
     * @param face the face
     * @param step how far, in either direction
     */
    function cycle(face: MpcFillTileFace, step: number) {
        if (face.images.length === 0) return;

        const at = face.images.findIndex((image) => image.id === face.chosen?.id);
        const next = face.images[(at + step + face.images.length) % face.images.length];
        if (next === undefined) return;

        setChosen((previous) => ({ ...previous, [face.name]: { id: next.id, name: next.name } }));
    }

    /**
     * Takes one image for whatever the picker is open on
     *
     * @param image the image that was clicked
     */
    function choose(image: MpcFillImageResponse) {
        if (browsing === null) return;
        if (browsing === "cardback") {
            setCardback({ id: image.id, name: image.name });
        } else {
            setChosen((previous) => ({ ...previous, [browsing.face]: { id: image.id, name: image.name } }));
        }
        setBrowsing(null);
    }

    /** Hands the order file to the browser as a download */
    function downloadXml() {
        download(`${filename(picks.deck?.deck.name)}.xml`, xml);
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
                <div className={"flex min-w-0 flex-1 items-center gap-2"}>
                    <Button plain={true} href={"/game-utils"} aria-label={t("button.back-to-tools")}>
                        <ArrowLeftIcon />
                    </Button>
                    <div className={"min-w-0"}>
                        <Heading className={"truncate"}>{t("heading.mpc-fill")}</Heading>
                        <Text className={"mt-1 text-xs"}>{t("description.mpc-order")}</Text>
                    </div>
                </div>
                <PrimaryButton onClick={() => setAdding(true)}>
                    <PlusIcon />
                    {t("button.add-cards")}
                </PrimaryButton>
            </header>

            {rows.length === 0 ? (
                <EmptyState title={t("heading.nothing-ordered")} description={t("description.choose-order")} />
            ) : (
                <>
                    {bracket === null && (
                        <Text className={"text-xs text-(--color-warning)"}>
                            {t("description.order-too-large", { cards: MPC_MAX })}
                        </Text>
                    )}

                    <ul className={"grid grid-cols-2 gap-x-4 gap-y-5 md:grid-cols-3 xl:grid-cols-4"}>
                        {tiles.map((card) => {
                            const { front, back } = mpcFaces(card);
                            return (
                                <li key={card.key} className={"min-w-0"}>
                                    <MpcFillCardTile
                                        label={card.name}
                                        copies={card.copies}
                                        front={faceOf(front)}
                                        back={back === null ? null : faceOf(back)}
                                        onCycle={cycle}
                                        onBrowse={(face, label) => setBrowsing({ face: face.name, label })}
                                        onMore={() => picks.more(card.key)}
                                        onFewer={() => picks.fewer(card.key)}
                                        onDrop={() => picks.drop(card.key)}
                                    />
                                </li>
                            );
                        })}
                    </ul>
                </>
            )}

            {rows.length > 0 && (
                <MpcFillOrderDock
                    count={count}
                    bracket={bracket}
                    missing={missing}
                    cardback={cardbacks.find((image) => image.id === cardback?.id)?.thumbnail_small ?? null}
                    ready={ready.length > 0}
                    onCardback={() => setBrowsing("cardback")}
                    onSettings={() => setSettings(true)}
                    onDownload={downloadXml}
                />
            )}

            <MpcFillAddDialog
                open={adding}
                decks={picks.decks}
                deck={picks.deck}
                onDeck={picks.setDeck}
                onlyProxies={picks.onlyProxies}
                onOnlyProxies={picks.setOnlyProxies}
                loading={picks.loading}
                onLoadDeck={() => void picks.loadDeck(picks.deck, picks.onlyProxies)}
                countOf={(printing) => picks.picked.find((card) => card.key === printing.id)?.copies ?? 0}
                onAdd={picks.add}
                onRemove={(printing) => picks.fewer(printing.id)}
                onClose={() => setAdding(false)}
            />

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
                onClose={() => setSettings(false)}
            />

            <MpcFillArtDialog
                open={browsing !== null}
                title={browsing === null ? "" : browsing === "cardback" ? t("heading.cardback") : browsing.label}
                images={browsing === null ? [] : browsing === "cardback" ? cardbacks : (art[browsing.face] ?? [])}
                chosen={
                    browsing === null
                        ? null
                        : browsing === "cardback"
                          ? (cardback?.id ?? null)
                          : (chosen[browsing.face]?.id ?? null)
                }
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
 * @param deck the deck's name, nothing when the cards were searched together by hand
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
