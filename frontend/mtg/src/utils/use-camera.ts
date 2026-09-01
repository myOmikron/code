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
    /**
     * The cameras this device offers.
     *
     * Empty until one has been opened: a browser hands out labels only once the user has allowed
     * a camera, so before that the list is a row of anonymous ids nobody can choose between.
     */
    devices: MediaDeviceInfo[];
    /** Which camera is in use, empty for whichever the browser picked */
    deviceId: string;
    /** Switch cameras, remembered for next time */
    choose: (id: string) => Promise<void>;
};

/** Where the chosen camera is kept. A phone's wide-angle is nobody's idea of a card scanner. */
const CAMERA_KEY = "cardlens.cameraId.v1";

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
    const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
    const [deviceId, setDeviceId] = useState(() => localStorage.getItem(CAMERA_KEY) ?? "");

    const stop = useCallback(() => {
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        if (videoRef.current) videoRef.current.srcObject = null;
        setActive(false);
    }, []);

    const open = useCallback(async (wanted: string) => {
        setError(null);
        try {
            // An exact id when one was chosen, the back camera otherwise. Not `exact` on the
            // facing mode: `ideal` lets a device with one camera hand it over rather than refuse.
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    ...(wanted ? { deviceId: { exact: wanted } } : { facingMode: { ideal: "environment" } }),
                    // Shaped like the screen it will be shown on. Asking for 1920x1080 on a phone
                    // held upright hands back a landscape frame that `object-cover` then crops to
                    // about a third of its width: 629 usable pixels out of 1920, and a card that
                    // cannot be framed larger than 76% of them however close it is held. Matching
                    // the viewport keeps the whole width.
                    aspectRatio: { ideal: window.innerWidth / window.innerHeight },
                    width: { ideal: 1920 },
                    height: { ideal: 1920 },
                },
                audio: false,
            });
            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                await videoRef.current.play();
            }
            setActive(true);
            // Only now: labels are withheld until a camera has actually been allowed, so asking
            // any earlier returns a list of blank names.
            const found = await navigator.mediaDevices.enumerateDevices().catch(() => []);
            setDevices(found.filter((device) => device.kind === "videoinput"));
        } catch (reason) {
            const name = reason instanceof DOMException ? reason.name : "";
            setError(name === "NotAllowedError" || name === "SecurityError" ? "denied" : "unavailable");
            setActive(false);
        }
    }, []);

    const start = useCallback(() => open(localStorage.getItem(CAMERA_KEY) ?? ""), [open]);

    const choose = useCallback(
        async (id: string) => {
            localStorage.setItem(CAMERA_KEY, id);
            setDeviceId(id);
            streamRef.current?.getTracks().forEach((track) => track.stop());
            await open(id);
        },
        [open],
    );

    useEffect(() => stop, [stop]);

    return { videoRef, active, error, start, stop, devices, deviceId, choose };
}
