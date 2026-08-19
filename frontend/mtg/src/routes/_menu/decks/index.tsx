import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { MagnifyingGlassIcon, RectangleStackIcon } from "@heroicons/react/20/solid";
import {
    Alert,
    AlertActions,
    AlertDescription,
    AlertTitle,
    Button,
    EmptyState,
    Heading,
    Input,
    InputGroup,
    PrimaryButton,
    Text,
    notify,
} from "components";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import type { DeckOverviewResponse, FormatRulesResponse, Visibility } from "src/api/generated";
import { DeckDialog } from "src/components/deck-dialog";
import { useDeckLabels } from "src/components/deck-labels";
import { DeckTile } from "src/components/deck-tile";
import { RequireAccount } from "src/components/require-account";
import { ShareDialog } from "src/components/share-dialog";
import { formatCurrency } from "src/utils/format";
import { deckShareTarget } from "src/utils/share-targets";
import { useShortcuts } from "src/utils/use-shortcuts";
import { useShortcutHelpOpen } from "src/context/shortcut-help-context";

export const Route = createFileRoute("/_menu/decks/")({
    loader: async () => {
        const [decks, offered] = await Promise.all([Api.decks.list(), Api.decks.formats()]);
        return { decks, formats: offered.formats };
    },
    component: RouteComponent,
});

/**
 * The account's decks, by the face at the head of each.
 *
 * Sorted into the formats they are built for rather than left in one list: a
 * Commander deck and a Modern deck are not compared to each other, and the
 * heading answers "which of these can I bring tonight" before a single name is
 * read.
 *
 * @returns the page
 */
function RouteComponent() {
    const [t] = useTranslation("deck");
    const [tg] = useTranslation();
    const { decks, formats } = Route.useLoaderData();
    const router = useRouter();
    const navigate = useNavigate();
    const labels = useDeckLabels();
    const shortcutHelpOpen = useShortcutHelpOpen();

    const [dialog, setDialog] = useState<{ deck: DeckOverviewResponse | null } | null>(null);
    const [sharing, setSharing] = useState<DeckOverviewResponse | null>(null);
    const [confirming, setConfirming] = useState<DeckOverviewResponse | null>(null);
    const [selected, setSelected] = useState<string | null>(null);
    const [query, setQuery] = useState("");
    const field = useRef<HTMLInputElement>(null);

    const matching = filtered(decks, query);
    const groups = byFormat(matching, formats);
    const selectedDeck = matching.find((overview) => overview.deck.uuid === selected) ?? null;
    const cards = decks.reduce((sum, overview) => sum + overview.cards, 0);
    const value = decks.reduce((sum, overview) => sum + overview.price_eur_cents, 0);

    useShortcuts(
        {
            "mod+f": () => {
                field.current?.focus();
                field.current?.select();
            },
            a: () => setDialog({ deck: null }),
            e: () => {
                if (selectedDeck !== null) setDialog({ deck: selectedDeck });
            },
            s: () => {
                if (selectedDeck !== null) setSharing(selectedDeck);
            },
            delete: () => {
                if (selectedDeck !== null) setConfirming(selectedDeck);
            },
        },
        dialog === null && sharing === null && confirming === null && !shortcutHelpOpen,
    );

    /**
     * Re-runs the loader after a write
     *
     * @returns a promise resolving once the loader has finished
     */
    const refresh = () => router.invalidate();

    /**
     * Writes a deck's visibility straight from its menu
     *
     * @param overview the deck to change
     * @param visibility the visibility to switch to
     */
    async function changeVisibility(overview: DeckOverviewResponse, visibility: Visibility) {
        if (overview.deck.visibility === visibility) return;
        await Api.decks.setVisibility(overview.deck.uuid, visibility);
        notify.success(t("toast.visibility-changed"));
        await refresh();
    }

    /**
     * Deletes a deck after the confirmation was accepted
     *
     * @param overview the deck to delete
     */
    async function remove(overview: DeckOverviewResponse) {
        setConfirming(null);
        await Api.decks.delete(overview.deck.uuid);
        notify.success(t("toast.deck-deleted"));
        await refresh();
    }

    return (
        <RequireAccount>
            <div className={"flex flex-col gap-6"}>
                <div className={"flex flex-wrap items-start justify-between gap-3"}>
                    <div className={"flex flex-col gap-2"}>
                        <Heading>{t("heading.decks")}</Heading>
                        {decks.length === 0 ? (
                            <Text>{t("description.decks")}</Text>
                        ) : (
                            <Text className={"flex flex-wrap items-center gap-x-2 gap-y-1"}>
                                <span>{t("label.deck-count", { count: decks.length })}</span>
                                <span aria-hidden={true}>·</span>
                                <span className={"tabular-nums"}>{t("label.deck-size", { cards })}</span>
                                {value > 0 && (
                                    <>
                                        <span aria-hidden={true}>·</span>
                                        <span className={"tabular-nums"}>{formatCurrency(value / 100)}</span>
                                    </>
                                )}
                            </Text>
                        )}
                    </div>
                    <PrimaryButton onClick={() => setDialog({ deck: null })}>{t("button.create-deck")}</PrimaryButton>
                </div>

                {decks.length > 0 && (
                    <div className={"max-w-sm"}>
                        <InputGroup>
                            <MagnifyingGlassIcon />
                            <Input
                                ref={field}
                                value={query}
                                aria-label={t("label.search-decks")}
                                placeholder={t("label.search-decks")}
                                onChange={(event) => setQuery(event.target.value)}
                                onKeyDown={(event) => {
                                    if (event.key === "Escape") setQuery("");
                                }}
                            />
                        </InputGroup>
                    </div>
                )}

                {decks.length === 0 ? (
                    <EmptyState
                        icon={<RectangleStackIcon />}
                        title={t("heading.no-decks")}
                        description={t("description.no-decks")}
                    />
                ) : matching.length === 0 ? (
                    <EmptyState
                        icon={<MagnifyingGlassIcon />}
                        title={t("heading.no-decks-found")}
                        description={t("description.no-decks-found")}
                    />
                ) : (
                    groups.map((group) => (
                        <section key={group.format} className={"flex flex-col gap-3"}>
                            <div className={"flex items-center gap-3"}>
                                <h2 className={"text-sm/6 font-semibold text-zinc-950 dark:text-white"}>
                                    {labels.format(group.format)}
                                </h2>
                                <span
                                    className={
                                        "rounded-(--radius-pill) bg-zinc-950/5 px-2 py-0.5 text-xs font-medium text-zinc-600 tabular-nums dark:bg-white/10 dark:text-zinc-300"
                                    }
                                >
                                    {group.decks.length}
                                </span>
                                <span className={"h-px flex-1 bg-zinc-950/5 dark:bg-white/10"} />
                            </div>

                            <ul className={"grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"}>
                                {group.decks.map((overview) => (
                                    <DeckTile
                                        key={overview.deck.uuid}
                                        overview={overview}
                                        rules={formats.find((rules) => rules.slug === overview.deck.format)}
                                        onChangeVisibility={(deck, visibility) =>
                                            void changeVisibility(deck, visibility)
                                        }
                                        onShare={setSharing}
                                        onEdit={(deck) => setDialog({ deck })}
                                        onDelete={setConfirming}
                                        selected={selected === overview.deck.uuid}
                                        onActivate={() => setSelected(overview.deck.uuid)}
                                    />
                                ))}
                            </ul>
                        </section>
                    ))
                )}

                <DeckDialog
                    open={dialog !== null}
                    deck={dialog?.deck?.deck ?? null}
                    formats={formats}
                    onClose={() => setDialog(null)}
                    onSaved={(created) => {
                        setDialog(null);
                        notify.success(created !== null ? t("toast.deck-created") : t("toast.deck-updated"));
                        if (created !== null) {
                            void navigate({ to: "/decks/$deckUuid/cards", params: { deckUuid: created.uuid } });
                            return;
                        }
                        void refresh();
                    }}
                />

                <ShareDialog
                    target={sharing === null ? null : deckShareTarget(sharing.deck)}
                    description={t("description.share-link")}
                    onClose={() => setSharing(null)}
                    onChanged={refresh}
                />

                <Alert open={confirming !== null} onClose={() => setConfirming(null)}>
                    <AlertTitle>{t("heading.delete-deck")}</AlertTitle>
                    <AlertDescription>
                        {t("description.delete-deck", { name: confirming?.deck.name ?? "" })}
                    </AlertDescription>
                    <AlertActions>
                        <Button plain onClick={() => setConfirming(null)}>
                            {tg("button.cancel")}
                        </Button>
                        <Button color={"red"} onClick={() => void (confirming && remove(confirming))}>
                            {t("button.delete-deck")}
                        </Button>
                    </AlertActions>
                </Alert>
            </div>
        </RequireAccount>
    );
}

/**
 * The decks whose name or commander answers to what was typed
 *
 * @param decks every deck
 * @param query what was typed
 *
 * @returns the ones that match, all of them for an empty field
 */
function filtered(decks: Array<DeckOverviewResponse>, query: string): Array<DeckOverviewResponse> {
    const wanted = query.trim().toLowerCase();
    if (wanted === "") return decks;

    return decks.filter(
        (overview) =>
            overview.deck.name.toLowerCase().includes(wanted) ||
            overview.commanders.some((commander) => commander.name.toLowerCase().includes(wanted)),
    );
}

/**
 * The decks sorted into the formats they are built for
 *
 * The formats keep the order the service offers them in, which puts Commander
 * first; a deck built for a format the service no longer knows lands at the end
 * under its own slug rather than disappearing.
 *
 * @param decks the decks to sort
 * @param formats the formats the service offers
 *
 * @returns one group per format that holds decks
 */
function byFormat(
    decks: Array<DeckOverviewResponse>,
    formats: Array<FormatRulesResponse>,
): Array<{ format: string; decks: Array<DeckOverviewResponse> }> {
    const groups = new Map<string, Array<DeckOverviewResponse>>();
    for (const overview of decks) {
        const group = groups.get(overview.deck.format);
        if (group === undefined) groups.set(overview.deck.format, [overview]);
        else group.push(overview);
    }

    const order = formats.map((rules) => rules.slug);
    return Array.from(groups, ([format, inGroup]) => ({ format, decks: inGroup })).sort((left, right) => {
        const ranked = rank(order, left.format) - rank(order, right.format);
        return ranked === 0 ? left.format.localeCompare(right.format) : ranked;
    });
}

/**
 * Where a format sits in the offered order
 *
 * @param order the offered formats
 * @param format the format
 *
 * @returns its position, anything unknown at the end
 */
function rank(order: Array<string>, format: string): number {
    const index = order.indexOf(format);
    return index === -1 ? order.length : index;
}
