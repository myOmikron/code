/**
 * One of a few values, remembered on this device.
 */

/**
 * The value this device stored
 *
 * @param key where it is stored
 * @param values what it can be
 * @param fallback what it is when nothing usable is stored
 *
 * @returns the value
 */
export function loadChoice<T extends string>(key: string, values: ReadonlyArray<T>, fallback: T): T {
    try {
        const stored = localStorage.getItem(key);
        return values.find((value) => value === stored) ?? fallback;
    } catch {
        return fallback;
    }
}

/**
 * Stores a value on this device, or nothing where storage is blocked
 *
 * @param key where it is stored
 * @param value the value
 */
export function saveChoice(key: string, value: string) {
    try {
        localStorage.setItem(key, value);
    } catch {
        return;
    }
}
