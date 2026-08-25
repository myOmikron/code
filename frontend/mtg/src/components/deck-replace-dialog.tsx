import { Badge, Button, Dialog, DialogActions, DialogBody, DialogTitle, Text, notify } from "components";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { GraphApi } from "src/api/graph";
import { ReplaceResponse } from "src/api/graph-generated";
import { DeckCardResponse } from "src/api/generated";
import { DeckAdvisorNotes } from "src/components/deck-advisor-notes";
import { InlineError } from "src/components/inline-error";
import { ManaCost } from "src/components/mana-cost";
import { AdvisorDeck } from "src/utils/deck-advisor";
import { readPoolQuery } from "src/utils/deck-pool";
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
    /** Oracle ids the deck's ignore list rules out */
    excluded: Array<string>;
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
 * @returns the dialog
 */
export function DeckReplaceDialog({
    card,
    onClose,
    deckUuid,
    deck,
    speed,
    excluded,
    onReplaced,
}: DeckReplaceDialogProps) {
    const [t] = useTranslation("advisor");
    const [asked, setAsked] = useState<ReplaceState>({ state: "asking" });
    const [busy, setBusy] = useState(false);

    const target = card?.card?.oracle_id ?? null;
    const replacements = asked.state === "ready" ? asked.response.replacements : [];
    const names = useMemo(() => replacements.map((row) => row.name), [replacements]);
    const { cards: printings, state: printingsState, retry: retryPrintings } = useSuggestionCards(names);

    useEffect(() => {
        if (card === null || target === null) return;
        setAsked({ state: "asking" });
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
                // Read here rather than passed down: the restriction belongs to
                // the deck, and this dialog opens from the cards page, which
                // has no advisor state of its own. An alternative from outside
                // the pool the user declared is one they cannot take.
                pool_query: readPoolQuery(deckUuid) ?? undefined,
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
    }, [target, card === null]);

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
        <Dialog open={card !== null} onClose={onClose}>
            <DialogTitle>{t("heading.replace", { name: card?.card?.name ?? "" })}</DialogTitle>
            <DialogBody>
                {asked.state === "asking" && <Text className={"py-8 text-center"}>{t("label.analyzing")}</Text>}
                {asked.state === "failed" && <Text>{t("description.advisor-unavailable")}</Text>}
                {asked.state === "ready" && replacements.length === 0 && (
                    <div className={"flex flex-col gap-2"}>
                        <Text>{t("description.replace-none")}</Text>
                        <DeckAdvisorNotes notes={asked.response.notes} />
                    </div>
                )}
                {asked.state === "ready" && replacements.length > 0 && (
                    <div className={"flex flex-col"}>
                        <Text>{t("description.replace")}</Text>
                        <DeckAdvisorNotes notes={asked.response.notes} />
                        {/* Once, not per row: a failed lookup grays out every
                            row's Replace button below. */}
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
                            {replacements.map((row) => {
                                const printing = printings.get(row.name);
                                return (
                                    <div key={row.oracle_id} className={"flex items-center gap-3 py-2"}>
                                        <div className={"min-w-0 flex-1"}>
                                            <span
                                                className={
                                                    "flex items-center gap-2 text-sm font-medium text-zinc-950 dark:text-white"
                                                }
                                            >
                                                <span className={"truncate"}>{row.name}</span>
                                                {printing !== undefined && printing.manaCost !== "" && (
                                                    <ManaCost value={printing.manaCost} className={"text-xs"} />
                                                )}
                                            </span>
                                            {row.type_line !== undefined && (
                                                <span
                                                    className={
                                                        "block truncate text-xs text-zinc-500 dark:text-zinc-400"
                                                    }
                                                >
                                                    {row.type_line}
                                                </span>
                                            )}
                                            {row.shared_roles !== undefined && row.shared_roles.length > 0 && (
                                                <span className={"mt-1 flex flex-wrap gap-1"}>
                                                    {row.shared_roles.map((role) => (
                                                        <Badge key={role} color={"zinc"}>
                                                            {role.replace(/_/g, " ")}
                                                        </Badge>
                                                    ))}
                                                </span>
                                            )}
                                        </div>
                                        <Button
                                            plain={true}
                                            disabled={busy || printing === undefined}
                                            onClick={() => void replace(row.name)}
                                        >
                                            {t("button.replace-accept")}
                                        </Button>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </DialogBody>
            <DialogActions>
                <Button plain onClick={onClose}>
                    {t("button.fill-cancel")}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
