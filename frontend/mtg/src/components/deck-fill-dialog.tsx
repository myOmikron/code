import { XMarkIcon } from "@heroicons/react/20/solid";
import { Button, Dialog, DialogActions, DialogBody, DialogTitle, Text, notify } from "components";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { GraphApi } from "src/api/graph";
import { FillResult } from "src/api/graph-generated";
import { ManaCost } from "src/components/mana-cost";
import { AdvisorDeck } from "src/utils/deck-advisor";
import { useSuggestionCards } from "src/utils/use-suggestion-cards";

/**
 * The properties for {@link DeckFillDialog}
 */
export type DeckFillDialogProps = {
    /** Whether the dialog is on screen */
    open: boolean;
    /** Puts the dialog away */
    onClose: () => void;
    /** The deck being filled */
    deckUuid: string;
    /** The advisor's projection of the deck */
    deck: AdvisorDeck;
    /** The speed the fill is solved at, 0 to 1 */
    speed: number;
    /** Oracle ids the deck's ignore list rules out */
    excluded: Array<string>;
    /** Called after the fill landed in the deck */
    onFilled: () => void;
};

/** What the dialog knows right now */
type FillState =
    | { state: "solving" }
    | { state: "ready"; result: FillResult }
    | { state: "busy" }
    | { state: "failed" };

/**
 * Fills the last open slots of the deck with the CP-SAT solver.
 *
 * The solve runs against the current deck, speed and ignore list. Every
 * proposed card can be turned down — the solver then runs again with it
 * rejected, which is how "not that one" works without discarding the rest.
 * Accepting files everything in one transaction, so the fill either lands
 * whole or not at all.
 *
 * @returns the dialog
 */
export function DeckFillDialog({ open, onClose, deckUuid, deck, speed, excluded, onFilled }: DeckFillDialogProps) {
    const [t] = useTranslation("advisor");
    const [fill, setFill] = useState<FillState>({ state: "solving" });
    // Turned down inside this dialog only — the permanent list is `excluded`.
    const [rejected, setRejected] = useState<Array<string>>([]);
    const [accepting, setAccepting] = useState(false);

    const chosen = fill.state === "ready" ? (fill.result.chosen ?? []) : [];
    const names = useMemo(() => chosen.map((card) => card.name), [chosen]);
    const cards = useSuggestionCards(names);

    useEffect(() => {
        if (!open) return;
        setFill({ state: "solving" });
        let cancelled = false;
        GraphApi.fill({
            cards: deck.entries,
            commander_oracle_id: deck.commander,
            speed,
            rejected: [...excluded, ...rejected],
        })
            .then((result) => {
                if (!cancelled) setFill({ state: "ready", result });
            })
            .catch((error: unknown) => {
                if (cancelled) return;
                const status =
                    typeof error === "object" && error !== null && "response" in error
                        ? (error as { response: Response }).response.status
                        : null;
                setFill({ state: status === 429 ? "busy" : "failed" });
            });
        return () => {
            cancelled = true;
        };
        // Re-solved when the dialog opens and when a card is turned down; the
        // ignore list cannot change while the dialog is on screen.
    }, [open, deckUuid, rejected.length]);

    /**
     * Files every proposed card into the mainboard, in one transaction
     */
    async function accept() {
        const printings = chosen
            .map((card) => cards.get(card.name))
            .filter((printing): printing is NonNullable<typeof printing> => printing !== undefined);
        if (printings.length === 0) return;
        setAccepting(true);
        try {
            await Api.decks.cards.import(deckUuid, {
                cards: printings.map((printing) => ({ printing: printing.id, quantity: 1, zone: "Main" })),
                replace: false,
            });
            notify.success(t("toast.cards-filled", { amount: printings.length }));
            onFilled();
            onClose();
        } finally {
            setAccepting(false);
        }
    }

    return (
        <Dialog open={open} onClose={onClose}>
            <DialogTitle>{t("heading.fill")}</DialogTitle>
            <DialogBody>
                {fill.state === "solving" && <Text className={"py-8 text-center"}>{t("label.solving")}</Text>}
                {fill.state === "busy" && <Text>{t("error.fill-busy")}</Text>}
                {fill.state === "failed" && <Text>{t("error.fill-failed")}</Text>}
                {fill.state === "ready" && chosen.length === 0 && <Text>{t("description.fill-complete")}</Text>}
                {fill.state === "ready" && chosen.length > 0 && (
                    <div className={"flex flex-col"}>
                        <Text>{t("description.fill", { amount: chosen.length })}</Text>
                        <div
                            className={"mt-2 max-h-96 divide-y divide-zinc-950/5 overflow-y-auto dark:divide-white/10"}
                        >
                            {chosen.map((card) => {
                                const printing = cards.get(card.name);
                                return (
                                    <div key={card.oracle_id} className={"flex items-center gap-3 py-1.5"}>
                                        <div className={"min-w-0 flex-1"}>
                                            <span
                                                className={
                                                    "flex items-center gap-2 text-sm font-medium text-zinc-950 dark:text-white"
                                                }
                                            >
                                                <span className={"truncate"}>{card.name}</span>
                                                {printing !== undefined && printing.manaCost !== "" && (
                                                    <ManaCost value={printing.manaCost} className={"text-xs"} />
                                                )}
                                            </span>
                                            {printing !== undefined && (
                                                <span
                                                    className={
                                                        "block truncate text-xs text-zinc-500 dark:text-zinc-400"
                                                    }
                                                >
                                                    {printing.typeLine}
                                                </span>
                                            )}
                                        </div>
                                        <button
                                            type={"button"}
                                            title={t("accessibility.reject-fill", { name: card.name })}
                                            aria-label={t("accessibility.reject-fill", { name: card.name })}
                                            onClick={() => setRejected((held) => [...held, card.oracle_id])}
                                            className={
                                                "rounded p-1 text-zinc-500 transition hover:bg-zinc-950/10 dark:text-zinc-400 dark:hover:bg-white/10"
                                            }
                                        >
                                            <XMarkIcon className={"size-4"} />
                                        </button>
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
                <Button
                    disabled={fill.state !== "ready" || chosen.length === 0 || accepting}
                    onClick={() => void accept()}
                >
                    {t("button.fill-accept", { amount: chosen.length })}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
