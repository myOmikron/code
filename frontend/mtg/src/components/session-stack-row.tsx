import { MinusIcon, PencilSquareIcon, PlusIcon, SparklesIcon, TrashIcon } from "@heroicons/react/20/solid";
import { Badge, Button, Input, Text } from "components";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ScannerSessionEntryResponse } from "src/api/generated";
import { CardThumbnail } from "src/components/card-thumbnail";
import { PrintingDialog } from "src/components/printing-dialog";
import type { CardRecord } from "src/types";

/**
 * The properties for {@link SessionStackRow}
 */
export type SessionStackRowProps = {
    /** The staged stack */
    entry: ScannerSessionEntryResponse;
    /** What the catalogue says the printing is, `null` while it is still being looked up */
    card: CardRecord | null;
    /** Opens the card at full size */
    onZoom?: (card: CardRecord) => void;
    /** Changes one of the stack's fields */
    onChange: (patch: {
        quantity?: number;
        finish?: "Nonfoil" | "Foil" | "Etched";
        signed?: boolean;
        purchase_price_cents?: number | null;
        printing?: string;
    }) => void;
    /** Takes the stack out of the staging area */
    onRemove: () => void;
};

/**
 * Turns what someone typed into a price into euro cents
 *
 * @param typed the field's contents
 *
 * @returns the price in cents, or null for an empty or unreadable field
 */
function toCents(typed: string): number | null {
    const cleaned = typed.replace(",", ".").trim();
    if (cleaned === "") return null;
    const euros = Number(cleaned);
    return Number.isFinite(euros) && euros >= 0 ? Math.round(euros * 100) : null;
}

/**
 * One staged stack, with every correction a scan actually needs.
 *
 * The same row on the phone that scanned the cards and on the machine they are checked from,
 * because it is the same decision either way and there is nothing about it that a small screen
 * gets to skip: how many, foil or not, signed or not, what it cost, and — the correction the
 * scanner gets wrong most often — which printing this is.
 *
 * @returns the row
 */
export function SessionStackRow({ entry, card, onZoom, onChange, onRemove }: SessionStackRowProps) {
    const [t] = useTranslation("session");
    const [tg] = useTranslation();
    const [correcting, setCorrecting] = useState(false);
    // Held while it is being typed in: a field that reformats itself between two keystrokes
    // cannot be typed in at all.
    const [price, setPrice] = useState("");

    useEffect(() => {
        setPrice(entry.purchase_price_cents == null ? "" : (entry.purchase_price_cents / 100).toFixed(2));
    }, [entry.purchase_price_cents]);

    const name = card?.name ?? "…";

    return (
        <>
            <li className="flex gap-3 py-3 sm:gap-4">
                {/* `self-start`, or the row's height decides the picture's: a flex child stretches
                    by default, which overrides the ratio. */}
                <button
                    type="button"
                    disabled={card === null}
                    onClick={() => card && onZoom?.(card)}
                    aria-label={t("accessibility.enlarge", { name })}
                    className="w-20 shrink-0 self-start rounded-lg sm:w-24"
                >
                    <CardThumbnail
                        name={name}
                        image={card?.imageUrl ?? null}
                        finish={entry.finish}
                        compact
                        className="w-full overflow-hidden rounded-lg"
                    />
                </button>

                <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <div className="min-w-0">
                        <Text className="truncate font-medium">{name}</Text>
                        <Text className="truncate font-mono text-xs">
                            {card === null
                                ? " "
                                : `${card.setCode.toUpperCase()} ${card.collectorNumber}${
                                      card.lang && card.lang !== "en" ? ` · ${card.lang.toUpperCase()}` : ""
                                  }`}
                        </Text>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-1 gap-y-2">
                        <div className="flex items-center gap-1">
                            <Button
                                plain
                                aria-label={t("accessibility.one-fewer", { name })}
                                onClick={() =>
                                    entry.quantity <= 1 ? onRemove() : onChange({ quantity: entry.quantity - 1 })
                                }
                            >
                                <MinusIcon className="size-5" />
                            </Button>
                            <Badge>{entry.quantity}</Badge>
                            <Button
                                plain
                                aria-label={t("accessibility.one-more", { name })}
                                onClick={() => onChange({ quantity: entry.quantity + 1 })}
                            >
                                <PlusIcon className="size-5" />
                            </Button>
                        </div>

                        <Button
                            plain
                            aria-pressed={entry.finish !== "Nonfoil"}
                            onClick={() => onChange({ finish: entry.finish === "Nonfoil" ? "Foil" : "Nonfoil" })}
                        >
                            <SparklesIcon className="size-5" />
                            {entry.finish !== "Nonfoil" ? (
                                <Badge color="blue">{tg("label.foil")}</Badge>
                            ) : (
                                tg("label.foil")
                            )}
                        </Button>

                        <Button plain aria-pressed={entry.signed} onClick={() => onChange({ signed: !entry.signed })}>
                            {entry.signed ? (
                                <Badge color="blue">{t("label.signed")}</Badge>
                            ) : (
                                <span className="opacity-70">{t("label.signed")}</span>
                            )}
                        </Button>

                        <span className="ml-auto flex items-center gap-1">
                            <Button
                                plain
                                disabled={card === null}
                                aria-label={t("accessibility.change-printing", { name })}
                                onClick={() => setCorrecting(true)}
                            >
                                <PencilSquareIcon className="size-5" />
                            </Button>
                            <Button plain aria-label={t("accessibility.remove", { name })} onClick={onRemove}>
                                <TrashIcon className="size-5" />
                            </Button>
                        </span>
                    </div>

                    {/* What one copy cost. Written down here rather than guessed from the market
                        later: the price a card was bought at is the one fact about a stack that
                        nobody can recover afterwards. */}
                    <div className="flex items-center gap-2">
                        <Text className="shrink-0 text-xs">{t("label.paid-each")}</Text>
                        <Input
                            type="text"
                            inputMode="decimal"
                            aria-label={t("accessibility.paid-each", { name })}
                            value={price}
                            className="max-w-28"
                            onChange={(event) => setPrice(event.target.value)}
                            onBlur={() => {
                                const cents = toCents(price);
                                if (cents !== entry.purchase_price_cents) onChange({ purchase_price_cents: cents });
                            }}
                        />
                    </div>
                </div>
            </li>

            <PrintingDialog
                card={correcting && card ? { name: card.name, printing: entry.printing } : null}
                onPick={(printing) => {
                    onChange({ printing: printing.id });
                    setCorrecting(false);
                }}
                onClose={() => setCorrecting(false)}
            />
        </>
    );
}
