import React from "react";
import { UUID } from "src/api/api";
import { Cart, CartEntry, cartCount, cartTotalCents, loadCart, saveCart } from "src/utils/cart";

/** Actions modifying the cart */
export type CartAction =
    | {
          type: "add";
          entry: CartEntry;
      }
    | {
          type: "setQuantity";
          itemId: UUID;
          quantity: number;
      }
    | {
          type: "remove";
          itemId: UUID;
      }
    | {
          type: "clear";
      };

/**
 * Reducer applying a {@link CartAction} to a {@link Cart}
 *
 * @param cart current cart
 * @param action action to apply
 *
 * @returns the new cart
 */
function reduce(cart: Cart, action: CartAction): Cart {
    switch (action.type) {
        case "add": {
            const existing = cart.entries.find((e) => e.itemId === action.entry.itemId);
            if (existing) {
                return reduce(cart, {
                    type: "setQuantity",
                    itemId: action.entry.itemId,
                    quantity: existing.quantity + action.entry.quantity,
                });
            }
            return { ...cart, entries: [...cart.entries, action.entry] };
        }
        case "setQuantity": {
            if (action.quantity <= 0) {
                return reduce(cart, { type: "remove", itemId: action.itemId });
            }
            return {
                ...cart,
                entries: cart.entries.map((e) =>
                    e.itemId === action.itemId ? { ...e, quantity: Math.min(action.quantity, 99) } : e,
                ),
            };
        }
        case "remove":
            return { ...cart, entries: cart.entries.filter((e) => e.itemId !== action.itemId) };
        case "clear":
            return { version: 1, entries: [] };
    }
}

/** Value provided by the {@link CartProvider} */
export type CartContextValue = {
    /** The current cart */
    cart: Cart;
    /** Apply an action to the cart */
    dispatch: React.Dispatch<CartAction>;
    /** Sum over all positions in euro cents */
    totalCents: number;
    /** Number of units in the cart */
    count: number;
};

export const CART_CONTEXT = React.createContext<CartContextValue>({
    cart: { version: 1, entries: [] },
    /** No-op outside a {@link CartProvider} */
    dispatch: () => {},
    totalCents: 0,
    count: 0,
});

/**
 * The properties for {@link CartProvider}
 */
export type CartProviderProps = {
    /** The children to render */
    children: React.ReactNode;
};

/**
 * Provides the customer's cart, persisted in localStorage
 *
 * @param props {@link CartProviderProps}
 *
 * @returns the provider
 */
export function CartProvider(props: CartProviderProps) {
    const [cart, dispatch] = React.useReducer(reduce, undefined, loadCart);

    React.useEffect(() => {
        saveCart(cart);
    }, [cart]);

    return (
        <CART_CONTEXT.Provider value={{ cart, dispatch, totalCents: cartTotalCents(cart), count: cartCount(cart) }}>
            {props.children}
        </CART_CONTEXT.Provider>
    );
}
