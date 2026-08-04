import { useEffect, useState } from "react";

/**
 * Helper function to have a debounced state variable
 *
 * @param value The initial value
 * @param delay The delay in ms
 * @returns a list of current value, debounced value and a setter
 */
export function useDebouncedState<T>(value: T, delay: number): [T, T, (value: T) => void] {
    const [currentValue, setCurrentValue] = useState(value);
    const [debouncedValue, setDebouncedValue] = useState(value);

    useEffect(() => {
        const timeoutId = setTimeout(() => {
            setDebouncedValue(currentValue);
        }, delay);

        return () => {
            clearTimeout(timeoutId);
        };
    }, [currentValue, delay]);

    const setValue = (value: T) => {
        setCurrentValue(value);
    };

    return [currentValue, debouncedValue, setValue];
}
