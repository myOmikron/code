import { AnimatePresence, motion } from "motion/react";
import type { ReactNode, RefObject } from "react";
import type { LiveFrameResult } from "src/scanner/scan-client";

/**
 * What the scanner is doing, as far as the viewfinder needs to know.
 *
 * Five states rather than the pipeline's three, because two of them are about the camera and not
 * about recognition: nothing is loaded yet, and the camera is off.
 */
export type ScanPhase = "loading" | "idle" | "searching" | "preview" | "confirmed";

/**
 * The properties for {@link ScanViewfinder}
 */
export type ScanViewfinderProps = {
    videoRef: RefObject<HTMLVideoElement | null>;
    frame: LiveFrameResult | null;
    phase: ScanPhase;
    /** Counts confirmations, so each one replays the flash rather than showing it once */
    confirmations: number;
    /** Chrome that floats over the picture */
    children?: ReactNode;
};

/** How much of the shorter side one bracket arm spans. */
const ARM_SHARE = 0.13;

/**
 * The four corners of the search region, as path data.
 *
 * Corners rather than a closed rectangle: a full outline competes with the card's own edges,
 * which are the thing the user is trying to line up, while four marks say where to aim without
 * drawing a second card around the first one.
 *
 * Drawn on exactly the rectangle that is searched, which is the point: anything the marks do not
 * enclose is not examined, and nothing outside them can win. Sizing it against the whole camera
 * frame rather than the visible part of it once put half the marks off the edge of a phone screen.
 *
 * @param region the frame that is drawn and searched, in frame pixels
 * @returns one path per corner, clockwise from top left
 */
function cornerPaths(region: LiveFrameResult["region"]): string[] {
    const { x, y, width, height } = region;
    const arm = Math.min(width, height) * ARM_SHARE;
    const right = x + width;
    const bottom = y + height;
    return [
        `M ${x} ${y + arm} L ${x} ${y} L ${x + arm} ${y}`,
        `M ${right - arm} ${y} L ${right} ${y} L ${right} ${y + arm}`,
        `M ${right} ${bottom - arm} L ${right} ${bottom} L ${right - arm} ${bottom}`,
        `M ${x + arm} ${bottom} L ${x} ${bottom} L ${x} ${bottom - arm}`,
    ];
}

/**
 * The camera picture with the detector's own geometry drawn over it.
 *
 * The overlay is in the frame's pixel space and fitted the same way the video is, so the outline
 * lands exactly where the detector found the card without a transform of our own. Everything the
 * user needs to know is in the geometry: dim corners mean keep looking, a warm outline means a
 * card is being read, a blue one means it is done. None of it has to be read as text.
 *
 * @returns the viewfinder
 */
export function ScanViewfinder({ videoRef, frame, phase, confirmations, children }: ScanViewfinderProps) {
    const outline =
        phase === "confirmed" ? "stroke-blue-400" : phase === "preview" ? "stroke-amber-300" : "stroke-white/45";
    const points = frame?.quad
        ? [frame.quad.topLeft, frame.quad.topRight, frame.quad.bottomRight, frame.quad.bottomLeft]
              .map((corner) => `${corner.x},${corner.y}`)
              .join(" ")
        : "";

    return (
        <div className="relative isolate size-full overflow-hidden bg-black">
            <video ref={videoRef} playsInline muted className="size-full object-cover" />

            {frame && frame.frameWidth > 0 ? (
                <svg
                    viewBox={`0 0 ${frame.frameWidth} ${frame.frameHeight}`}
                    preserveAspectRatio="xMidYMid slice"
                    className="pointer-events-none absolute inset-0 size-full"
                >
                    <g className={phase === "searching" ? "animate-pulse" : ""}>
                        {cornerPaths(frame.region).map((path) => (
                            <path
                                key={path}
                                d={path}
                                fill="none"
                                strokeLinecap="round"
                                strokeWidth={frame.frameWidth / 240}
                                className={outline}
                            />
                        ))}
                    </g>

                    {points ? (
                        <polygon
                            points={points}
                            strokeWidth={frame.frameWidth / 150}
                            className={
                                phase === "confirmed"
                                    ? "fill-blue-500/20 stroke-blue-400"
                                    : "fill-amber-300/10 stroke-amber-300/80"
                            }
                        />
                    ) : null}

                    <AnimatePresence>
                        {phase === "confirmed" && points ? (
                            <motion.polygon
                                key={confirmations}
                                points={points}
                                className="fill-blue-300"
                                initial={{ opacity: 0.55 }}
                                animate={{ opacity: 0 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.55, ease: "easeOut" }}
                            />
                        ) : null}
                    </AnimatePresence>
                </svg>
            ) : null}

            {children}
        </div>
    );
}
