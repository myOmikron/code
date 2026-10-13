import { afterEach, describe, expect, it, vi } from "vitest";
import { resilientImageCache } from "./image-cache";

// Exercise the serialized callbacks too: generated workers cannot access
// imports or closure variables from the Vite configuration.
const plugin = Object.fromEntries(
    Object.entries(resilientImageCache).map(([name, callback]) => [name, new Function(`return (${callback})`)()]),
) as typeof resilientImageCache;
const request = new Request("https://svgs.scryfall.io/card-symbols/G.svg", { mode: "cors", credentials: "omit" });
const opaque = { type: "opaque" } as Response;

afterEach(() => vi.unstubAllGlobals());

describe("image cache recovery", () => {
    it("keeps usable cached images and cache misses", async () => {
        const response = new Response("<svg/>");
        const open = vi.fn();
        vi.stubGlobal("caches", { open });
        for (const cachedResponse of [response, undefined]) {
            await expect(
                plugin.cachedResponseWillBeUsed({ cacheName: "symbols", request, cachedResponse }),
            ).resolves.toBe(cachedResponse);
        }
        expect(open).not.toHaveBeenCalled();
    });

    it("evicts old opaque images and treats them as misses", async () => {
        const remove = vi.fn().mockResolvedValue(true);
        const open = vi.fn().mockResolvedValue({ delete: remove });
        vi.stubGlobal("caches", { open });
        await expect(
            plugin.cachedResponseWillBeUsed({ cacheName: "symbols", request, cachedResponse: opaque }),
        ).resolves.toBeUndefined();
        expect(open).toHaveBeenCalledWith("symbols");
        expect(remove).toHaveBeenCalledWith(request);
    });

    it.each(["open", "delete"])("still permits a network load when cache %s fails", async (operation) => {
        const failure = new TypeError("CacheStorage unavailable");
        vi.stubGlobal("caches", {
            open:
                operation === "open"
                    ? vi.fn().mockRejectedValue(failure)
                    : vi.fn().mockResolvedValue({ delete: vi.fn().mockRejectedValue(failure) }),
        });
        await expect(
            plugin.cachedResponseWillBeUsed({ cacheName: "symbols", request, cachedResponse: opaque }),
        ).resolves.toBeUndefined();
    });

    it("recovers directly from the network without touching broken storage", async () => {
        const response = new Response("<svg/>");
        const fetch = vi.fn().mockResolvedValue(response);
        const match = vi.fn().mockRejectedValue(new TypeError("Failed to execute 'match' on 'CacheStorage'"));
        vi.stubGlobal("fetch", fetch);
        vi.stubGlobal("caches", { match });
        await expect(plugin.handlerDidError({ request })).resolves.toBe(response);
        expect(fetch).toHaveBeenCalledExactlyOnceWith(request);
        expect(match).not.toHaveBeenCalled();
    });

    it("does not hide a real network failure", async () => {
        const error = new TypeError("Failed to fetch");
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(error));
        await expect(plugin.handlerDidError({ request })).rejects.toBe(error);
    });
});
