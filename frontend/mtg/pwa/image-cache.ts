/** Callbacks must be self-contained: Workbox serializes them into sw.js. */
export const resilientImageCache = {
    cachedResponseWillBeUsed: async ({
        cacheName,
        request,
        cachedResponse,
    }: {
        cacheName: string;
        request: Request;
        cachedResponse?: Response;
    }) => {
        if (cachedResponse === undefined || cachedResponse.type !== "opaque") {
            return cachedResponse;
        }
        // An old no-cors response cannot satisfy a CORS image request. Cleanup
        // is best-effort: unavailable storage must not prevent a network load.
        try {
            const cache = await caches.open(cacheName);
            await cache.delete(request);
        } catch {
            // Treat the unusable response as a cache miss even if eviction fails.
        }
        return undefined;
    },
    // CacheFirst can reject before cachedResponseWillBeUsed runs, e.g. when
    // CacheStorage.match fails. Bypass Workbox/storage on this recovery path.
    // Keep the original request, including its CORS mode and credentials.
    handlerDidError: async ({ request }: { request: Request }) => fetch(request),
};
