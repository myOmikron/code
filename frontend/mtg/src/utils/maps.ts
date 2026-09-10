/**
 * The bits of `Navigator` {@link mapsUrl} needs to tell an Apple device from anything else
 *
 * A structural type, not `Navigator` itself: it lets a test build a fixture object instead of
 * monkey-patching the global `navigator`, and it is what makes the third parameter optional in
 * the first place — the browser's real `navigator` already has this shape.
 */
export type MapsPlatform = Pick<Navigator, "platform" | "userAgent" | "maxTouchPoints">;

/**
 * Whether `platform` names an Apple device — iOS, iPadOS or macOS
 *
 * A modern iPad reports itself as a Mac and is told apart from a real one only by carrying a
 * touch point, but that distinction is not needed here: {@link mapsUrl} routes iOS, iPadOS *and*
 * macOS to Apple Maps alike, so a bare "Mac" in either string already answers the question on its
 * own, alongside the pre-iPadOS-13 "iPhone"/"iPad"/"iPod" strings.
 *
 * @param platform the platform to read, `undefined` when there is no `navigator` to ask
 *
 * @returns whether Apple Maps is the right app for this reader
 */
function isApplePlatform(platform: MapsPlatform | undefined): boolean {
    if (platform === undefined) return false;
    return /Mac|iPhone|iPad|iPod/.test(`${platform.platform} ${platform.userAgent}`);
}

/**
 * A link that opens this place in whatever maps app the reader has
 *
 * Apple ignores a `geo:` URI outright, which is why neither platform gets one — Apple Maps and
 * Google Maps each get their own URL instead. Apple's takes a name and, optionally, an address;
 * Google's `api=1` is mandatory, since Google silently ignores every other parameter without it.
 *
 * @param name the venue's name
 * @param address the venue's address, `null` when there is none on file
 * @param platform which app to route to — defaults to the real browser `navigator`, `undefined`
 *   where there is none (a test, or a call made during prerender)
 *
 * @returns the url to open
 */
export function mapsUrl(
    name: string,
    address: string | null,
    platform: MapsPlatform | undefined = typeof navigator === "undefined" ? undefined : navigator,
): string {
    // `null` and blank both read as "no address" — normalized once so neither branch below has to
    // repeat the check.
    const trimmedAddress = address !== null && address.trim() !== "" ? address : null;

    if (isApplePlatform(platform)) {
        const query = `q=${encodeURIComponent(name)}`;
        return trimmedAddress === null
            ? `https://maps.apple.com/?${query}`
            : `https://maps.apple.com/?${query}&address=${encodeURIComponent(trimmedAddress)}`;
    }

    const query = encodeURIComponent(trimmedAddress ?? name);
    return `https://www.google.com/maps/search/?api=1&query=${query}`;
}
