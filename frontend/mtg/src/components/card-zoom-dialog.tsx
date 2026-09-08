import * as Headless from "@headlessui/react";
import { XMarkIcon } from "@heroicons/react/20/solid";
import { useTranslation } from "react-i18next";
import type { CardRecord } from "src/types";
import { largerScan } from "src/utils/card-artwork";

/**
 * The properties for {@link CardZoomDialog}
 */
export type CardZoomDialogProps = {
    /** The card being looked at, `null` while nothing is */
    card: CardRecord | null;
    /** Closes the viewer */
    onClose: () => void;
};

/**
 * One card, as big as the screen allows.
 *
 * Not a dialog with a picture in it but a picture with nothing else: a list row shows a card the
 * size of a thumbnail, and the reason to open one is to read the thing a thumbnail cannot show —
 * the collector line, the treatment, whether the scanner picked the right frame.
 *
 * The ratio is the file's own. Every list in the app draws a card into a `5/7` box and crops what
 * does not fit, which is right for a row and wrong here, where a squeezed card is exactly what
 * someone opened this to rule out. So the image is `object-contain` against the viewport and
 * nothing else decides its shape.
 *
 * Tapping anywhere closes it, the picture included: on a phone the picture is most of the screen,
 * and hunting for a corner button on a black field is a step for nothing.
 *
 * @returns the viewer
 */
export function CardZoomDialog({ card, onClose }: CardZoomDialogProps) {
    const [tg] = useTranslation();

    return (
        <Headless.Dialog open={card !== null} onClose={onClose} className={"relative z-50"}>
            <Headless.DialogBackdrop
                transition
                className={"fixed inset-0 bg-zinc-950/90 transition duration-100 data-closed:opacity-0"}
            />

            <div className={"fixed inset-0 grid place-items-center p-4"} onClick={onClose}>
                <Headless.DialogPanel
                    transition
                    className={
                        "flex max-h-full flex-col items-center gap-3 transition duration-100 data-closed:scale-95 data-closed:opacity-0"
                    }
                >
                    {card !== null && (
                        <>
                            {/* The bigger file for the closer look, with the one the list already
                                showed named as the fallback — that one is in the browser's cache,
                                so a slow connection still puts a card on screen straight away. */}
                            <img
                                src={largerScan(card.imageUrl)}
                                crossOrigin={"anonymous"}
                                alt={tg("accessibility.card-image", { name: card.name, setName: card.setName })}
                                decoding={"async"}
                                fetchPriority={"high"}
                                onError={(event) => {
                                    event.currentTarget.src = card.imageUrl;
                                }}
                                className={"max-h-[80dvh] w-auto max-w-full rounded-xl object-contain shadow-2xl"}
                            />
                            <p className={"text-center text-sm text-white/80"}>
                                <span className={"font-medium text-white"}>{card.name}</span>
                                <span className={"ml-2 font-mono text-xs text-white/60"}>
                                    {`${card.setCode.toUpperCase()} ${card.collectorNumber}`}
                                </span>
                            </p>
                        </>
                    )}
                </Headless.DialogPanel>
            </div>

            <button
                type={"button"}
                onClick={onClose}
                aria-label={tg("button.close")}
                className={
                    "fixed top-4 right-4 rounded-full bg-black/55 p-2 text-white/70 ring-1 ring-white/15 backdrop-blur hover:text-white"
                }
            >
                <XMarkIcon className={"size-5"} />
            </button>
        </Headless.Dialog>
    );
}
