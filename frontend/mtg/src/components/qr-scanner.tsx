import jsQR from "jsqr";
import { useEffect, useRef } from "react";
import type { Camera } from "src/utils/use-camera";
import { useCamera } from "src/utils/use-camera";

/** How often a frame is inspected — 10/s is plenty for a code held still */
const SCAN_INTERVAL_MS = 100;

/** One decoded barcode, the part of the platform `BarcodeDetector` API this component reads */
type DetectedBarcode = {
    /** The text encoded in the code */
    rawValue: string;
};

/** The platform detector's shape — not in `lib.dom`, so there is nothing to import it from */
type BarcodeDetectorLike = {
    /** Reads every barcode visible in one video frame */
    detect: (source: CanvasImageSource) => Promise<Array<DetectedBarcode>>;
};

/**
 * The properties for {@link QrScanner}
 */
export type QrScannerProps = {
    /** Called with the decoded text, at most once per mount cycle */
    onScan: (value: string) => void;
    /** Called whenever the camera fails to open, so the page can say which failure it was */
    onError?: (error: Camera["error"]) => void;
};

/**
 * Camera viewfinder that reports the first QR code it reads.
 *
 * Ported from `frontend/semmelei/src/components/qr-scanner.tsx` onto `use-camera.ts`'s hook,
 * which owns starting and releasing the stream — this component only turns frames into text.
 * Like the original, it uses the platform's `BarcodeDetector` where it exists (Android/Chrome
 * decode in native code) and falls back to jsQR everywhere else, since Safari has no detector.
 *
 * The camera starts the moment this mounts and stops the moment it unmounts (via `use-camera.ts`'s
 * own cleanup) — the page decides when that happens by mounting or unmounting it, and provides its
 * own "stop" control rather than this component rendering one.
 *
 * @returns the viewfinder
 */
export function QrScanner({ onScan, onError }: QrScannerProps) {
    const { videoRef, active, error, start, stop } = useCamera();
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // Starts the instant this mounts (never on the page's own mount — the page only renders this
    // once the visitor has asked to scan) and releases the camera the instant it unmounts.
    useEffect(() => {
        // `start` is async here, unlike the hook this component was first written against: the
        // page learns how it went through `onError` below, not from awaiting it.
        void start();
        return stop;
    }, [start, stop]);

    useEffect(() => {
        onError?.(error);
    }, [error, onError]);

    useEffect(() => {
        if (!active) return;

        // Guards the whole effect: a code is reported once, then the loop stops — otherwise a
        // code left in frame fires on every tick.
        let done = false;

        /** The native detector, if the browser has one */
        const detector: BarcodeDetectorLike | undefined =
            "BarcodeDetector" in window
                ? new (
                      window as unknown as {
                          /** The constructor the feature-detected branch above found */
                          BarcodeDetector: new (options: { formats: Array<string> }) => BarcodeDetectorLike;
                      }
                  ).BarcodeDetector({ formats: ["qr_code"] })
                : undefined;

        /** Reads one frame and reports a code if there is one */
        async function tick() {
            const video = videoRef.current;
            const canvas = canvasRef.current;
            if (done || !video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) return;

            if (detector) {
                try {
                    const codes = await detector.detect(video);
                    if (codes.length > 0 && codes[0]?.rawValue) {
                        done = true;
                        onScan(codes[0].rawValue);
                    }
                    return;
                } catch {
                    // Fall through to jsQR — some browsers expose the class but reject the
                    // format at runtime.
                }
            }

            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const context = canvas.getContext("2d", { willReadFrequently: true });
            if (!context) return;
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            const image = context.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(image.data, image.width, image.height, { inversionAttempts: "dontInvert" });
            if (code?.data) {
                done = true;
                onScan(code.data);
            }
        }

        const timer = window.setInterval(() => void tick(), SCAN_INTERVAL_MS);
        return () => {
            done = true;
            window.clearInterval(timer);
        };
    }, [active, videoRef, onScan]);

    return (
        <div className={"relative overflow-hidden rounded-2xl bg-black"}>
            <video ref={videoRef} playsInline muted className={"h-auto w-full"} />
            <canvas ref={canvasRef} className={"hidden"} />
            {/* Aiming aid: the visitor holds the code into this square */}
            <div className={"pointer-events-none absolute inset-0 flex items-center justify-center"}>
                <div className={"aspect-square w-2/3 rounded-2xl border-2 border-white/80"} />
            </div>
        </div>
    );
}
