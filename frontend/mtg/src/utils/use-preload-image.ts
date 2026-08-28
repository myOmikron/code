/**
 * Fetching a picture before anything asks to see it.
 *
 * The back of a double-faced card is the case this exists for. Turning one over
 * is a single tap, and until this the file only started downloading once the
 * tap had happened — so the card went blank for as long as the network took,
 * which on a phone at a table is exactly where it is least forgivable. The
 * front is on screen anyway; the back costs one more request per card that has
 * one, and buys a flip that is instant.
 */

import { useEffect } from "react";

/**
 * Puts a picture in the browser's cache
 *
 * The image is never rendered — the request alone is the point, and the browser
 * serves the later `<img>` out of its own cache. Nothing is done for a card
 * with no second side, which is most of them.
 *
 * A url that changes cancels nothing: a request already sent is one the cache
 * keeps, and dropping the object only stops it from being told about it.
 *
 * @param url the picture to fetch, `null` when there is none
 */
export function usePreloadImage(url: string | null | undefined): void {
    useEffect(() => {
        if (url == null || url === "") return;
        const image = new Image();
        // Same as the `<img>` that will show it: a request made under other
        // rules lands in a different cache entry and the fetch is wasted.
        image.crossOrigin = "anonymous";
        image.decoding = "async";
        image.src = url;
    }, [url]);
}

/**
 * The same for a whole list, so a view that draws its cards in a loop can ask
 * for every back at once — a hook cannot be called from inside one.
 *
 * Keyed on the urls themselves rather than on the array: a list rebuilt on
 * every render is a new array every time, and depending on it would re-run this
 * forever.
 *
 * @param urls the pictures to fetch, `null` entries and duplicates ignored
 */
export function usePreloadImages(urls: Array<string | null | undefined>): void {
    const wanted = [...new Set(urls.filter((url): url is string => url != null && url !== ""))];
    const key = wanted.join(" ");

    useEffect(() => {
        for (const url of key === "" ? [] : key.split(" ")) {
            const image = new Image();
            image.crossOrigin = "anonymous";
            image.decoding = "async";
            image.src = url;
        }
    }, [key]);
}
