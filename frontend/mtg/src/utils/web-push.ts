/**
 * This device's Web Push subscription.
 */

import { Api } from "src/api/api";
import type { PushLanguage } from "src/api/generated";
import { isFormError } from "src/utils/error";
import { base64UrlToBytes } from "src/utils/web-push-data";

/** What subscribing this device came to */
export type SubscribeOutcome = "subscribed" | "denied" | "failed";

/**
 * Whether this browser can get pushes at all
 *
 * iOS offers the Push API only to the app added to the home screen.
 *
 * @returns true if it has a service worker, the Push API and notifications
 */
export function pushSupported(): boolean {
    return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/**
 * This device's push subscription, if the browser has one
 *
 * @returns the subscription or null
 */
async function browserSubscription(): Promise<PushSubscription | null> {
    const registration = await navigator.serviceWorker.ready;
    return registration.pushManager.getSubscription();
}

/**
 * Whether this device gets the logged-in account's pushes
 *
 * @returns true if the browser has a subscription the server keeps for this account
 */
export async function deviceSubscribed(): Promise<boolean> {
    if (!pushSupported()) return false;
    const subscription = await browserSubscription();
    if (subscription === null) return false;
    const { subscribed } = await Api.accounts.push.check(subscription.endpoint);
    return subscribed;
}

/**
 * Subscribe this device to the logged-in account's pushes
 *
 * Asks for the notification permission first, so call it from a tap: iOS and
 * Firefox ignore the request otherwise.
 *
 * @param publicKey the server's VAPID key
 * @param language the language pushes to this device are written in
 * @returns what came of it
 */
export async function subscribeDevice(publicKey: string, language: PushLanguage): Promise<SubscribeOutcome> {
    if ((await Notification.requestPermission()) !== "granted") return "denied";

    const registration = await navigator.serviceWorker.ready;
    const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: base64UrlToBytes(publicKey),
        }));
    const { endpoint, keys } = subscription.toJSON();
    if (endpoint === undefined || keys?.p256dh === undefined || keys.auth === undefined) return "failed";

    const result = await Api.accounts.push.subscribe({ endpoint, p256dh: keys.p256dh, auth: keys.auth, language });
    return isFormError(result) ? "failed" : "subscribed";
}

/**
 * Stop this device's pushes, for the logged-in account and in the browser
 */
export async function unsubscribeDevice(): Promise<void> {
    const subscription = await browserSubscription();
    if (subscription === null) return;
    await Api.accounts.push.unsubscribe(subscription.endpoint);
    await subscription.unsubscribe();
}

/**
 * Enable Tournament pushes for this device and Account after an explicit activation tap.
 *
 * @param publicKey the server's VAPID key, loaded before the tap
 * @param language the device's push language
 * @param subscribed whether this device already belongs to the Account
 * @returns the subscription outcome, after updating the Account preference on success
 */
export async function activateTournamentPushes(
    publicKey: string,
    language: PushLanguage,
    subscribed: boolean,
): Promise<SubscribeOutcome> {
    const outcome = subscribed ? "subscribed" : await subscribeDevice(publicKey, language);
    if (outcome === "subscribed") await Api.accounts.push.setTournamentPushes(true);
    return outcome;
}
