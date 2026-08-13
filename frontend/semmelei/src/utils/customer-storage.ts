const STORAGE_KEY = "semmelei:customer";

/** What this device remembers about the customer */
export type StoredCustomer = {
    /** Whether the customer wants their details kept on this device */
    remember: boolean;
    /** The customer's name, empty if nothing is kept */
    name: string;
    /** The phone number, empty if not given or nothing is kept */
    phone: string;
    /** The email address, empty if not given or nothing is kept */
    email: string;
};

const DEFAULT: StoredCustomer = { remember: true, name: "", phone: "", email: "" };

/**
 * Load what this device remembers about the customer
 *
 * @returns the stored state, or the default (remember, but nothing stored yet)
 */
export function loadCustomer(): StoredCustomer {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return DEFAULT;
        const parsed = JSON.parse(raw);
        if (typeof parsed?.remember !== "boolean") return DEFAULT;
        return {
            remember: parsed.remember,
            name: typeof parsed.name === "string" ? parsed.name : "",
            phone: typeof parsed.phone === "string" ? parsed.phone : "",
            email: typeof parsed.email === "string" ? parsed.email : "",
        };
    } catch {
        return DEFAULT;
    }
}

/**
 * Store the customer's details on this device
 *
 * @param customer the details to store
 */
export function rememberCustomer(customer: Omit<StoredCustomer, "remember">) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ remember: true, ...customer }));
}

/**
 * Drop the stored details and remember that the customer declined
 */
export function forgetCustomer() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...DEFAULT, remember: false }));
}
