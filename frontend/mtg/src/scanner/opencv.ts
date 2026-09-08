//! Lazy loader for the OpenCV.js runtime.
//!
//! The runtime is one 13 MB module (3.7 MB gzipped, WASM embedded), so it is imported
//! dynamically and only when a scan actually starts. `loadOpenCv` dedupes concurrent callers
//! and caches the resolved namespace, which makes it safe to call on every frame.
import type cvTypes from "@techstark/opencv-js";

/**
 * The OpenCV.js namespace, as exposed by `@techstark/opencv-js`
 */
export type OpenCv = typeof cvTypes;

/**
 * The shape the module has before its WASM runtime has finished initializing
 */
type PendingModule = OpenCv & { onRuntimeInitialized?: () => void };

let pending: Promise<OpenCv> | null = null;

/**
 * Resolves the OpenCV namespace once its WASM runtime is ready.
 *
 * The module resolves in one of three ways depending on the build: as a promise, as an
 * already-initialized namespace, or as a namespace that signals readiness through
 * `onRuntimeInitialized`. All three are handled here so callers never see the difference.
 *
 * @returns the initialized OpenCV namespace
 */
export async function loadOpenCv(): Promise<OpenCv> {
    pending ??= (async () => {
        const imported = (await import("./opencv-runtime")).default as OpenCv | Promise<OpenCv>;
        if (imported instanceof Promise) return imported;

        const module = imported as PendingModule;
        if (module.Mat) return module;

        await new Promise<void>((resolve) => {
            module.onRuntimeInitialized = resolve;
        });
        return module;
    })();
    return pending;
}

/**
 * Runs `body` and deletes every Mat handed to `track`, whether it returns or throws.
 *
 * OpenCV.js allocates inside the WASM heap, which the JavaScript garbage collector does not
 * see. Every Mat must be deleted by hand, and a scan that leaks a few per frame exhausts the
 * heap within seconds of live scanning.
 *
 * @param body receives a tracking function that registers a Mat for deletion and returns it
 * @returns whatever `body` returns
 */
export function withMats<T>(body: (track: <M extends { delete: () => void }>(mat: M) => M) => T): T {
    const owned: { delete: () => void }[] = [];
    try {
        return body((mat) => {
            owned.push(mat);
            return mat;
        });
    } finally {
        for (const mat of owned.reverse()) {
            try {
                mat.delete();
            } catch {
                // already released
            }
        }
    }
}
