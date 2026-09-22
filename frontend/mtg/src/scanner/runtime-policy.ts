/**
 * Use the conservative runtime on WebKit, including iOS browsers and desktop Safari.
 * This is a workaround for WebKit's resource-heavy compilation of the JSEP runtime,
 * not a WebGPU capability check. Unknown browsers keep the normal capability probe.
 *
 * @param userAgent browser identification, also available inside a worker
 * @returns whether to avoid JSEP and overlapping heavyweight startup tasks
 */
export function conservativeScanner(userAgent = navigator.userAgent): boolean {
    return (
        /iPhone|iPad|iPod/.test(userAgent) ||
        (/AppleWebKit/.test(userAgent) && !/Chrome|Chromium|Edg\/|OPR\//.test(userAgent))
    );
}
