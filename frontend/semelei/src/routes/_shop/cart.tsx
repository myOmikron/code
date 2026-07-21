import { createFileRoute } from "@tanstack/react-router";
import React from "react";
import { useTranslation } from "react-i18next";
import {
    Button,
    Divider,
    EmptyState,
    Heading,
    PrimaryButton,
    StackedList,
    StackedListFlexRow,
    StackedListItem,
    StackedListTitle,
    Strong,
    Text,
} from "components";
import { PhotoIcon } from "@heroicons/react/24/outline";
import { itemImageUrl } from "src/api/api";
import { QuantityStepper } from "src/components/quantity-stepper";
import { CART_CONTEXT } from "src/context/cart";
import { formatPrice } from "src/utils/price";

/**
 * The cart review page
 *
 * @returns the page
 */
function CartPage() {
    const [t] = useTranslation("shop");
    const { cart, dispatch, totalCents } = React.useContext(CART_CONTEXT);

    return (
        <div className={"mx-auto flex w-full max-w-xl flex-col gap-6"}>
            <Heading>{t("heading.cart")}</Heading>

            {cart.entries.length === 0 ? (
                <EmptyState
                    title={t("label.cart-empty")}
                    action={<Button href={"/"}>{t("button.continue-shopping")}</Button>}
                />
            ) : (
                <>
                    <StackedList>
                        {cart.entries.map((entry) => (
                            <StackedListFlexRow key={entry.itemId}>
                                <div className={"flex items-center gap-3"}>
                                    <div
                                        className={
                                            "size-14 shrink-0 overflow-hidden rounded-[var(--radius-control)] bg-[var(--surface-muted)]"
                                        }
                                    >
                                        {entry.imageVersion != null ? (
                                            <img
                                                src={itemImageUrl(entry.itemId, entry.imageVersion)}
                                                alt={entry.name}
                                                className={"size-full object-cover"}
                                            />
                                        ) : (
                                            <div
                                                className={
                                                    "flex size-full items-center justify-center text-zinc-300 dark:text-zinc-700"
                                                }
                                            >
                                                <PhotoIcon className={"size-6"} />
                                            </div>
                                        )}
                                    </div>
                                    <StackedListItem>
                                        <StackedListTitle>{entry.name}</StackedListTitle>
                                        <Text>{formatPrice(entry.priceCents)}</Text>
                                    </StackedListItem>
                                </div>
                                <QuantityStepper
                                    quantity={entry.quantity}
                                    onChange={(quantity) =>
                                        dispatch({
                                            type: "setQuantity",
                                            itemId: entry.itemId,
                                            quantity,
                                        })
                                    }
                                />
                            </StackedListFlexRow>
                        ))}
                    </StackedList>

                    <Divider />
                    <div className={"flex items-center justify-between"}>
                        <Text>{t("label.total")}</Text>
                        <Strong>{formatPrice(totalCents)}</Strong>
                    </div>

                    <div className={"flex flex-col gap-3 sm:flex-row sm:justify-end"}>
                        <Button plain href={"/"}>
                            {t("button.continue-shopping")}
                        </Button>
                        <PrimaryButton href={"/checkout"}>{t("button.checkout")}</PrimaryButton>
                    </div>
                </>
            )}
        </div>
    );
}

export const Route = createFileRoute("/_shop/cart")({
    component: CartPage,
});
