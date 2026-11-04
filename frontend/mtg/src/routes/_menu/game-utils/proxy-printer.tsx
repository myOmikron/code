import { ArrowLeftIcon, PrinterIcon } from "@heroicons/react/20/solid";
import { createFileRoute } from "@tanstack/react-router";
import clsx from "clsx";
import { Button, EmptyState, Heading, Label, Switch, SwitchField, Text } from "components";
import { PrimaryButton } from "src/components/primary-button";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { CardSearchPanel } from "src/components/card-search-panel";
import { ProxyDeckPicker } from "src/components/proxy-deck-picker";
import { ProxyPickList } from "src/components/proxy-pick-list";
import { ProxySheet } from "src/components/proxy-sheet";
import { ProxySheetPager } from "src/components/proxy-sheet-pager";
import { groupSheets } from "src/utils/proxy-list";
import type { ProxyGroup } from "src/utils/proxy-list";
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
    // The search owns its field, so going back to the list starts a new one.
    const [query, setQuery] = useState("");
    const [searchRun, setSearchRun] = useState(0);
    const searching = query.trim() !== "";

    const faces = proxyFaces(picks.picked, backs, skipBasics);
    const sheets = proxySheets(faces);

    /**
     * How many pictures of a group go on paper, which is what the print list counts
     *
     * @param group the group
     *
     * @returns the pictures
     */
    function countOf(group: ProxyGroup): number {
        return proxyFaces(group.cards, backs, skipBasics).length;
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

            <div className={"grid items-start gap-6 lg:grid-cols-2"}>
                <div
                    className={
                        "flex min-w-0 flex-col gap-4 rounded-(--radius-card) bg-(--surface-card) p-5 shadow-(--shadow-card-sm) ring-1 ring-zinc-950/5 dark:ring-white/10"
                    }
                >
                    {picks.decks.length > 0 && (
                        <ProxyDeckPicker
                            decks={picks.decks}
                            groups={picks.groups}
                            deck={picks.deck}
                            onDeck={picks.setDeck}
                            loading={picks.loading}
                            onAdd={() => void picks.loadDeck(picks.deck)}
                        />
                    )}

                    <div>
                        <CardSearchPanel
                            key={searchRun}
                            unique={"cards"}
                            autoFocus={false}
                            stickySearch={true}
                            hideInfo={true}
                            onQueryChange={setQuery}
                            countOf={(printing) => picks.countOf(printing.id)}
                            onAdd={picks.add}
                            onRemove={(printing) => picks.fewer(printing.id)}
                        />
                    </div>

                    {searching && (
                        <Button
                            outline={true}
                            onClick={() => {
                                setQuery("");
                                setSearchRun((run) => run + 1);
                            }}
                        >
                            {t("button.back-to-list")}
                        </Button>
                    )}

                    {/* Hidden rather than gone, so the list keeps which decks are open. */}
                    <div className={clsx("flex flex-col gap-4", searching && "hidden")}>
                        <SwitchField>
                            <Label>{t("label.only-proxies")}</Label>
                            <Switch color={"lime"} checked={picks.onlyProxies} onChange={picks.setOnlyProxies} />
                        </SwitchField>
                        <ProxyPickList
                            groups={picks.groups}
                            countOf={countOf}
                            onMore={picks.more}
                            onFewer={picks.fewer}
                            onDrop={picks.drop}
                            onDropDeck={picks.dropDeck}
                            onClear={picks.clear}
                        />
                    </div>
                </div>

                <div
                    className={
                        "flex min-w-0 flex-col gap-4 rounded-(--radius-card) bg-(--surface-card) p-5 shadow-(--shadow-card-sm) ring-1 ring-zinc-950/5 lg:sticky lg:top-4 dark:ring-white/10"
                    }
                >
                    <div className={"flex items-baseline justify-between gap-3"}>
                        <h2 className={"text-sm/6 font-medium text-zinc-950 dark:text-white"}>
                            {t("heading.print-list")}
                        </h2>
                        <Text className={"text-xs"}>
                            {`${t("label.card-count", { count: faces.length })} · ${t("label.sheet-count", {
                                count: sheets.length,
                            })}`}
                        </Text>
                    </div>

                    <div className={"flex flex-wrap gap-x-6 gap-y-2"}>
                        <SwitchField className={"gap-x-2!"}>
                            <Label>{t("label.print-backs")}</Label>
                            <Switch color={"lime"} checked={backs} onChange={setBacks} />
                        </SwitchField>
                        <SwitchField className={"gap-x-2!"}>
                            <Label>{t("label.cut-lines")}</Label>
                            <Switch color={"lime"} checked={cutLines} onChange={setCutLines} />
                        </SwitchField>
                        <SwitchField className={"gap-x-2!"}>
                            <Label>{t("label.skip-basics")}</Label>
                            <Switch color={"lime"} checked={skipBasics} onChange={setSkipBasics} />
                        </SwitchField>
                    </div>

                    {sheets.length === 0 ? (
                        <EmptyState title={t("heading.nothing-picked")} description={t("description.choose-cards")} />
                    ) : (
                        <ProxySheetPager
                            sheets={sheets}
                            cutLines={cutLines}
                            spans={groupSheets(picks.groups, backs, skipBasics)}
                        />
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
