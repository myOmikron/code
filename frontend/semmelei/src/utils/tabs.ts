import { Err, Ok, Result } from "src/utils/result";

/**
 * Opens a new tab and waits for it to close
 *
 * @param url the url to open
 * @returns Returns `Err` when te browser didn't return a handle to the new tabs
 */
export function openSubTab(url: string): Result<Promise<void>, void> {
    const window = open(url);
    if (window === null) return new Err(undefined as void);
    else
        return new Ok(
            new Promise((resolve) => {
                const handler = () => {
                    window.removeEventListener("pagehide", handler);
                    resolve();
                };
                window.addEventListener("pagehide", handler);
            }),
        );
}
