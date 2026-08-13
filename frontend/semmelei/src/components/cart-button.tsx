import { ShoppingCartIcon } from "@heroicons/react/24/outline";
import React from "react";
import { useTranslation } from "react-i18next";
import { Button } from "components";
import { CART_CONTEXT } from "src/context/cart";

/**
 * Cart button in the shop header with a live item count
 *
 * @returns the cart link
 */
export function CartButton() {
    const { count } = React.useContext(CART_CONTEXT);
    const [t] = useTranslation("shop");
    return (
        <Button href={"/cart"} outline aria-label={t("accessibility.cart")}>
            <ShoppingCartIcon />
            {t("heading.cart")}
            {count > 0 && <span aria-live={"polite"}>({count})</span>}
        </Button>
    );
}
