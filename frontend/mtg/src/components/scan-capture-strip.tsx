import { SparklesIcon } from "@heroicons/react/20/solid";
import { AnimatePresence, motion } from "motion/react";
import { useTranslation } from "react-i18next";

/**
 * One card the scanner confirmed, with the moment it was confirmed
 */
export type ScanCapture = {
    /** Set and collector number together, which identify the printing and make a stable key */
    id: string;
    name: string;
    set: string;
    number: string;
    /** A still cut from the camera frame, as a data url */
    thumbnail: string;
    /** Whether it was staged as foil, which for a foil-only printing happens without asking */
    foil: boolean;
};

/**
 * The properties for {@link ScanCaptureStrip}
 */
export type ScanCaptureStripProps = {
    captures: ScanCapture[];
};

/**
 * The cards confirmed so far, newest first.
 *
 * The thumbnail is the user's own frame rather than the catalogue's artwork, which is the whole
 * point of it: it needs no network, appears the instant the card is confirmed, and shows the card
 * that was actually held up. A wrong answer is then obvious at a glance, because the picture and
 * the name disagree.
 *
 * @returns the strip
 */
export function ScanCaptureStrip({ captures }: ScanCaptureStripProps) {
    const [t] = useTranslation("scan");
    const [tg] = useTranslation();

    return (
        <ul className="flex gap-3 overflow-x-auto pb-1">
            <AnimatePresence initial={false}>
                {captures.map((capture) => (
                    <motion.li
                        key={capture.id}
                        layout
                        initial={{ opacity: 0, x: -28, scale: 0.92 }}
                        animate={{ opacity: 1, x: 0, scale: 1 }}
                        transition={{ type: "spring", stiffness: 420, damping: 32 }}
                        className="w-24 shrink-0"
                    >
                        <div className="relative">
                            <img
                                src={capture.thumbnail}
                                alt={t("accessibility.capture", { name: capture.name })}
                                className="aspect-5/7 w-full rounded-lg object-cover ring-1 ring-white/15"
                            />
                            {/* Marked without being asked, so it has to be visible without being
                                asked for: this is the only place the decision shows up before the
                                card is out of sight. */}
                            {capture.foil ? (
                                <span
                                    title={tg("label.foil")}
                                    className="absolute top-1 right-1 rounded-full bg-blue-500/85 p-1 text-white ring-1 ring-white/25"
                                >
                                    <SparklesIcon className="size-3.5" />
                                    <span className="sr-only">{tg("label.foil")}</span>
                                </span>
                            ) : null}
                        </div>
                        <p className="mt-1.5 truncate text-xs font-medium text-white/90">{capture.name}</p>
                        <p className="truncate font-mono text-[0.6875rem] text-white/45">
                            {`${capture.set} ${capture.number}`}
                        </p>
                    </motion.li>
                ))}
            </AnimatePresence>
        </ul>
    );
}
