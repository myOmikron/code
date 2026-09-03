/**
 * The device camera, opened only on request.
 *
 * `qr-scanner.tsx` is the one caller today, but the lifecycle rule is general enough to live on
 * its own: a stream is never acquired until something calls {@link UseCameraResult.start}, and
 * every track it opens is stopped both by an explicit {@link UseCameraResult.stop} and by the
 * hook's own unmount cleanup — whichever happens first, neither leaks. A phone with the camera
 * LED still on after the visitor has moved past the scanner is the bug players report, so both
 * paths funnel through the same teardown rather than duplicating it.
 */

import type { RefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Where a camera session currently stands.
 *
 * `denied` and `unavailable` read differently to a visitor even though neither shows a picture:
 * a denied prompt can be retried once the browser's site permission changes, a device with no
 * camera at all cannot — the page tells them apart in its copy.
 */
export type CameraStatus = "idle" | "starting" | "live" | "denied" | "unavailable";

/** What {@link useCamera} hands back to whoever renders the viewfinder */
export type UseCameraResult = {
    /** Attach this to the `<video>` element that shows the feed */
    videoRef: RefObject<HTMLVideoElement | null>;
    /** The current lifecycle state */
    status: CameraStatus;
    /** Requests the rear camera; harmless to call again while already starting or live */
    start: () => void;
    /** Stops every track this hook opened and returns to `idle` */
    stop: () => void;
};

/**
 * Opens and releases the rear-facing camera for the in-app QR scanner.
 *
 * @returns the viewfinder ref, the lifecycle state, and the two controls
 */
export function useCamera(): UseCameraResult {
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const [status, setStatus] = useState<CameraStatus>("idle");

    const stop = useCallback(() => {
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        if (videoRef.current) videoRef.current.srcObject = null;
        setStatus("idle");
    }, []);

    const start = useCallback(() => {
        if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
            // No API at all — an insecure context (plain http) or a browser that never shipped
            // it. Same dead end as a device with no camera, so the same status.
            setStatus("unavailable");
            return;
        }
        setStatus("starting");
        navigator.mediaDevices
            // The rear camera is the one pointed at whatever is being scanned.
            .getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false })
            .then((stream) => {
                streamRef.current = stream;
                const video = videoRef.current;
                if (video) {
                    video.srcObject = stream;
                    void video.play().catch(() => undefined);
                }
                setStatus("live");
            })
            .catch((error: unknown) => {
                streamRef.current = null;
                if (error instanceof DOMException && error.name === "NotAllowedError") {
                    setStatus("denied");
                } else {
                    // NotFoundError (no camera on the device) and everything else this hook has
                    // no more specific answer for — the typed code above works regardless.
                    setStatus("unavailable");
                }
            });
    }, []);

    // Releases the camera on unmount even if the caller never calls `stop` itself — e.g. the
    // visitor navigates away mid-scan rather than pressing "stop".
    useEffect(() => stop, [stop]);

    return { videoRef, status, start, stop };
}
