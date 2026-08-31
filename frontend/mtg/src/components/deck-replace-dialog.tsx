import { Button, Dialog, DialogActions, DialogBody, DialogTitle, Text, notify } from "components";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { GraphApi } from "src/api/graph";
import { Replacement, ReplaceResponse } from "src/api/graph-generated";
import { DeckCardResponse } from "src/api/generated";
import { CardDetailDialog } from "src/components/card-detail-dialog";
import { DeckAdvisorAddRow } from "src/components/deck-advisor-add-row";
import { DeckAdvisorNotes } from "src/components/deck-advisor-notes";
import { InlineError } from "src/components/inline-error";
import { AdvisorDeck } from "src/utils/deck-advisor";
import { Printing } from "src/utils/scryfall";
import { useAdvisorSettings } from "src/utils/use-advisor-settings";
import { useSuggestionCards } from "src/utils/use-suggestion-cards";

/**
 * The properties for {@link DeckReplaceDialog}
 */
export type DeckReplaceDialogProps = {
    /** The slot alternatives are asked for, `null` while the dialog is away */
    card: DeckCardResponse | null;
    /** Puts the dialog away */
    onClose: () => void;
    /** The deck the slot belongs to */
    deckUuid: string;
    /** The advisor's projection of the deck */
    deck: AdvisorDeck;
    /** The speed the alternatives are ranked at, 0 to 1 */
    speed: number;
    /** Called after a replacement landed in the deck */
    onReplaced: () => void;
};

/** What the dialog knows right now */
type ReplaceState = { state: "asking" } | { state: "ready"; response: ReplaceResponse } | { state: "failed" };

/**
 * Alternatives to one card, a swap away.
 *
 * The graph runs its channels against the deck minus the marked card, so the
 * card's own replacements become reachable. Replacing files the alternative
 * into the slot's zone and takes one copy of the original out — the deck
 * never holds both halves of a swap by accident.
 *
 * Every offer is drawn by the advisor's own {@link DeckAdvisorAddRow}, the
 * same row the exchange list puts opposite a card it would let go: an offer
 * is an offer wherever it is made, and one surface is one thing to maintain.
 *
 * @returns the dialog
 */
export function DeckReplaceDialog({ card, onClose, deckUuid, deck, speed, onReplaced }: DeckReplaceDialogProps) {
    const [t] = useTranslation("advisor");
    const { settings, ready, save } = useAdvisorSettings(deckUuid);
    const excluded = useMemo(() => settings.ignored.map((held) => held.oracle_id), [settings.ignored]);
    const [asked, setAsked] = useState<ReplaceState>({ state: "asking" });
    const [busy, setBusy] = useState(false);
    // Whichever alternative was last clicked. The artwork opens it, the same
    // way it does on the exchange list — a card being offered is a card
    // somebody may want to read before taking it.
    const [opened, setOpened] = useState<Printing | null>(null);
    // Cards ruled out from in here. The request that would drop them is not
    // worth re-running for a row the reader has already dismissed, so they go
    // off screen at once and stay out of the next one through the ignore list.
    const [hidden, setHidden] = useState<Array<string>>([]);

    const target = card?.card?.oracle_id ?? null;
    const replacements = asked.state === "ready" ? asked.response.replacements : [];
    // Every offer, not just the shown ones: ignoring one must not re-key the
    // lookup and blank the artwork of the rows that stay.
    const names = useMemo(() => replacements.map((row) => row.name), [replacements]);
    const { cards: printings, state: printingsState, retry: retryPrintings } = useSuggestionCards(names);
    const shown = replacements.filter((row) => !hidden.includes(row.oracle_id));

    useEffect(() => {
        // Waits on `ready` like every other graph query fed from the
        // settings: firing against the defaults while the real answer is
        // still in flight would ask the graph twice, the first time wrong.
        if (card === null || target === null || !ready) return;
        setAsked({ state: "asking" });
        setHidden([]);
        let cancelled = false;
        const abort = new AbortController();
        GraphApi.replace(
            {
                cards: deck.entries,
                target_oracle_id: target,
                commander_oracle_id: deck.commander,
                commander_oracle_ids: deck.commanders,
                identity: deck.identity ?? undefined,
                // The size the ranking's quotas are scaled to.
                deck_size: deck.deckSize ?? undefined,
                speed,
                excluded,
                pinned_themes: settings.themes.pinned,
                excluded_themes: settings.themes.excluded,
                // An alternative from outside the pool the user declared is
                // one they cannot take.
                pool_query: settings.pool_query ?? undefined,
            },
            { signal: abort.signal },
        )
            .then((response) => {
                if (!cancelled) setAsked({ state: "ready", response });
            })
            .catch(() => {
                if (!cancelled) setAsked({ state: "failed" });
            });
        return () => {
            cancelled = true;
            abort.abort();
        };
        // Asked once per opened slot; everything else is fixed while open.
    }, [target, card === null, ready]);

    /**
     * Lets an ignored alternative back in
     *
     * @param replacement the card to allow again
     */
    function unignore(replacement: Replacement) {
        save({ ...settings, ignored: settings.ignored.filter((held) => held.oracle_id !== replacement.oracle_id) });
        setHidden((ids) => ids.filter((id) => id !== replacement.oracle_id));
    }

    /**
     * Rules an alternative out for good — the advisor never offers it again.
     *
     * Written through the shared settings query rather than held here: the
     * list belongs to the deck and this dialog is a visitor, so the page
     * underneath and the advisor both read the change without being told
     * about it.
     *
     * @param replacement the turned-down card
     */
    function ignore(replacement: Replacement) {
        if (!settings.ignored.some((entry) => entry.oracle_id === replacement.oracle_id)) {
            save({
                ...settings,
                ignored: [...settings.ignored, { oracle_id: replacement.oracle_id, name: replacement.name }],
            });
        }
        setHidden((ids) => [...ids, replacement.oracle_id]);
        // Said and undoable, exactly as on the adds list: without this a
        // misclick suppresses a card for good with no account of why.
        notify.success(t("toast.card-ignored", { name: replacement.name }), {
            onClick: () => unignore(replacement),
        });
    }

    /**
     * Swaps the marked slot for one alternative
     *
     * @param name the alternative's name, resolved to the printing it files
     */
    async function replace(name: string) {
        const printing = printings.get(name);
        if (card === null || printing === undefined) return;
        setBusy(true);
        try {
            await Api.decks.cards.add(deckUuid, { printing: printing.id, quantity: 1, zone: card.zone });
            if (card.quantity > 1) {
                await Api.decks.cards.update(deckUuid, card.uuid, { quantity: card.quantity - 1 });
            } else {
                await Api.decks.cards.delete(deckUuid, card.uuid);
            }
            notify.success(t("toast.card-replaced", { name: card.card?.name ?? "", replacement: name }));
            onReplaced();
            onClose();
        } finally {
            setBusy(false);
        }
    }

    return (
        <Dialog open={card !== null} onClose={onClose} size={"xl"}>
            <DialogTitle>{t("heading.replace", { name: card?.card?.name ?? "" })}</DialogTitle>
            <DialogBody>
                {asked.state === "asking" && <Text className={"py-8 text-center"}>{t("label.analyzing")}</Text>}
                {asked.state === "failed" && <Text>{t("description.advisor-unavailable")}</Text>}
                {asked.state === "ready" && shown.length === 0 && (
                    <div className={"flex flex-col gap-2"}>
                        <Text>{t("description.replace-none")}</Text>
                        <DeckAdvisorNotes notes={asked.response.notes} />
                    </div>
                )}
                {asked.state === "ready" && shown.length > 0 && (
                    <div className={"flex flex-col"}>
                        <Text>{t("description.replace")}</Text>
                        <DeckAdvisorNotes notes={asked.response.notes} />
                        {/* Once, not per row: a failed lookup grays out every
                            row's swap button below. */}
                        {printingsState === "error" && (
                            <div className={"mt-2 flex items-center justify-between gap-3"}>
                                <InlineError>{t("label.card-lookup-failed")}</InlineError>
                                <Button plain onClick={retryPrintings}>
                                    {t("button.retry")}
                                </Button>
                            </div>
                        )}
                        <div
                            className={"mt-2 max-h-96 divide-y divide-zinc-950/5 overflow-y-auto dark:divide-white/10"}
                        >
                            {shown.map((row) => (
                                <DeckAdvisorAddRow
                                    key={row.oracle_id}
                                    name={row.name}
                                    replaces={card?.card?.name ?? ""}
                                    printing={printings.get(row.name)}
                                    sharedRoles={row.shared_roles}
                                    onOpen={setOpened}
                                    onIgnore={() => ignore(row)}
                                    onSwap={() => void replace(row.name)}
                                    busy={busy}
                                />
                            ))}
                        </div>
                    </div>
                )}
            </DialogBody>
            <DialogActions>
                <Button plain onClick={onClose}>
                    {t("button.fill-cancel")}
                </Button>
            </DialogActions>

            {/* Inside the dialog, not beside it: nested this way the card
                closes back to the alternatives instead of taking them with it. */}
            <CardDetailDialog printing={opened} onClose={() => setOpened(null)} />
        </Dialog>
    );
}
