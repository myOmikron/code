import { Link, createFileRoute } from "@tanstack/react-router";
import {
    ArchiveBoxIcon,
    ArrowRightIcon,
    BellAlertIcon,
    ChevronRightIcon,
    GlobeAltIcon,
    HeartIcon,
    QueueListIcon,
    RectangleStackIcon,
    SparklesIcon,
} from "@heroicons/react/20/solid";
import { Button, Heading, PrimaryButton, Subheading, Text } from "components";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import type {
    CollectionOverviewResponse,
    DeckOverviewResponse,
    FormatRulesResponse,
    ListWatchListAlarmsResponse,
} from "src/api/generated";
import { CollectionPulse } from "src/components/collection-pulse";
import { DeckSpotlight } from "src/components/deck-spotlight";
import { GameToolCard } from "src/components/game-tool-card";
import { HomeStat } from "src/components/home-stat";
import { PublicDeckTile } from "src/components/public-deck-tile";
import { useDeckLabels } from "src/components/deck-labels";
import i18n from "src/i18n";
import { deckRuleZero, letters } from "src/utils/deck-rules";
import { formatCurrency } from "src/utils/format";

/** How many published decks the community strip shows */
const FRESH_DECKS = 5;

/** How many of the reader's own decks the shelf strip lists under the spotlight */
const OWN_DECKS = 4;

/** How many alarms the panel names before it stops counting them out */
const ALARM_ROWS = 3;

/** What the reader's own numbers add up to, read in one go */
type Personal = {
    /** Every deck they built */
    decks: Array<DeckOverviewResponse>;
    /** Every collection they keep */
    collections: Array<CollectionOverviewResponse>;
    /** The price alarms that have gone off */
    alarms: ListWatchListAlarmsResponse;
};

export const Route = createFileRoute("/_menu/home")({
    loader: async () => {
        // The deck tiles and the shelf panel are the deck list's and the
        // collection's, so they read their strings out of those namespaces
        // rather than out of this page's.
        const strings = Promise.all([
            i18n.loadNamespaces("home"),
            i18n.loadNamespaces("deck"),
            i18n.loadNamespaces("collection"),
        ]);
        // Asked here rather than taken from the account context: the context is
        // still checking while this loader runs, and the page is a different
        // one for a visitor than for a member. A visitor's 401 is the normal
        // answer, not a failure — hence the bare call, which does not report.
        const me = await Api.accounts.me().catch(() => null);

        const [community, formats, personal] = await Promise.all([
            // A page that leads with somebody else's deck must not fall over
            // when that read does: the rest of it stands on its own.
            Api.explore.decks.search({ limit: FRESH_DECKS, sort: "Created", descending: true }).catch(() => null),
            Api.decks.formats().catch(() => null),
            me === null ? Promise.resolve(null) : readPersonal(),
            strings,
        ]);

        return { me, community, formats: formats?.formats ?? [], personal };
    },
    component: RouteComponent,
});

/**
 * Everything the dashboard counts, in one round of requests
 *
 * @returns the reader's decks, collections and alarms
 */
async function readPersonal(): Promise<Personal> {
    const [decks, collections, alarms] = await Promise.all([
        Api.decks.list(),
        Api.collections.list(),
        // A badge is not worth the page: without an answer there is simply
        // nothing to mark.
        Api.watchLists.alarms().catch(() => ({ alarms: [], unread: 0 })),
    ]);
    return { decks, collections, alarms };
}

/**
 * How far along a deck is, as a share of what it is built to
 *
 * A deck whose format sets no number, or whose format the service has dropped,
 * has no share to compute — it counts as finished so it does not crowd out a
 * deck that is genuinely still being built.
 *
 * @param overview the deck
 * @param formats the offered formats
 *
 * @returns the share between zero and one
 */
function progress(overview: DeckOverviewResponse, formats: Array<FormatRulesResponse>): number {
    const target = targetOf(overview, formats);
    if (target === null || target === 0) return 1;
    return Math.min(1, overview.cards / target);
}

/**
 * How many cards a deck is built to, `null` when nothing says
 *
 * A table that agreed to another deck size is building toward that number, so
 * it wins over the format's — the same order the deck tile reads them in.
 *
 * @param overview the deck
 * @param formats the offered formats
 *
 * @returns the number of cards, or `null`
 */
function targetOf(overview: DeckOverviewResponse, formats: Array<FormatRulesResponse>): number | null {
    const rules = formats.find((format) => format.slug === overview.deck.format);
    return deckRuleZero(overview.deck).deckSize ?? rules?.deck_size.cards ?? null;
}

/**
 * The way in: a dashboard for members, a front page for everybody else.
 *
 * One route rather than two, because the two are the same page seen from
 * different sides. Both lead with a single deck given the whole width — the
 * one the reader is in the middle of building, or the one the app was handed
 * most recently — because a deck is the thing this app is for, and a wall of
 * equal tiles says nothing about where to start.
 *
 * @returns the page
 */
function RouteComponent() {
    const { me, community, formats, personal } = Route.useLoaderData();
    const [t] = useTranslation("home");
    const [tc] = useTranslation("collection");
    const labels = useDeckLabels();

    // The deck the reader is furthest into without having finished it, which is
    // the one they came back for. Everything finished falls through to the
    // newest, so a shelf of complete decks still leads with something.
    const unfinished = [...(personal?.decks ?? [])]
        .filter((overview) => progress(overview, formats) < 1)
        .sort((left, right) => progress(right, formats) - progress(left, formats));
    const newest = [...(personal?.decks ?? [])].sort((left, right) =>
        right.deck.created_at.localeCompare(left.deck.created_at),
    );
    const lead = unfinished[0] ?? newest[0] ?? null;
    const rest = newest.filter((overview) => overview.deck.uuid !== lead?.deck.uuid).slice(0, OWN_DECKS);

    const published = community?.decks ?? [];
    // The visitor's lead deck is the newest published one; the tiles below it
    // are the rest, so nothing is shown twice.
    const guestLead = me === null ? (published[0] ?? null) : null;
    const fresh = guestLead === null ? published : published.slice(1);

    const alarms = personal?.alarms.alarms ?? [];
    const cards = personal?.collections.reduce((sum, overview) => sum + overview.cards, 0) ?? 0;
    const value = personal?.collections.reduce((sum, overview) => sum + overview.price_eur_cents, 0) ?? 0;

    return (
        <div className={"flex flex-col gap-8"}>
            <header className={"flex flex-col gap-3"}>
                <Heading>{me === null ? t("heading.hero") : t("heading.welcome-back", { name: me.username })}</Heading>
                <Text className={"max-w-2xl"}>
                    {me === null ? t("description.hero") : t("description.welcome-back")}
                </Text>
                <div className={"mt-1 flex flex-wrap items-center gap-3"}>
                    {me === null ? (
                        <>
                            <PrimaryButton href={"/auth/signup"}>{t("button.get-started")}</PrimaryButton>
                            <Button outline href={"/global/decks"}>
                                {t("button.browse-decks")}
                                <ArrowRightIcon />
                            </Button>
                            <Button plain href={"/game-utils/life-tracker"}>
                                <HeartIcon />
                                {t("button.life-counter")}
                            </Button>
                        </>
                    ) : (
                        <>
                            <PrimaryButton href={"/decks"}>
                                {t("button.to-decks")}
                                <ArrowRightIcon />
                            </PrimaryButton>
                            {/* Straight to the table counter, on the same row as
                                the two big ways in: at a table it is wanted in
                                one tap, and every other route to it goes through
                                the tool launcher first. */}
                            <Button plain href={"/game-utils/life-tracker"}>
                                <HeartIcon />
                                {t("button.life-counter")}
                            </Button>
                        </>
                    )}
                </div>
            </header>

            {personal !== null && (
                <div
                    className={
                        "grid grid-cols-2 gap-px overflow-hidden rounded-(--radius-card) bg-zinc-950/5 ring-1 ring-zinc-950/5 sm:grid-cols-4 dark:bg-white/10 dark:ring-white/10"
                    }
                >
                    <HomeStat
                        to={"/decks"}
                        icon={<RectangleStackIcon />}
                        label={t("label.your-decks")}
                        value={personal.decks.length}
                    />
                    <HomeStat
                        to={"/collections"}
                        icon={<ArchiveBoxIcon />}
                        label={t("label.your-cards")}
                        value={cards}
                    />
                    <HomeStat
                        to={"/collections"}
                        icon={<SparklesIcon />}
                        label={t("label.your-value")}
                        value={formatCurrency(value / 100)}
                    />
                    <HomeStat
                        to={"/watch-lists"}
                        icon={<BellAlertIcon />}
                        label={t("label.your-alarms")}
                        value={personal.alarms.unread}
                        alarming={personal.alarms.unread > 0}
                    />
                </div>
            )}

            {/* The lead deck takes two thirds and the shelf the last one: an
                even split would make them a pair of equals, and only one of the
                two is the thing to carry on with. */}
            {(lead !== null || guestLead !== null || (personal !== null && personal.collections.length > 0)) && (
                <div className={"grid gap-4 lg:grid-cols-3"}>
                    <div className={"lg:col-span-2"}>
                        {lead !== null ? (
                            <DeckSpotlight
                                to={"/decks/$deckUuid/cards"}
                                deckUuid={lead.deck.uuid}
                                eyebrow={
                                    progress(lead, formats) < 1 ? t("label.keep-building") : t("label.newest-deck")
                                }
                                name={lead.deck.name}
                                format={labels.format(lead.deck.format)}
                                commanders={lead.commanders}
                                colors={
                                    lead.deck.allowed_color_identity != null
                                        ? letters(lead.deck.allowed_color_identity)
                                        : letters(lead.commanders.map((commander) => commander.color_identity).join(""))
                                }
                                cards={lead.cards}
                                bracket={lead.deck.bracket}
                                target={targetOf(lead, formats)}
                                priceCents={lead.price_eur_cents}
                                action={t("button.open-deck")}
                            />
                        ) : guestLead !== null ? (
                            <DeckSpotlight
                                to={"/global/decks/$deckUuid/cards"}
                                deckUuid={guestLead.uuid}
                                eyebrow={t("label.newly-published")}
                                name={guestLead.name}
                                format={labels.format(guestLead.format)}
                                commanders={guestLead.commanders}
                                colors={
                                    guestLead.allowed_color_identity != null
                                        ? letters(guestLead.allowed_color_identity)
                                        : letters(
                                              guestLead.commanders
                                                  .map((commander) => commander.color_identity)
                                                  .join(""),
                                          )
                                }
                                cards={guestLead.cards}
                                bracket={guestLead.bracket}
                                priceCents={guestLead.price_eur_cents}
                                owner={guestLead.owner}
                                action={t("button.open-deck")}
                            />
                        ) : (
                            <div
                                className={
                                    "flex h-full flex-col items-start justify-center gap-3 rounded-(--radius-card) bg-(--surface-card) p-6 shadow-(--shadow-card-sm) ring-1 ring-zinc-950/5 dark:ring-white/10"
                                }
                            >
                                <Subheading>{t("heading.no-decks")}</Subheading>
                                <Text>{t("description.no-decks")}</Text>
                                <PrimaryButton href={"/decks"}>{t("button.first-deck")}</PrimaryButton>
                            </div>
                        )}
                    </div>

                    {personal !== null && personal.collections.length > 0 && (
                        <CollectionPulse collections={personal.collections} />
                    )}
                </div>
            )}

            {alarms.length > 0 && (
                <section
                    className={
                        "flex flex-col gap-3 rounded-(--radius-card) bg-(--color-warning)/10 p-5 ring-1 ring-(--color-warning)/25"
                    }
                >
                    <div className={"flex flex-wrap items-center justify-between gap-2"}>
                        <h2 className={"flex items-center gap-2 text-sm/6 font-medium text-zinc-950 dark:text-white"}>
                            <BellAlertIcon className={"size-4 text-(--color-warning)"} />
                            {t("heading.alarms")}
                        </h2>
                        <Link
                            to={"/watch-lists"}
                            className={
                                "inline-flex items-center gap-1 text-sm font-medium text-(--color-accent) hover:underline"
                            }
                        >
                            {t("button.all-alarms")}
                            <ArrowRightIcon className={"size-4"} />
                        </Link>
                    </div>
                    <ul className={"flex flex-col gap-1"}>
                        {alarms.slice(0, ALARM_ROWS).map((alarm) => (
                            <li key={alarm.entry}>
                                <Link
                                    to={"/watch-lists/$watchListUuid"}
                                    params={{ watchListUuid: alarm.watch_list }}
                                    className={"flex items-center gap-3 py-1 text-sm hover:underline"}
                                >
                                    <span className={"min-w-0 flex-1 truncate text-zinc-950 dark:text-white"}>
                                        {alarm.name}
                                    </span>
                                    <span className={"shrink-0 text-xs text-zinc-500 dark:text-zinc-400"}>
                                        {alarm.watch_list_name}
                                    </span>
                                    {alarm.triggered_price_cents != null && (
                                        <span className={"shrink-0 font-medium text-(--color-warning) tabular-nums"}>
                                            {formatCurrency(alarm.triggered_price_cents / 100)}
                                        </span>
                                    )}
                                </Link>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            {rest.length > 0 && (
                <section className={"flex flex-col gap-4"}>
                    <div className={"flex flex-wrap items-end justify-between gap-2"}>
                        <Subheading>{t("heading.your-decks")}</Subheading>
                        <Link
                            to={"/decks"}
                            className={
                                "inline-flex items-center gap-1 text-sm font-medium text-(--color-accent) hover:underline"
                            }
                        >
                            {t("button.all-decks")}
                            <ArrowRightIcon className={"size-4"} />
                        </Link>
                    </div>
                    <ul
                        className={
                            "flex flex-col gap-px overflow-hidden rounded-(--radius-card) bg-zinc-950/5 ring-1 ring-zinc-950/5 dark:bg-white/10 dark:ring-white/10"
                        }
                    >
                        {rest.map((overview) => {
                            const art =
                                overview.commanders[0]?.image_normal ?? overview.commanders[0]?.image_small ?? null;
                            return (
                                <li key={overview.deck.uuid} className={"bg-(--surface-card)"}>
                                    <Link
                                        to={"/decks/$deckUuid/cards"}
                                        params={{ deckUuid: overview.deck.uuid }}
                                        className={
                                            "flex items-center gap-4 p-3 transition hover:bg-(--color-brand-500)/5"
                                        }
                                    >
                                        <span
                                            className={
                                                "size-12 shrink-0 overflow-hidden rounded-lg bg-zinc-200 dark:bg-zinc-700"
                                            }
                                        >
                                            {art !== null && (
                                                <img
                                                    src={art}
                                                    crossOrigin={"anonymous"}
                                                    alt={""}
                                                    loading={"lazy"}
                                                    className={"size-full object-cover object-[center_18%]"}
                                                />
                                            )}
                                        </span>
                                        <span className={"flex min-w-0 flex-1 flex-col"}>
                                            <span className={"truncate font-medium text-zinc-950 dark:text-white"}>
                                                {overview.deck.name}
                                            </span>
                                            <span className={"truncate text-xs text-zinc-500 dark:text-zinc-400"}>
                                                {labels.format(overview.deck.format)}
                                                {overview.commanders.length > 0 &&
                                                    ` · ${overview.commanders
                                                        .map((commander) => commander.name)
                                                        .join(" & ")}`}
                                            </span>
                                        </span>
                                        <span
                                            className={"shrink-0 text-sm text-zinc-500 tabular-nums dark:text-zinc-400"}
                                        >
                                            {tc("label.total-cards")}: {overview.cards}
                                        </span>
                                        <ChevronRightIcon className={"size-4 shrink-0 text-zinc-400"} />
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                </section>
            )}

            <section className={"flex flex-col gap-4"}>
                <div className={"flex flex-col gap-1"}>
                    <Subheading>
                        {personal === null ? t("heading.what-it-does") : t("heading.quick-actions")}
                    </Subheading>
                    {personal === null && <Text>{t("description.what-it-does")}</Text>}
                </div>
                {personal === null ? (
                    <div className={"grid gap-3 sm:grid-cols-2 lg:grid-cols-3"}>
                        <GameToolCard
                            to={"/global/decks"}
                            icon={RectangleStackIcon}
                            title={t("heading.feature-decks")}
                            description={t("description.feature-decks")}
                        />
                        <GameToolCard
                            to={"/auth/signup"}
                            icon={ArchiveBoxIcon}
                            title={t("heading.feature-collection")}
                            description={t("description.feature-collection")}
                        />
                        <GameToolCard
                            to={"/auth/signup"}
                            icon={QueueListIcon}
                            title={t("heading.feature-watch")}
                            description={t("description.feature-watch")}
                        />
                        <GameToolCard
                            to={"/game-utils"}
                            icon={HeartIcon}
                            title={t("heading.feature-table")}
                            description={t("description.feature-table")}
                        />
                        <GameToolCard
                            to={"/global/decks"}
                            icon={GlobeAltIcon}
                            title={t("heading.feature-community")}
                            description={t("description.feature-community")}
                        />
                    </div>
                ) : (
                    <div className={"grid gap-3 sm:grid-cols-2 lg:grid-cols-4"}>
                        <GameToolCard
                            to={"/decks"}
                            icon={RectangleStackIcon}
                            title={t("heading.action-build")}
                            description={t("description.action-build")}
                        />
                        <GameToolCard
                            to={"/collections"}
                            icon={ArchiveBoxIcon}
                            title={t("heading.action-file")}
                            description={t("description.action-file")}
                        />
                        <GameToolCard
                            to={"/watch-lists"}
                            icon={QueueListIcon}
                            title={t("heading.action-watch")}
                            description={t("description.action-watch")}
                        />
                        <GameToolCard
                            to={"/game-utils/life-tracker"}
                            icon={HeartIcon}
                            title={t("heading.action-life")}
                            description={t("description.action-life")}
                        />
                    </div>
                )}
            </section>

            {fresh.length > 0 && (
                <section className={"flex flex-col gap-4"}>
                    <div className={"flex flex-wrap items-end justify-between gap-2"}>
                        <div className={"flex flex-col gap-1"}>
                            <Subheading>{t("heading.fresh")}</Subheading>
                            <Text>{t("description.fresh")}</Text>
                        </div>
                        <Link
                            to={"/global/decks"}
                            className={
                                "inline-flex items-center gap-1 text-sm font-medium text-(--color-accent) hover:underline"
                            }
                        >
                            {t("button.browse-decks")}
                            <ArrowRightIcon className={"size-4"} />
                        </Link>
                    </div>
                    <ul className={"grid gap-4 sm:grid-cols-2 xl:grid-cols-4"}>
                        {fresh.map((deck) => (
                            <PublicDeckTile key={deck.uuid} deck={deck} />
                        ))}
                    </ul>
                </section>
            )}
        </div>
    );
}
