import { CheckIcon, Squares2X2Icon, ViewColumnsIcon } from "@heroicons/react/20/solid";
import { Badge, Dialog, DialogBody, DialogTitle, ScrollFade, Strong, Text } from "components";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { DialogCloseButton } from "src/components/dialog-close-button";
import { Api } from "src/api/api";
import type { UUID } from "src/api/api";
import type { CardCondition, CardFinish } from "src/api/generated";
import { CardSearchPanel } from "src/components/card-search-panel";
import { foldPriceCents, marketPriceCents } from "src/utils/prices";
import type { Printing } from "src/utils/scryfall";

/** How many of the cards just filed are named back */
const RECENT_LIMIT = 12;

/** The shape a card is filed in unless it is edited afterwards */
const DEFAULT_CONDITION: CardCondition = "NearMint";

/** The finish a card is filed in unless it is edited afterwards */
const DEFAULT_FINISH: CardFinish = "Nonfoil";

/** What the dialog needs to know about a stack to count and change it */
type Stack = {
    /** Primary key */
    uuid: UUID;
    /** Scryfall's id of the printing */
    printing: string;
    /** How many copies the stack holds */
    quantity: number;
    /** Condition of the cards */
    condition: CardCondition;
    /** Finish of the cards */
    finish: CardFinish;
    /** What one copy cost, in euro cents, `null` when nobody wrote it down */
    purchasePriceCents: number | null;
};

/**
 * The properties for {@link AddCollectionCardsDialog}
 */
export type AddCollectionCardsDialogProps = {
    /** Whether the dialog is on screen */
    open: boolean;
    /** The collection cards are filed into */
    collectionUuid: UUID;
    /** Closes the dialog */
    onClose: () => void;
    /** Called once, after the dialog closed, when anything was filed or taken out */
    onChanged: () => void;
};

/**
 * Searching Scryfall for cards to file, with the whole window to do it in.
 *
 * Filing a collection is a long run of searches, the same as building a deck,
 * so it works the same way: the dialog stays open on a hit, counts what went
 * in and keeps a plus and a minus under every result. The counts come from the
 * collection's own stacks, read once when the dialog opens and kept in step
 * from there — the list behind the dialog only reloads once, on the way out.
 *
 * @returns the dialog
 */
export function AddCollectionCardsDialog({ open, collectionUuid, onClose, onChanged }: AddCollectionCardsDialogProps) {
    const [t] = useTranslation("collection");

    const [stacks, setStacks] = useState<Array<Stack>>([]);
    const [added, setAdded] = useState<Array<string>>([]);
    const [twoColumns, setTwoColumns] = useState(false);
    const changed = useRef(false);
    const queue = useRef<Promise<void>>(Promise.resolve());
    const known = useRef<Array<Stack>>([]);

    /**
     * Records what the collection holds now
     *
     * @param next what to make of the stacks known so far
     */
    function write(next: (current: Array<Stack>) => Array<Stack>) {
        known.current = next(known.current);
        setStacks(known.current);
    }

    useEffect(() => {
        if (!open) return;
        let dropped = false;
        void Api.collections.entries.list(collectionUuid).then((response) => {
            if (dropped) return;
            write(() =>
                response.entries.map((entry) => ({
                    uuid: entry.uuid,
                    printing: entry.printing,
                    quantity: entry.quantity,
                    condition: entry.condition,
                    finish: entry.finish,
                    purchasePriceCents: entry.purchase_price_cents ?? null,
                })),
            );
        });
        return () => {
            dropped = true;
        };
    }, [collectionUuid, open]);

    /**
     * Puts a write at the end of the queue
     *
     * @param work the write
     *
     * @returns a promise resolving once it has run
     */
    function serial(work: () => Promise<void>): Promise<void> {
        const next = queue.current.catch(() => undefined).then(work);
        queue.current = next;
        return next;
    }

    /**
     * How many copies of a printing are filed here, whatever shape they are in
     *
     * @param printing the card as the search found it
     *
     * @returns the number of copies
     */
    function copiesOf(printing: Printing): number {
        return stacks.filter((stack) => stack.printing === printing.id).reduce((sum, stack) => sum + stack.quantity, 0);
    }

    /**
     * Files one more copy of a printing
     *
     * A second copy raises the count of the stack it would join rather than
     * opening another one beside it. A shape other than the default is left
     * alone: those cards were filed deliberately, and the new copy is not
     * known to be one of them.
     *
     * The copy is recorded at today's market price, and joining a stack folds
     * that price over all of its copies — see {@link foldPriceCents}. The
     * folded price goes into the stack kept here as well, so the copy after it
     * is folded against what the stack now says rather than against what it
     * said when the dialog opened.
     *
     * @param printing the card that was picked
     */
    async function add(printing: Printing) {
        setAdded((previous) => [printing.name, ...previous]);
        await serial(async () => {
            const target = known.current.find(
                (stack) =>
                    stack.printing === printing.id &&
                    stack.condition === DEFAULT_CONDITION &&
                    stack.finish === DEFAULT_FINISH,
            );

            const paid = marketPriceCents(printing, DEFAULT_FINISH);
            if (target !== undefined) {
                const folded = foldPriceCents([
                    { priceCents: target.purchasePriceCents, quantity: target.quantity },
                    { priceCents: paid, quantity: 1 },
                ]);
                write((previous) =>
                    previous.map((stack) =>
                        stack.uuid === target.uuid
                            ? { ...stack, quantity: stack.quantity + 1, purchasePriceCents: folded }
                            : stack,
                    ),
                );
                await Api.collections.entries.update(collectionUuid, target.uuid, {
                    quantity: target.quantity + 1,
                    purchase_price_cents: folded,
                });
            } else {
                await Api.collections.entries.add(collectionUuid, [
                    {
                        printing: printing.id,
                        quantity: 1,
                        condition: DEFAULT_CONDITION,
                        finish: DEFAULT_FINISH,
                        purchase_price_cents: paid,
                        acquired_at: null,
                    },
                ]);
                const filed = await Api.collections.cards(collectionUuid, {
                    printing: printing.id,
                    condition: DEFAULT_CONDITION,
                    finish: DEFAULT_FINISH,
                    limit: 1,
                });
                const created = filed.entries[0];
                if (created !== undefined) {
                    write((previous) => [
                        ...previous,
                        {
                            uuid: created.uuid,
                            printing: created.printing,
                            quantity: created.quantity,
                            condition: created.condition,
                            finish: created.finish,
                            purchasePriceCents: created.purchase_price_cents ?? null,
                        },
                    ]);
                }
            }
            changed.current = true;
        });
    }

    /**
     * Takes one copy of a printing back out
     *
     * Takes it from the stack a copy would have been filed into, and otherwise
     * from the last one holding this printing, so the count under the card
     * always follows the click.
     *
     * @param printing the card to take out
     */
    async function remove(printing: Printing) {
        await serial(async () => {
            const holding = known.current.filter((stack) => stack.printing === printing.id && stack.quantity > 0);
            const target =
                holding.find((stack) => stack.condition === DEFAULT_CONDITION && stack.finish === DEFAULT_FINISH) ??
                holding[holding.length - 1];
            if (target === undefined) return;

            // One name, not every copy of it: filing three and taking one back
            // out leaves two. A stack that was here before this run leaves the
            // counter alone — it counts what this run filed.
            setAdded((previous) => {
                const at = previous.indexOf(printing.name);
                return at < 0 ? previous : [...previous.slice(0, at), ...previous.slice(at + 1)];
            });

            if (target.quantity > 1) {
                write((previous) =>
                    previous.map((stack) =>
                        stack.uuid === target.uuid ? { ...stack, quantity: stack.quantity - 1 } : stack,
                    ),
                );
                await Api.collections.entries.update(collectionUuid, target.uuid, {
                    quantity: target.quantity - 1,
                });
            } else {
                write((previous) => previous.filter((stack) => stack.uuid !== target.uuid));
                await Api.collections.entries.delete(collectionUuid, target.uuid);
            }
            changed.current = true;
        });
    }

    /**
     * Closes the dialog, reloading the list behind it if anything was filed
     */
    async function close() {
        onClose();
        await queue.current.catch(() => undefined);
        setAdded([]);
        if (changed.current) {
            changed.current = false;
            onChanged();
        }
    }

    return (
        <Dialog
            open={open}
            onClose={() => void close()}
            size={"6xl"}
            tall={true}
            className={"flex max-h-[calc(100dvh-5rem)] flex-col"}
        >
            <DialogTitle className={"flex items-center gap-3"}>
                <span className={"min-w-0 flex-1 truncate"}>{t("heading.add-cards")}</span>
                <DialogCloseButton onClose={() => void close()} />
            </DialogTitle>
            <DialogBody className={"!mt-3 flex min-h-0 flex-1 flex-col"}>
                <ScrollFade className={"min-h-0 flex-1"}>
                    <div className={"flex flex-col gap-4"}>
                        <CardSearchPanel
                            twoColumns={twoColumns}
                            stickySearch={true}
                            hideInfoOnMobile={true}
                            toolbar={
                                <div className={"flex flex-wrap items-center gap-3"}>
                                    {added.length > 0 && (
                                        <Badge color={"green"}>
                                            <CheckIcon className={"size-3"} />
                                            {t("label.added-count", { count: added.length })}
                                        </Badge>
                                    )}
                                    <span
                                        className={
                                            "ml-auto flex items-center rounded-(--radius-control) bg-zinc-950/5 p-0.5 ring-1 ring-zinc-950/5 dark:bg-white/10 dark:ring-white/10"
                                        }
                                    >
                                        {[false, true].map((option) => (
                                            <button
                                                key={String(option)}
                                                type={"button"}
                                                aria-pressed={twoColumns === option}
                                                aria-label={t(option ? "label.columns-two" : "label.columns-one")}
                                                title={t(option ? "label.columns-two" : "label.columns-one")}
                                                onClick={() => setTwoColumns(option)}
                                                className={
                                                    twoColumns === option
                                                        ? "rounded-[calc(var(--radius-control)-0.125rem)] bg-(--surface-card) p-1.5 text-zinc-950 shadow-(--shadow-card-sm) dark:text-white"
                                                        : "rounded-[calc(var(--radius-control)-0.125rem)] p-1.5 text-zinc-500 transition hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white"
                                                }
                                            >
                                                {option ? (
                                                    <ViewColumnsIcon className={"size-4"} />
                                                ) : (
                                                    <Squares2X2Icon className={"size-4"} />
                                                )}
                                            </button>
                                        ))}
                                    </span>
                                </div>
                            }
                            countOf={copiesOf}
                            onAdd={(printing) => void add(printing)}
                            onRemove={(printing) => void remove(printing)}
                        />

                        {added.length > 0 && (
                            <div
                                className={"flex flex-col gap-1 border-t border-zinc-950/10 pt-3 dark:border-white/10"}
                            >
                                <Strong className={"text-xs"}>{t("label.added-just-now")}</Strong>
                                <Text className={"text-xs"}>
                                    {added.slice(0, RECENT_LIMIT).join(", ")}
                                    {added.length > RECENT_LIMIT && " …"}
                                </Text>
                            </div>
                        )}
                    </div>
                </ScrollFade>
            </DialogBody>
        </Dialog>
    );
}
