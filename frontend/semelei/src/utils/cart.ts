import { UUID } from "src/api/api";

const STORAGE_KEY = "semelei:cart";

/** A single entry of the customer's cart */
export type CartEntry = {
    /** The item's uuid */
    itemId: UUID;
    /** Display snapshot of the item name (backend prices authoritatively) */
    name: string;
    /** Display snapshot of the price in euro cents */
    priceCents: number;
    /** Display snapshot of the item's image version (for thumbnails), if any */
    imageVersion?: number;
    /** How many units */
    quantity: number;
};

/** The customer's cart, persisted in localStorage */
export type Cart = {
    /** Schema version for forward migrations */
    version: 1;
    /** The entries */
    entries: CartEntry[];
};

const EMPTY: Cart = { version: 1, entries: [] };

/**
 * Load the cart from localStorage
 *
 * @returns the stored cart or an empty one
 */
export function loadCart(): Cart {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return EMPTY;
        const parsed = JSON.parse(raw);
        if (parsed?.version !== 1 || !Array.isArray(parsed.entries)) return EMPTY;
        return parsed as Cart;
    } catch {
        return EMPTY;
    }
}

/**
 * Persist the cart to localStorage
 *
 * @param cart the cart to store
 */
export function saveCart(cart: Cart) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
}

/**
 * Remove the cart from localStorage
 */
export function clearCart() {
    localStorage.removeItem(STORAGE_KEY);
}

/**
 * Sum of all cart positions in euro cents
 *
 * @param cart the cart
 *
 * @returns total in euro cents
 */
export function cartTotalCents(cart: Cart): number {
    return cart.entries.reduce((sum, e) => sum + e.priceCents * e.quantity, 0);
}

/**
 * Number of units in the cart
 *
 * @param cart the cart
 *
 * @returns total quantity over all entries
 */
export function cartCount(cart: Cart): number {
    return cart.entries.reduce((sum, e) => sum + e.quantity, 0);
}
