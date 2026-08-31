/**
 * Whether a proxy's artwork is drawn washed out.
 *
 * The fade is what keeps a stand-in from passing for the real card at a
 * glance, but a deck that is mostly proxies is mostly faded, and an owner who
 * knows exactly what is real in their deck may prefer the artwork at full
 * strength. So the wash is a choice, kept on this device like the theme —
 * which cards are proxies is the deck's business, how they are drawn is the
 * reader's.
 */

/** The `localStorage` key */
const STORAGE_KEY = "proxy-fade";

/** Whoever is watching the switch */
const subscribers = new Set<() => void>();

/**
 * Whether proxies are drawn washed out — on until it was turned off
 *
 * @returns the stored choice
 */
export function proxyFadeEnabled(): boolean {
    return localStorage.getItem(STORAGE_KEY) !== "off";
}

/**
 * Follows the switch
 *
 * @param onChange what to call when it flips
 *
 * @returns a function removing the listener again
 */
export function subscribeProxyFade(onChange: () => void): () => void {
    subscribers.add(onChange);
    return () => subscribers.delete(onChange);
}

/**
 * Flips the switch and remembers it
 *
 * @param enabled what it was flipped to
 */
export function setProxyFade(enabled: boolean) {
    localStorage.setItem(STORAGE_KEY, enabled ? "on" : "off");
    for (const subscriber of subscribers) subscriber();
}
