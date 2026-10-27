import { useRef } from "react";

/**
 * A ref that always holds the latest `value`, e.g. a callback prop an effect calls without depending on it
 *
 * @param value The current value
 * @returns The ref
 */
export function useLatest<T>(value: T) {
    const ref = useRef(value);
    ref.current = value;
    return ref;
}
