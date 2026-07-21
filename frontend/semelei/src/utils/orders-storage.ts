import { IsoDate } from "src/api/api";

const STORAGE_KEY = "semelei:orders";

/** A reference to an order the customer placed on this device */
export type RememberedOrder = {
    /** The customer-facing order code */
    pickupCode: string;
    /** Requested pickup date */
    pickupDate: IsoDate;
    /** When the order was placed (ISO timestamp) */
    createdAt: string;
};

/**
 * Load the orders placed on this device
 *
 * @returns newest first
 */
export function loadRememberedOrders(): RememberedOrder[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed as RememberedOrder[];
    } catch {
        return [];
    }
}

/**
 * Remember an order placed on this device (keeps the newest 20)
 *
 * @param order the order reference to remember
 */
export function rememberOrder(order: RememberedOrder) {
    const orders = [order, ...loadRememberedOrders()].slice(0, 20);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
}
