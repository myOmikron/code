import { RectangleStackIcon } from "@heroicons/react/20/solid";
import { Link } from "@tanstack/react-router";
import { EmptyState, StackedList, StackedListFlexRow, Strong, Text } from "components";
import { useTranslation } from "react-i18next";
import type { OnLoanResponse } from "src/api/generated";
import { CardThumbnail } from "src/components/card-thumbnail";

/**
 * The properties for {@link CollectionOnLoan}
 */
export type CollectionOnLoanProps = {
    /** What this collection has lent to decks */
    loans: Array<OnLoanResponse>;
};

/**
 * What is out of this collection because it is sleeved up in a deck.
 *
 * These cards are not rows of the collection any more: they moved, and the
 * collection is lighter for it. Without a page of their own the shelf would
 * quietly be missing them, and somebody would buy a second copy of a card that
 * is lying in their own deck two shelves down.
 *
 * Drawn as the same list the collection's own cards are drawn as, one deck at a
 * time: a card that left is still a card, and a second way of showing one would
 * only make the two harder to compare.
 *
 * @returns the list, or an empty state while the collection has lent nothing out
 */
export function CollectionOnLoan({ loans }: CollectionOnLoanProps) {
    const [t] = useTranslation("collection");
    const [tg] = useTranslation();

    if (loans.length === 0) {
        return (
            <EmptyState
                icon={<RectangleStackIcon />}
                title={t("heading.nothing-on-loan")}
                description={t("description.nothing-on-loan")}
            />
        );
    }

    const decks = [...new Map(loans.map((loan) => [loan.deck, loan])).values()];
    const copies = loans.reduce((sum, loan) => sum + loan.quantity, 0);

    return (
        <div className={"flex flex-col gap-6"}>
            <Text className={"tabular-nums"}>
                {tg("label.cards", { count: copies, amount: copies })} · {t("label.in-decks", { count: decks.length })}
            </Text>

            {decks.map((deck) => (
                <section key={deck.deck} className={"flex flex-col gap-3"}>
                    <div className={"flex items-center gap-3"}>
                        <Link
                            to={"/decks/$deckUuid/sourcing"}
                            params={{ deckUuid: deck.deck }}
                            className={
                                "flex items-center gap-2 text-sm/6 font-semibold text-zinc-950 hover:underline dark:text-white"
                            }
                        >
                            <RectangleStackIcon className={"size-4 text-zinc-400 dark:text-zinc-500"} />
                            {deck.deck_name}
                        </Link>
                        <span className={"h-px flex-1 bg-zinc-950/5 dark:bg-white/10"} />
                    </div>

                    <StackedList>
                        {loans
                            .filter((loan) => loan.deck === deck.deck)
                            .map((loan) => (
                                <StackedListFlexRow
                                    key={`${loan.deck}-${loan.printing}`}
                                    className={"flex-wrap gap-x-4 gap-y-3"}
                                >
                                    <CardThumbnail
                                        name={loan.name ?? ""}
                                        image={loan.image_small ?? null}
                                        finish={"Nonfoil"}
                                        compact={true}
                                        className={"h-16 shrink-0 rounded"}
                                    />
                                    <div className={"flex min-w-0 flex-1 flex-col gap-1.5"}>
                                        <Strong className={"block truncate"}>
                                            {loan.name ?? t("label.unknown-printing")}
                                        </Strong>
                                        {loan.set_name != null && (
                                            <Text className={"text-xs"}>
                                                {loan.set_name} · {loan.set_code} #{loan.collector_number}
                                            </Text>
                                        )}
                                    </div>
                                    <div className={"flex shrink-0 items-center justify-end"}>
                                        <Strong className={"tabular-nums"}>{`×${loan.quantity}`}</Strong>
                                    </div>
                                </StackedListFlexRow>
                            ))}
                    </StackedList>
                </section>
            ))}
        </div>
    );
}
