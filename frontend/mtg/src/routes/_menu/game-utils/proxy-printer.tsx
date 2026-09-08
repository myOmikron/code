import { ArrowLeftIcon, PrinterIcon } from "@heroicons/react/20/solid";
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
    Switch,
    SwitchField,
    Text,
} from "components";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { CardSearchPanel } from "src/components/card-search-panel";
import { ProxyPickList } from "src/components/proxy-pick-list";
import { ProxySheet } from "src/components/proxy-sheet";
import { proxyFaces, proxySheets } from "src/utils/proxy-print";
import { useProxyPicks } from "src/utils/use-proxy-picks";

/** What the page can be opened on */
type ProxySearch = {
    /** The deck to start with, as a deck page links it over */
    deck?: string;
    /** Whether to load only the deck's proxy-marked slots */
    proxies?: boolean;
};

export const Route = createFileRoute("/_menu/game-utils/proxy-printer")({
    validateSearch: (search: Record<string, unknown>): ProxySearch => ({
        deck: typeof search.deck === "string" && search.deck !== "" ? search.deck : undefined,
        proxies: search.proxies === true ? true : undefined,
    }),
    component: RouteComponent,
});

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
    const { deck: opened, proxies } = Route.useSearch();
    const picks = useProxyPicks({ deck: opened, proxies, needsImage: true });

    const [backs, setBacks] = useState(true);
    const [cutLines, setCutLines] = useState(true);
    const [skipBasics, setSkipBasics] = useState(true);
    const [preparing, setPreparing] = useState(false);

    const faces = proxyFaces(picks.picked, backs, skipBasics);
    const sheets = proxySheets(faces);

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
                    {picks.decks.length > 0 && (
                        <div className={"flex items-end gap-2"}>
                            <Field className={"min-w-0 flex-1"}>
                                <Label>{t("label.deck")}</Label>
                                <Combobox
                                    options={picks.decks}
                                    value={picks.deck}
                                    onChange={(chosen) => picks.setDeck(chosen)}
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
                                disabled={picks.deck === null || picks.loading}
                                onClick={() => void picks.loadDeck(picks.deck, picks.onlyProxies)}
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
                            countOf={(printing) => picks.picked.find((card) => card.key === printing.id)?.copies ?? 0}
                            onAdd={picks.add}
                            onRemove={(printing) => picks.fewer(printing.id)}
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
                        <SwitchField>
                            <Label>{t("label.only-proxies")}</Label>
                            <Description>{t("description.only-proxies")}</Description>
                            <Switch color={"blue"} checked={picks.onlyProxies} onChange={picks.setOnlyProxies} />
                        </SwitchField>

                        <ProxyPickList
                            cards={picks.picked}
                            onMore={picks.more}
                            onFewer={picks.fewer}
                            onDrop={picks.drop}
                            onClear={picks.clear}
                        />
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
