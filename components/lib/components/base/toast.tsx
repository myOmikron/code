import React from "react";
import { toast, type ToastOptions, type Id } from "react-toastify";

const baseOptions: ToastOptions = {
    position: "bottom-right",
    autoClose: 4000,
    hideProgressBar: false,
    closeOnClick: true,
    pauseOnHover: true,
    draggable: false,
    className: "toast-message",
};

/**
 * Labels displayed by a {@link notify.promise} call while the promise is
 * pending, after it resolves, and after it rejects.
 */
type PromiseMessages = {
    /** Shown while the promise is pending. */
    pending: string;
    /** Shown after the promise resolves successfully. */
    success: string;
    /** Shown after the promise rejects. */
    error: string;
};

/**
 * Centralized toast notification wrapper around `react-toastify`.
 *
 * ## Why this exists
 * Instead of calling `react-toastify` directly across the codebase, all
 * call-sites go through `notify`. This keeps position, timing, dark-mode
 * styling, and other defaults in one place — changing `baseOptions` here
 * propagates everywhere automatically.
 *
 * ## Setup
 * Render `<ToastContainer />` once near the root of your app (e.g. in
 * `App.tsx`). Without it, toasts are queued but never displayed.
 *
 * ```tsx
 * import { ToastContainer } from "react-toastify";
 * import "react-toastify/dist/ReactToastify.css";
 *
 * export function App() {
 *   return (
 *     <>
 *       <Router />
 *       <ToastContainer />
 *     </>
 *   );
 * }
 * ```
 *
 * Dark-mode styling for the container is wired via the `.toast-message` class
 * in `index.css` — make sure that file is imported in your app entry point.
 *
 * ## Usage
 * ```tsx
 * // Fire-and-forget notifications
 * notify.success("Settings saved");
 * notify.error("Something went wrong — please try again.");
 * notify.warning("Your session expires in 5 minutes.");
 * notify.info("A new version is available.");
 *
 * // Promise-based: shows pending → resolves to success or error automatically
 * await notify.promise(saveSettings(), {
 *   pending: "Saving…",
 *   success: "Settings saved!",
 *   error: "Failed to save settings.",
 * });
 *
 * // Dismiss a specific toast by the ID returned from any notify call
 * const id = notify.info("Processing…");
 * notify.dismiss(id);
 *
 * // Dismiss all toasts at once
 * notify.dismiss();
 * ```
 *
 * All methods accept an optional `options` argument to override defaults for
 * that individual toast (e.g. `autoClose`, `position`).
 */
export const notify = {
    /**
     * Shows a green success toast.
     *
     * @param message - Toast content.
     * @param options - Per-call option overrides.
     * @returns The toast ID.
     */
    success(message: React.ReactNode, options?: ToastOptions): Id {
        return toast.success(message, { ...baseOptions, ...options });
    },
    /**
     * Shows a red error toast.
     *
     * @param message - Toast content.
     * @param options - Per-call option overrides.
     * @returns The toast ID.
     */
    error(message: React.ReactNode, options?: ToastOptions): Id {
        return toast.error(message, { ...baseOptions, ...options });
    },
    /**
     * Shows an amber warning toast.
     *
     * @param message - Toast content.
     * @param options - Per-call option overrides.
     * @returns The toast ID.
     */
    warning(message: React.ReactNode, options?: ToastOptions): Id {
        return toast.warning(message, { ...baseOptions, ...options });
    },
    /**
     * Shows a blue informational toast.
     *
     * @param message - Toast content.
     * @param options - Per-call option overrides.
     * @returns The toast ID.
     */
    info(message: React.ReactNode, options?: ToastOptions): Id {
        return toast.info(message, { ...baseOptions, ...options });
    },
    /**
     * Shows a loading toast that automatically transitions to success or error
     * when the promise settles. Useful for async actions like form submissions.
     *
     * @param promise - The promise to track.
     * @param messages - Labels for each settlement state.
     * @param options - Per-call option overrides.
     * @returns The original promise, re-resolved after the toast updates.
     */
    promise<T>(promise: Promise<T>, messages: PromiseMessages, options?: ToastOptions): Promise<T> {
        return toast.promise(promise, messages, { ...baseOptions, ...options }) as Promise<T>;
    },
    /**
     * Dismisses a toast by its ID, or all toasts if no ID is provided.
     * Useful for manually closing a persistent toast triggered earlier.
     *
     * @param id - ID of the toast to dismiss; omit to dismiss all.
     */
    dismiss(id?: Id) {
        toast.dismiss(id);
    },
};
