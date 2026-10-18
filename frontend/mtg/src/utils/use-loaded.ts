import { useCallback, useEffect, useState } from "react";
import type { DependencyList } from "react";

/**
 * What {@link useLoaded} hands back
 */
export type Loaded<T> = {
    /** The data, `null` until it arrived */
    data: T | null;
    /** Read the data again, keeping the current data until the new one arrives */
    reload: () => void;
};

/**
 * Loads data in an effect and keeps it, ignoring answers that arrive after the load is outdated
 *
 * Starts over from `null` whenever a dependency changes. Failures are left to `load`, which
 * reports them through the api layer.
 *
 * @param load reads the data
 * @param deps the values `load` reads from, it runs again whenever one of them changes
 * @returns the data and a way to read it again
 */
export function useLoaded<T>(load: () => Promise<T>, deps: DependencyList): Loaded<T> {
    const [data, setData] = useState<T | null>(null);
    const [version, setVersion] = useState(0);

    useEffect(() => {
        setData(null);
    }, deps);

    useEffect(() => {
        let current = true;
        load()
            .then((loaded) => {
                if (current) setData(loaded);
            })
            .catch(() => undefined);
        return () => {
            current = false;
        };
    }, [...deps, version]);

    const reload = useCallback(() => setVersion((held) => held + 1), []);
    return { data, reload };
}
