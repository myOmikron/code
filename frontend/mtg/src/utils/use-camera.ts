//! Opens the back camera and keeps a video element fed by it.
//!
//! Kept apart from the scanning loop on purpose: a camera that will not open, a permission that
//! was denied and a scanner that finds nothing are three different failures, and the interface
//! has to say which one happened. Mixing them into one "scanning failed" is what makes a scanner
//! feel broken when it is merely pointed at a table.
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The state of the camera, and how to start and stop it
 */
export type Camera = {
    /** Attach to a `<video>`; it plays as soon as the stream arrives */
    videoRef: React.RefObject<HTMLVideoElement | null>;
    active: boolean;
    /** Set when the camera could not be opened, already translated by the caller */
    error: "denied" | "unavailable" | null;
    start: () => Promise<void>;
    stop: () => void;
};

/**
 * Requests the environment-facing camera at a resolution the scanner can work with.
 *
 * The request asks for a high resolution but does not insist: `ideal` lets a phone hand over
 * whatever it has rather than refusing outright, and the chain downscales anyway. What it does
 * insist on is the back camera, because scanning with the selfie camera is nobody's intent.
 *
 * @returns the camera handle
 */
export function useCamera(): Camera {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const [active, setActive] = useState(false);
    const [error, setError] = useState<Camera["error"]>(null);

    const stop = useCallback(() => {
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        if (videoRef.current) videoRef.current.srcObject = null;
        setActive(false);
    }, []);

    const start = useCallback(async () => {
        setError(null);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: { ideal: "environment" },
                    width: { ideal: 1920 },
                    height: { ideal: 1080 },
                },
                audio: false,
            });
            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                await videoRef.current.play();
            }
            setActive(true);
        } catch (reason) {
            const name = reason instanceof DOMException ? reason.name : "";
            setError(name === "NotAllowedError" || name === "SecurityError" ? "denied" : "unavailable");
            setActive(false);
        }
    }, []);

    useEffect(() => stop, [stop]);

    return { videoRef, active, error, start, stop };
}
