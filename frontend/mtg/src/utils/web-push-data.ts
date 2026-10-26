/**
 * The data Web Push trades in, as the browser and the server spell it.
 */

import type { PushLanguage } from "src/api/generated";

/**
 * Turn a base64url string, as the server hands out the VAPID key, into bytes
 *
 * @param base64url the encoded string, padded or not
 * @returns its bytes
 */
export function base64UrlToBytes(base64url: string): Uint8Array<ArrayBuffer> {
    const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    return bytes;
}

/**
 * The language a device's pushes are written in, from the language the app shows
 *
 * @param language i18next's resolved language
 * @returns the push language
 */
export function pushLanguage(language: string | undefined): PushLanguage {
    return (language ?? "").startsWith("en") ? "En" : "De";
}
