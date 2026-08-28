import { Badge, Button, Dialog, DialogActions, DialogBody, DialogTitle, Strong, Text } from "components";
import { MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/20/solid";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { CardFlipButton } from "src/components/card-flip-button";
import { ManaCost } from "src/components/mana-cost";
import { MarketPrice } from "src/components/market-price";
import { PriceHistoryPanel } from "src/components/price-history-panel";
import type { CardFinish } from "src/api/generated";
import { FoilFrame } from "src/components/foil-frame";
import { CardmarketLink } from "src/components/cardmarket-link";
import { usePreloadImage } from "src/utils/use-preload-image";
import { ExternalLinkRow } from "src/components/external-link-row";
import type { CardmarketCard } from "src/utils/cardmarket";
import type { Printing } from "src/utils/scryfall";

/**
 * The catalog's own row for a printing, as this dialog reads it
 *
 * The shop link needs the product id, and the price needs the rest: Scryfall
 * quotes a euro price for the English printing alone, so a German card comes
 * out of the card object unpriced and out of the catalog priced — see
 * `Printing::inherit_from_english`.
 */
export type MarketPrinting = CardmarketCard & {
    /** Market price in euro cents, absent when the catalog has none */
    price_eur_cents?: number | null;
};

/**
 * The properties for {@link CardDetailDialog}
 */
export type CardDetailDialogProps = {
    /** The printing to show, or `null` to keep the dialog closed */
    printing: Printing | null;
    /**
     * The same printing as the catalog holds it, for the Cardmarket link and
     * for the price of a card that is not English.
     *
     * Scryfall's card object does not carry the product path, so the link needs
     * the row the collection listing came with. Left out where there is none:
     * a card looked up rather than owned still shows everything else.
     */
    market?: MarketPrinting | null;
    /**
     * The finish to render the artwork in.
     *
     * Scryfall photographs every card flat, so the sheen has to be put back on
     * here — a foil looked at up close should look like one.
     */
    finish?: CardFinish;
    /** Rows shown below the card, e.g. how many copies are filed and in what shape */
    details?: Array<{ label: string; value: ReactNode }>;
    /**
     * Anything to put below the card's own data — the form that edits the stack
     * it belongs to, for instance.
     */
    children?: ReactNode;
    /**
     * The dialog's buttons. Defaults to a lone "close", which is all a pure
     * lookup needs.
     */
    actions?: ReactNode;
    /** Called when the dialog should close */
    onClose: () => void;
};

/**
 * A closer look at one printing: full artwork, rules text and print run.
 *
 * Everything shown here already arrived with the search or the collection
 * lookup — Scryfall's card objects carry the rules text and the large scan
 * whether or not a list uses them, so opening this costs no extra request.
 *
 * @returns the dialog
 */
export function CardDetailDialog({
    printing,
    market = null,
    finish = "Nonfoil",
    details = [],
    children,
    actions,
    onClose,
}: CardDetailDialogProps) {
    const [t] = useTranslation("collection");
    const [tg] = useTranslation();
    const [flipped, setFlipped] = useState(false);

    // The dialog stays mounted while the card in it changes, so the side being
    // shown has to be put back by hand: the next card opens on its front.
    const id = printing?.id ?? null;
    useEffect(() => setFlipped(false), [id]);

    const back = printing?.backLargeImageUrl ?? printing?.backImageUrl ?? null;
    // Fetched while the front is being read, so turning the card over does not
    // put an empty frame on screen for the length of a round trip.
    usePreloadImage(back);
    const showBack = flipped && back !== null;

    // Scryfall's own price first, the catalog's second. They are the same
    // number for an English card; for every other language Scryfall states
    // none and the catalog carries the English row's, which is the only price
    // Cardmarket has for that product either way.
    // The list's own thumbnail, which the browser already holds. Only the front
    // has one worth showing: a card turned over is turned over by hand, and the
    // back was preloaded above the moment the dialog opened.
    const thumbnail = showBack ? null : (printing?.imageUrl ?? null);

    const catalogPrice = market?.price_eur_cents == null ? null : market.price_eur_cents / 100;
    const price = printing?.priceEur ?? catalogPrice;

    return (
        <Dialog open={printing !== null} onClose={onClose} size={"3xl"}>
            {printing !== null && (
                <>
                    <DialogTitle className={"flex items-center gap-3"}>
                        <span className={"min-w-0 flex-1 truncate"}>{printing.name}</span>
                        {printing.manaCost !== "" && <ManaCost value={printing.manaCost} />}
                        {/* Closing used to mean scrolling to the bottom or
                            hitting the sliver of backdrop above the dialog,
                            which on a phone is a few pixels tall. */}
                        <Button plain onClick={onClose} aria-label={tg("button.close")} className={"-mr-2 shrink-0"}>
                            <XMarkIcon className={"size-5"} />
                        </Button>
                    </DialogTitle>
                    <DialogBody className={"max-h-[70svh] overflow-y-auto"}>
                        <div className={"flex flex-col gap-5 sm:flex-row"}>
                            {printing.largeImageUrl !== null && (
                                // The ratio sits on the frame so the box is
                                // there before the picture is — otherwise the
                                // card drops in above whatever is being read and
                                // shoves it down the page.
                                <FoilFrame
                                    finish={finish}
                                    image={showBack ? back : printing.largeImageUrl}
                                    className={
                                        "aspect-5/7 w-full shrink-0 self-start rounded-xl bg-zinc-200 sm:w-72 lg:w-80 dark:bg-zinc-700"
                                    }
                                >
                                    {/* The thumbnail the list already showed,
                                        underneath the full scan. It comes out of
                                        the browser's cache, so it is on screen in
                                        the frame the dialog opens in; the large
                                        file is a fresh request that took about a
                                        second, during which this used to be a
                                        grey box and opening a card read as slow.
                                        Blurred, because it is being shown at four
                                        times the size it was fetched at, and a
                                        soft picture sharpening beats a sharp one
                                        arriving late. */}
                                    {thumbnail !== null && (
                                        <img
                                            src={thumbnail}
                                            crossOrigin={"anonymous"}
                                            alt={""}
                                            aria-hidden={true}
                                            className={
                                                "absolute inset-0 block size-full scale-105 object-cover blur-[2px]"
                                            }
                                        />
                                    )}
                                    <img
                                        src={showBack ? back : printing.largeImageUrl}
                                        crossOrigin={"anonymous"}
                                        alt={printing.name}
                                        decoding={"async"}
                                        fetchPriority={"high"}
                                        className={"relative block size-full object-cover"}
                                    />
                                    {back !== null && (
                                        <CardFlipButton
                                            flipped={showBack}
                                            onFlip={() => setFlipped(!flipped)}
                                            className={"absolute right-2 bottom-2"}
                                        />
                                    )}
                                </FoilFrame>
                            )}
                            <div className={"flex min-w-0 flex-1 flex-col gap-4"}>
                                {printing.faces.length > 1 ? (
                                    // Two halves are two spells: shown apart, each with its
                                    // own cost. The card-level fields would only offer the
                                    // front face, or both glued together with ` // `.
                                    printing.faces.map((face, index) => (
                                        <div
                                            key={face.name || index}
                                            className={
                                                index > 0
                                                    ? "flex flex-col gap-2 border-t border-zinc-950/10 pt-4 dark:border-white/10"
                                                    : "flex flex-col gap-2"
                                            }
                                        >
                                            <div className={"flex items-center justify-between gap-3"}>
                                                <Strong className={"min-w-0 truncate"}>{face.name}</Strong>
                                                {face.manaCost !== "" && <ManaCost value={face.manaCost} />}
                                            </div>
                                            {face.typeLine !== "" && <Text className={"text-xs"}>{face.typeLine}</Text>}
                                            {face.oracleText !== "" && (
                                                <Text className={"whitespace-pre-line"}>{face.oracleText}</Text>
                                            )}
                                        </div>
                                    ))
                                ) : (
                                    <>
                                        {printing.typeLine !== "" && <Text>{printing.typeLine}</Text>}

                                        {printing.oracleText !== "" && (
                                            // Scryfall separates abilities with newlines, and the
                                            // reminder text relies on them to stay readable.
                                            <Text className={"whitespace-pre-line"}>{printing.oracleText}</Text>
                                        )}
                                    </>
                                )}

                                <div className={"flex flex-wrap items-center gap-2"}>
                                    <Badge color={"zinc"}>
                                        {printing.setCode} #{printing.collectorNumber}
                                    </Badge>
                                    {printing.rarity !== "" && <Badge color={"zinc"}>{printing.rarity}</Badge>}
                                    {price !== null && (
                                        <Badge color={"green"}>
                                            <MarketPrice value={price} lang={market?.lang} />
                                        </Badge>
                                    )}
                                </div>
                                <Text className={"text-xs"}>{printing.setName}</Text>

                                {details.length > 0 && (
                                    <dl
                                        className={
                                            "flex flex-col gap-1 border-t border-zinc-950/10 pt-4 dark:border-white/10"
                                        }
                                    >
                                        {details.map((detail) => (
                                            <div
                                                key={detail.label}
                                                className={"flex items-center justify-between gap-4 text-sm"}
                                            >
                                                <dt className={"text-zinc-500 dark:text-zinc-400"}>{detail.label}</dt>
                                                <dd className={"text-right text-zinc-950 dark:text-white"}>
                                                    {detail.value}
                                                </dd>
                                            </div>
                                        ))}
                                    </dl>
                                )}

                                {/* What it has cost, between what the card is and
                                    where to buy it: the chart is the argument for
                                    or against following the link below it. */}
                                <PriceHistoryPanel
                                    printing={printing.id}
                                    finish={finish}
                                    className={"border-t border-zinc-950/10 pt-4 dark:border-white/10"}
                                />

                                {/* The card's own page first, the shops it can be
                                    bought from below it — one row each, since the
                                    list of shops is meant to grow. */}
                                <div
                                    className={
                                        "flex flex-col gap-2 border-t border-zinc-950/10 pt-4 dark:border-white/10"
                                    }
                                >
                                    <Text className={"text-xs"}>{t("label.open-on")}</Text>
                                    {printing.scryfallUrl !== "" && (
                                        <ExternalLinkRow
                                            href={printing.scryfallUrl}
                                            label={t("button.open-on-scryfall")}
                                        >
                                            {/* Scryfall asks not to wear its logo, so the
                                                row carries a plain glass instead — the
                                                lookup, next to the shops. */}
                                            <span
                                                className={
                                                    "flex items-center gap-2 text-sm font-medium text-zinc-950 dark:text-white"
                                                }
                                            >
                                                <MagnifyingGlassIcon className={"size-4 shrink-0"} aria-hidden={true} />
                                                {"Scryfall"}
                                            </span>
                                        </ExternalLinkRow>
                                    )}
                                    <CardmarketLink card={market} finish={finish} variant={"row"} />
                                </div>
                            </div>
                        </div>
                        {children !== undefined && (
                            <div className={"mt-6 border-t border-zinc-950/10 pt-5 dark:border-white/10"}>
                                {children}
                            </div>
                        )}
                    </DialogBody>
                    <DialogActions>
                        {actions ?? (
                            <Button plain onClick={onClose}>
                                {tg("button.close")}
                            </Button>
                        )}
                    </DialogActions>
                </>
            )}
        </Dialog>
    );
}
