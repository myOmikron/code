import { InformationCircleIcon, PhotoIcon } from "@heroicons/react/24/outline";
import React from "react";
import { useTranslation } from "react-i18next";
import { Button, PrimaryButton } from "components";
import { PublicItem } from "src/api/generated";
import { itemImageUrl } from "src/api/api";
import { QuantityStepper } from "src/components/quantity-stepper";
import { CART_CONTEXT } from "src/context/cart";
import { formatPrice } from "src/utils/price";

/**
 * The properties for {@link ItemCard}
 */
export type ItemCardProps = {
    /** The item to render */
    item: PublicItem;
    /** Show the item's optional customer-facing details. */
    onShowInfo: () => void;
};

/**
 * A product tile: photo on top, name + price below, add/quantity control.
 *
 * @param props {@link ItemCardProps}
 *
 * @returns the card
 */
export function ItemCard(props: ItemCardProps) {
    const { cart, dispatch } = React.useContext(CART_CONTEXT);
    const [t] = useTranslation("shop");
    const entry = cart.entries.find((e) => e.itemId === props.item.uuid);

    return (
        <div
            className={[
                "group relative flex flex-col overflow-hidden rounded-2xl border bg-[var(--surface-card)] shadow-[var(--shadow-card-sm)] transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-card-md)]",
                entry
                    ? "border-blue-500/30 ring-1 ring-blue-500/10 dark:border-blue-400/30"
                    : "border-zinc-950/5 hover:border-zinc-950/10 dark:border-white/10 dark:hover:border-white/20",
            ].join(" ")}
        >
            <div className={"relative aspect-[4/3] w-full overflow-hidden bg-[var(--surface-muted)]"}>
                {props.item.image_version != null ? (
                    <img
                        src={itemImageUrl(props.item.uuid, props.item.image_version)}
                        alt={props.item.name}
                        loading={"lazy"}
                        className={"size-full object-cover transition-transform duration-300 group-hover:scale-105"}
                    />
                ) : (
                    <div className={"flex size-full items-center justify-center text-zinc-300 dark:text-zinc-700"}>
                        <PhotoIcon className={"size-12"} />
                    </div>
                )}
                {entry && (
                    <span
                        className={
                            "absolute top-2 right-2 rounded-full bg-blue-600 px-2 py-1 text-xs font-semibold text-white shadow-sm"
                        }
                    >
                        {t("label.in-cart")}
                    </span>
                )}
            </div>

            <div className={"flex flex-1 flex-col p-3.5 sm:p-4"}>
                <div className={"flex items-start gap-1"}>
                    <h3
                        className={
                            "line-clamp-2 min-w-0 flex-1 text-sm/5 font-semibold text-zinc-950 sm:text-base/6 dark:text-white"
                        }
                    >
                        {props.item.name}
                    </h3>
                    {props.item.additional_info && (
                        <Button
                            plain
                            size={"sm"}
                            aria-label={t("accessibility.item-info", { name: props.item.name })}
                            onClick={props.onShowInfo}
                        >
                            <InformationCircleIcon />
                        </Button>
                    )}
                </div>
                <p className={"mt-1 text-sm font-medium text-zinc-500 tabular-nums dark:text-zinc-400"}>
                    {formatPrice(props.item.price_cents)}
                </p>
                <div className={"mt-4"}>
                    {entry ? (
                        <QuantityStepper
                            wide
                            quantity={entry.quantity}
                            onChange={(quantity) =>
                                dispatch({ type: "setQuantity", itemId: props.item.uuid, quantity })
                            }
                        />
                    ) : (
                        <PrimaryButton
                            size={"sm"}
                            className={"w-full"}
                            onClick={() =>
                                dispatch({
                                    type: "add",
                                    entry: {
                                        itemId: props.item.uuid,
                                        name: props.item.name,
                                        priceCents: props.item.price_cents,
                                        imageVersion: props.item.image_version ?? undefined,
                                        quantity: 1,
                                    },
                                })
                            }
                        >
                            {t("button.add-to-cart")}
                        </PrimaryButton>
                    )}
                </div>
            </div>
        </div>
    );
}
