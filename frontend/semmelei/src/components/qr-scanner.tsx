import jsQR from "jsqr";
import React from "react";

/**
 * The properties for {@link QrScanner}
 */
export type QrScannerProps = {
    /** Called with the decoded text, at most once per mount cycle */
    onScan: (value: string) => void;
    /** Called when the camera cannot be opened (no permission, no device) */
    onError?: (error: unknown) => void;
};

/** How often a frame is inspected — 10/s is plenty for a code held still */
const SCAN_INTERVAL_MS = 100;

/**
 * Camera viewfinder that reports the first QR code it reads.
 *
 * Uses the platform's `BarcodeDetector` where it exists (Android/Chrome
 * decode in native code) and falls back to jsQR everywhere else — Safari has
 * no detector, and the counter runs on whatever phone is at hand.
 *
 * @param props {@link QrScannerProps}
 *
 * @returns the viewfinder
 */
export function QrScanner(props: QrScannerProps) {
    const videoRef = React.useRef<HTMLVideoElement>(null);
    const canvasRef = React.useRef<HTMLCanvasElement>(null);
    const { onScan, onError } = props;

    React.useEffect(() => {
        let stream: MediaStream | undefined;
        let timer: number | undefined;
        // Guards the whole effect: a code is reported once, then the loop
        // stops — otherwise a code left in frame fires on every tick.
        let done = false;

        /** The native detector, if the browser has one */
        const detector =
            "BarcodeDetector" in window
                ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  new (window as any).BarcodeDetector({ formats: ["qr_code"] })
                : undefined;

        /** Read one frame and report a code if there is one */
        async function tick() {
            const video = videoRef.current;
            const canvas = canvasRef.current;
            if (done || !video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) return;

            if (detector) {
                try {
                    const codes = await detector.detect(video);
                    if (codes.length > 0 && codes[0].rawValue) {
                        done = true;
                        onScan(codes[0].rawValue);
                    }
                    return;
                } catch {
                    // Fall through to jsQR — some browsers expose the class
                    // but reject the format at runtime.
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

        navigator.mediaDevices
            // The rear camera is the one pointed at the customer's phone
            .getUserMedia({ video: { facingMode: "environment" } })
            .then((media) => {
                stream = media;
                const video = videoRef.current;
                if (!video) return;
                video.srcObject = media;
                return video.play();
            })
            .then(() => {
                timer = window.setInterval(() => void tick(), SCAN_INTERVAL_MS);
            })
            .catch((error) => onError?.(error));

        return () => {
            done = true;
            if (timer !== undefined) window.clearInterval(timer);
            stream?.getTracks().forEach((track) => track.stop());
        };
    }, [onScan, onError]);

    return (
        <div className={"relative overflow-hidden rounded-2xl bg-black"}>
            <video ref={videoRef} playsInline muted className={"h-auto w-full"} />
            <canvas ref={canvasRef} className={"hidden"} />
            {/* Aiming aid: the customer holds their phone into this square */}
            <div className={"pointer-events-none absolute inset-0 flex items-center justify-center"}>
                <div className={"aspect-square w-2/3 rounded-2xl border-2 border-white/80"} />
            </div>
        </div>
    );
}
