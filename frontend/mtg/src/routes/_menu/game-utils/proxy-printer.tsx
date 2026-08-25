import { ArrowLeftIcon, MinusIcon, PlusIcon, PrinterIcon, TrashIcon, XMarkIcon } from "@heroicons/react/20/solid";
import { createFileRoute } from "@tanstack/react-router";
import {
    Button,
    Combobox,
    ComboboxLabel,
    ComboboxOption,
    Description,
    EmptyState,
    Field,
    Heading,
    Label,
    PrimaryButton,
    Strong,
    Switch,
    SwitchField,
    Text,
} from "components";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import type { DeckOverviewResponse } from "src/api/generated";
import { CardSearchPanel } from "src/components/card-search-panel";
import { ProxySheet } from "src/components/proxy-sheet";
import { useAccount } from "src/context/account";
import { isBasicLand, printableImage, proxyFaces, proxySheets } from "src/utils/proxy-print";
import type { ProxyCard } from "src/utils/proxy-print";
import type { Printing } from "src/utils/scryfall";

/** What the page can be opened on */
type ProxySearch = {
    /** The deck to start with, as a deck page links it over */
    deck?: string;
};

export const Route = createFileRoute("/_menu/game-utils/proxy-printer")({
    validateSearch: (search: Record<string, unknown>): ProxySearch => ({
        deck: typeof search.deck === "string" && search.deck !== "" ? search.deck : undefined,
    }),
    component: RouteComponent,
});

/** How many copies of one card the list holds at most */
const MAX_COPIES = 99;

/**
 * Cards on paper, in the size they are played at.
 *
 * A proxy stands in for a card that is in another deck, on order, or too dear
 * to sleeve for a kitchen table, and the one thing it has to get right is its
 * size: nine cards to a sheet of A4, cut along the hairline, and the sleeve
 * they go into does not know the difference. Two-sided cards bring their back
 * along, because half a transform card is not a proxy of anything.
 *
 * @returns the page
 */
function RouteComponent() {
    const [t] = useTranslation("game-utils");
    const { account } = useAccount();
    const { deck: opened } = Route.useSearch();
    // A deck handed over in the url is taken once. Without the mark, going back
    // to the tab would file the deck a second time.
    const taken = useRef<string | null>(null);

    const [picked, setPicked] = useState<Array<ProxyCard>>([]);
    const [decks, setDecks] = useState<Array<DeckOverviewResponse>>([]);
    const [deck, setDeck] = useState<DeckOverviewResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [backs, setBacks] = useState(true);
    const [cutLines, setCutLines] = useState(true);
    const [skipBasics, setSkipBasics] = useState(true);
    const [preparing, setPreparing] = useState(false);

    const faces = proxyFaces(picked, backs, skipBasics);
    const sheets = proxySheets(faces);

    // Only what the account may see: the tool itself works without one, on
    // whatever the search turns up.
    useEffect(() => {
        if (account === null) {
            setDecks([]);
            setDeck(null);
            return;
        }
        void Api.decks.list().then(setDecks);
    }, [account]);

    // Opened from a deck: it is chosen and its cards are on the list before the
    // page is looked at, which is the whole point of getting here that way.
    useEffect(() => {
        if (opened === undefined || taken.current === opened) return;

        const listed = decks.find((overview) => overview.deck.uuid === opened);
        if (listed === undefined) return;

        taken.current = opened;
        setDeck(listed);
        void loadDeck(listed);
        // Deliberately not keyed on `loadDeck`, which is rebuilt on every render.
    }, [decks, opened]);

    /**
     * Puts one more copy of a card on the list
     *
     * @param printing the card that was picked
     */
    function add(printing: Printing) {
        setPicked((previous) => {
            const known = previous.find((card) => card.key === printing.id);
            if (known !== undefined) {
                return previous.map((card) =>
                    card.key === printing.id ? { ...card, copies: Math.min(MAX_COPIES, card.copies + 1) } : card,
                );
            }
            return [
                ...previous,
                {
                    key: printing.id,
                    name: printing.name,
                    front: printableImage(printing.largeImageUrl),
                    back: printableImage(printing.backLargeImageUrl),
                    copies: 1,
                    basic: isBasicLand(printing.typeLine),
                },
            ];
        });
    }

    /**
     * Takes one copy back off the list, and the row with the last of them
     *
     * @param key the card
     */
    function remove(key: string) {
        setPicked((previous) =>
            previous
                .map((card) => (card.key === key ? { ...card, copies: card.copies - 1 } : card))
                .filter((card) => card.copies > 0),
        );
    }

    /**
     * Adds everything a deck plays to the list
     *
     * The deck proper only: a sideboard is not what anybody prints a sheet for,
     * and the maybe board is a list of ideas.
     *
     * @param chosen the deck to take, nothing when none is picked
     */
    async function loadDeck(chosen: DeckOverviewResponse | null) {
        if (chosen === null) return;

        setLoading(true);
        try {
            const { cards } = await Api.decks.cards.list(chosen.deck.uuid);
            const added = cards
                .filter((slot) => slot.zone === "Main" || slot.zone === "Commander")
                .map((slot) => ({
                    key: slot.uuid,
                    name: slot.card?.name ?? "",
                    front: printableImage(slot.card?.image_normal),
                    back: printableImage(slot.card?.image_back_normal),
                    copies: Math.min(MAX_COPIES, slot.quantity),
                    basic: isBasicLand(slot.card?.type_line),
                }))
                .filter((card) => card.front !== null);
            setPicked((previous) => [...previous, ...added]);
        } finally {
            setLoading(false);
        }
    }

    /**
     * Hands the sheets to the printer, once every picture is there
     *
     * A print dialog photographs the page as it stands, so an image still on
     * its way is a white gap on the paper. They are fetched first and the
     * dialog opens afterwards.
     */
    async function print() {
        setPreparing(true);
        try {
            await Promise.all(faces.map((face) => preload(face.image)));
        } finally {
            setPreparing(false);
        }
        window.print();
    }

    return (
        <div className={"mx-auto flex w-full max-w-6xl flex-col gap-6"}>
            <header className={"flex flex-wrap items-center justify-between gap-2"}>
                <div className={"flex min-w-0 flex-1 items-center gap-2"}>
                    <Button plain={true} href={"/game-utils"} aria-label={t("button.back-to-tools")}>
                        <ArrowLeftIcon />
                    </Button>
                    <div className={"min-w-0"}>
                        <Heading className={"truncate"}>{t("heading.proxy-printer")}</Heading>
                        <Text className={"mt-1 text-xs"}>{t("description.print-scale")}</Text>
                    </div>
                </div>
                <PrimaryButton disabled={faces.length === 0 || preparing} onClick={() => void print()}>
                    <PrinterIcon />
                    {preparing ? t("button.preparing") : t("button.print")}
                </PrimaryButton>
            </header>

            <div className={"grid gap-6 lg:grid-cols-2"}>
                <div
                    className={
                        "flex min-w-0 flex-col gap-4 rounded-(--radius-card) bg-(--surface-card) p-5 shadow-(--shadow-card-sm) ring-1 ring-zinc-950/5 dark:ring-white/10"
                    }
                >
                    {decks.length > 0 && (
                        <div className={"flex items-end gap-2"}>
                            <Field className={"min-w-0 flex-1"}>
                                <Label>{t("label.deck")}</Label>
                                <Combobox
                                    options={decks}
                                    value={deck}
                                    onChange={(chosen) => setDeck(chosen)}
                                    placeholder={t("label.search-deck")}
                                    displayValue={(overview) => overview?.deck.name ?? ""}
                                >
                                    {(overview) => (
                                        <ComboboxOption value={overview}>
                                            <ComboboxLabel>{overview.deck.name}</ComboboxLabel>
                                        </ComboboxOption>
                                    )}
                                </Combobox>
                            </Field>
                            <Button
                                outline={true}
                                className={"shrink-0"}
                                disabled={deck === null || loading}
                                onClick={() => void loadDeck(deck)}
                            >
                                {t("button.load-deck")}
                            </Button>
                        </div>
                    )}

                    {/* The results are a page of Scryfall and go on well past
                        the fold, which on a phone buries the list underneath
                        them. They scroll in their own box instead, with the
                        search field pinned to its top. */}
                    <div className={"max-h-[70vh] min-h-0 overflow-y-auto overscroll-contain"}>
                        <CardSearchPanel
                            unique={"cards"}
                            autoFocus={false}
                            stickySearch={true}
                            hideInfoOnMobile={true}
                            countOf={(printing) => picked.find((card) => card.key === printing.id)?.copies ?? 0}
                            onAdd={add}
                            onRemove={(printing) => remove(printing.id)}
                        />
                    </div>
                </div>

                <div className={"flex min-w-0 flex-col gap-4"}>
                    <div
                        className={
                            "flex flex-col gap-4 rounded-(--radius-card) bg-(--surface-card) p-5 shadow-(--shadow-card-sm) ring-1 ring-zinc-950/5 dark:ring-white/10"
                        }
                    >
                        <div className={"flex items-baseline justify-between gap-3"}>
                            <h3 className={"text-sm/6 font-medium text-zinc-950 dark:text-white"}>
                                {t("heading.print-list")}
                            </h3>
                            <Text className={"text-xs"}>
                                {`${t("label.card-count", { count: faces.length })} · ${t("label.sheet-count", {
                                    count: sheets.length,
                                })}`}
                            </Text>
                        </div>

                        <SwitchField>
                            <Label>{t("label.print-backs")}</Label>
                            <Description>{t("description.print-backs")}</Description>
                            <Switch color={"blue"} checked={backs} onChange={setBacks} />
                        </SwitchField>
                        <SwitchField>
                            <Label>{t("label.cut-lines")}</Label>
                            <Description>{t("description.cut-lines")}</Description>
                            <Switch color={"blue"} checked={cutLines} onChange={setCutLines} />
                        </SwitchField>
                        <SwitchField>
                            <Label>{t("label.skip-basics")}</Label>
                            <Description>{t("description.skip-basics")}</Description>
                            <Switch color={"blue"} checked={skipBasics} onChange={setSkipBasics} />
                        </SwitchField>

                        {picked.length === 0 ? (
                            <Text className={"text-sm"}>{t("description.nothing-picked")}</Text>
                        ) : (
                            <>
                                <ul className={"flex flex-col divide-y divide-zinc-950/5 dark:divide-white/10"}>
                                    {picked.map((card) => (
                                        <li key={card.key} className={"flex items-center gap-2 py-2"}>
                                            <Strong className={"min-w-0 flex-1 truncate text-sm"}>{card.name}</Strong>
                                            {card.back !== null && (
                                                <span
                                                    className={
                                                        "shrink-0 text-xs text-zinc-500 max-sm:hidden dark:text-zinc-400"
                                                    }
                                                >
                                                    {t("label.two-sided")}
                                                </span>
                                            )}
                                            <Button
                                                plain={true}
                                                aria-label={t("accessibility.fewer-copies", { name: card.name })}
                                                onClick={() => remove(card.key)}
                                            >
                                                <MinusIcon />
                                            </Button>
                                            <span
                                                className={
                                                    "w-6 shrink-0 text-center text-sm text-zinc-950 tabular-nums dark:text-white"
                                                }
                                            >
                                                {card.copies}
                                            </span>
                                            <Button
                                                plain={true}
                                                aria-label={t("accessibility.more-copies", { name: card.name })}
                                                onClick={() => copy(setPicked, card.key)}
                                            >
                                                <PlusIcon />
                                            </Button>
                                            <Button
                                                plain={true}
                                                aria-label={t("accessibility.drop-card", { name: card.name })}
                                                onClick={() => drop(setPicked, card.key)}
                                            >
                                                <XMarkIcon />
                                            </Button>
                                        </li>
                                    ))}
                                </ul>
                                <Button outline={true} onClick={() => setPicked([])}>
                                    <TrashIcon />
                                    {t("button.clear-list")}
                                </Button>
                            </>
                        )}
                    </div>

                    {sheets.length === 0 ? (
                        <EmptyState title={t("heading.nothing-picked")} description={t("description.choose-cards")} />
                    ) : (
                        <div className={"flex flex-col gap-4 max-sm:mx-auto max-sm:max-w-72"}>
                            {sheets.map((sheet, index) => (
                                <div key={index} className={"flex flex-col gap-1.5"}>
                                    <Text className={"text-xs"}>{t("label.sheet-number", { number: index + 1 })}</Text>
                                    <ProxySheet faces={sheet} cutLines={cutLines} mode={"screen"} />
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <PrintSheets>
                {sheets.map((sheet, index) => (
                    <ProxySheet key={index} faces={sheet} cutLines={cutLines} mode={"paper"} />
                ))}
            </PrintSheets>
        </div>
    );
}

/**
 * The properties for {@link PrintSheets}
 */
type PrintSheetsProps = {
    /** The sheets to hand to the printer */
    children: React.ReactNode;
};

/**
 * The sheets, parked outside the app for the printer to find.
 *
 * Everything the page wears around the sheets — the navigation, the list, the
 * preview — has no business on paper, and a sheet measured in millimetres has
 * no business inside a column that is as wide as the window. Both are settled
 * by putting the paper copy directly under `body`, where the app's print rule
 * hides everything that is not it.
 *
 * @returns the parked sheets
 */
function PrintSheets({ children }: PrintSheetsProps) {
    const [host] = useState(() => document.createElement("div"));

    useEffect(() => {
        host.dataset.printSheets = "true";
        host.className = "hidden print:block";
        document.body.append(host);
        return () => host.remove();
    }, [host]);

    return createPortal(children, host);
}

/**
 * Puts one more copy of a card on the list
 *
 * @param setPicked what the list is written with
 * @param key the card
 */
function copy(setPicked: React.Dispatch<React.SetStateAction<Array<ProxyCard>>>, key: string) {
    setPicked((previous) =>
        previous.map((card) => (card.key === key ? { ...card, copies: Math.min(MAX_COPIES, card.copies + 1) } : card)),
    );
}

/**
 * Takes a card off the list altogether
 *
 * @param setPicked what the list is written with
 * @param key the card
 */
function drop(setPicked: React.Dispatch<React.SetStateAction<Array<ProxyCard>>>, key: string) {
    setPicked((previous) => previous.filter((card) => card.key !== key));
}

/**
 * Waits for one picture to arrive
 *
 * A failure is swallowed: a picture Scryfall no longer serves should cost its
 * own square on the sheet, not the whole print run.
 *
 * @param url the picture
 *
 * @returns a promise settling once it is there or gone
 */
async function preload(url: string): Promise<void> {
    const image = new Image();
    image.src = url;
    try {
        await image.decode();
    } catch {
        return;
    }
}
