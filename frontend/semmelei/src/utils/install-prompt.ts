/** The chromium-only event offering the browser's install prompt */
export type BeforeInstallPromptEvent = Event & {
    /** Show the browser's install dialog */
    prompt: () => Promise<void>;
    /** Resolves once the user accepted or dismissed the dialog */
    userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISSED_KEY = "semmelei:install-dismissed";

let captured: BeforeInstallPromptEvent | undefined;
const listeners = new Set<() => void>();

/**
 * Tell every subscriber that the prompt appeared or went away
 */
function emit() {
    for (const listener of listeners) listener();
}

window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    captured = event as BeforeInstallPromptEvent;
    emit();
});

window.addEventListener("appinstalled", () => {
    captured = undefined;
    emit();
});

/**
 * Subscribe to the prompt becoming available or unavailable
 *
 * @param listener called on every change
 *
 * @returns the unsubscribe function
 */
export function subscribeInstallPrompt(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

/**
 * The install prompt the browser handed out, if any
 *
 * @returns the prompt event, or undefined
 */
export function getInstallPrompt(): BeforeInstallPromptEvent | undefined {
    return captured;
}

/**
 * Drop the prompt — it cannot be shown a second time
 */
export function clearInstallPrompt() {
    captured = undefined;
    emit();
}

/**
 * Whether the customer sent the install banner away
 *
 * @returns whether the banner stays hidden
 */
export function isInstallDismissed(): boolean {
    return localStorage.getItem(DISMISSED_KEY) === "true";
}

/**
 * Keep the install banner hidden from now on
 */
export function dismissInstall() {
    localStorage.setItem(DISMISSED_KEY, "true");
}
