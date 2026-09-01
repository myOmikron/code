import { MinusIcon, PencilSquareIcon, PlusIcon, SparklesIcon, TrashIcon } from "@heroicons/react/20/solid";
import { Badge, Button, Dialog, DialogBody, DialogTitle, Select, Text } from "components";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CardThumbnail } from "src/components/card-thumbnail";
import { CardZoomDialog } from "src/components/card-zoom-dialog";
import { DialogCloseButton } from "src/components/dialog-close-button";
import { PrintingPicker } from "src/components/printing-picker";
import { usePendingScans } from "src/context/pending-scans-context";
import type { IndexedPrinting } from "src/scanner/embedding-index";
import { listPrintingsNamed } from "src/scanner/scan-client";
import type { CardRecord } from "src/types";
import { cardLanguageLabel } from "src/utils/card-languages";
import { groupPendingScans } from "src/utils/pending-scans";
import type { PendingGroup } from "src/utils/pending-scans";
import { toCardRecord } from "src/utils/scanned-card";

/**
 * The properties for {@link ScanStagingSheet}
 */
export type ScanStagingSheetProps = {
    open: boolean;
    onClose: () => void;
};

/**
 * Everything scanned so far, with the corrections a scan actually needs.
 *
 * Quantity is not stored as a number. The staging list keeps one entry per copy, so the count is
 * how many entries a card has, and changing it adds or drops one of them.
 *
 * The picture is the catalogue's, not the camera's. A still cut from the frame is what the live
 * strip is for — proof that the card in hand is the card that was read — but this list is where a
 * wrong printing gets corrected, and that decision is made against the artwork, the frame and the
 * border. A phone crop of a card held at an angle shows none of those, and it arrived in whatever
 * shape the card happened to be photographed in, which the row then squashed into a card-shaped
 * box.
 *
 * @returns the dialog
 */
export function ScanStagingSheet({ open, onClose }: ScanStagingSheetProps) {
    const [t] = useTranslation("scan");
    const [tg] = useTranslation();
    const { scans, add, remove, removeMany, replaceCard } = usePendingScans();
    const [correcting, setCorrecting] = useState<PendingGroup | null>(null);
    const [zoomed, setZoomed] = useState<CardRecord | null>(null);
    const [variants, setVariants] = useState<Record<string, IndexedPrinting[]>>({});
    const groups = groupPendingScans(scans);

    /**
     * Keys a printing by what stays the same across its languages
     *
     * @param card the staged card
     * @returns the key
     */
    const printingKey = (card: CardRecord) => `${card.setCode}/${card.collectorNumber}`;

    // The same printing exists in up to six languages under one set and collector number, and the
    // catalogue is already on the device, so the choice costs a lookup rather than a download.
    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        const wanted = groups.filter((group) => !(printingKey(group.card) in variants));
        if (wanted.length === 0) return;
        void Promise.all(
            wanted.map(async (group) => {
                const printings = await listPrintingsNamed(group.card.name).catch(() => []);
                return [
                    printingKey(group.card),
                    printings.filter(
                        (printing) =>
                            printing.set === group.card.setCode &&
                            printing.collectorNumber === group.card.collectorNumber,
                    ),
                ] as const;
            }),
        ).then((found) => {
            if (!cancelled) setVariants((current) => ({ ...current, ...Object.fromEntries(found) }));
        });
        return () => {
            cancelled = true;
        };
    }, [open, groups, variants]);

    /**
     * Puts a row into another language of the very same printing.
     *
     * @param group the row
     * @param code the language chosen
     */
    const chooseLanguage = (group: PendingGroup, code: string) => {
        const wanted = (variants[printingKey(group.card)] ?? []).find((printing) => printing.lang === code);
        if (!wanted) return;
        for (const id of group.ids) replaceCard(id, toCardRecord(wanted));
    };

    /**
     * Points every copy of a row at a different printing.
     *
     * @param group the row
     * @param card the printing chosen
     */
    const correctPrinting = (group: PendingGroup, card: CardRecord) => {
        for (const id of group.ids) replaceCard(id, card);
        setCorrecting(null);
    };

    return (
        <>
            {/* `tall`, because this is the whole point of the screen it opens from: a two thirds
                sheet on a phone cut the list to one and a half rows and put the rest behind a
                scroll inside a scroll. */}
            <Dialog open={open} onClose={onClose} size={"2xl"} tall>
                <DialogTitle className={"flex items-center gap-3"}>
                    <span className={"min-w-0 flex-1 truncate"}>{t("heading.staged", { count: scans.length })}</span>
                    <DialogCloseButton onClose={onClose} />
                </DialogTitle>
                <DialogBody>
                    {groups.length === 0 ? (
                        <Text>{t("description.nothing-staged")}</Text>
                    ) : (
                        <ul className="divide-y divide-zinc-950/5 dark:divide-white/10">
                            {groups.map((group) => (
                                <li key={`${group.card.id}-${group.foil}`} className="flex gap-3 py-3 sm:gap-4">
                                    {/* `self-start`, or the row's height decides the picture's:
                                        a flex child stretches by default, which overrode the
                                        ratio and left the card drawn into whatever box the
                                        controls beside it happened to make. */}
                                    <button
                                        type="button"
                                        onClick={() => setZoomed(group.card)}
                                        aria-label={t("accessibility.enlarge", { name: group.card.name })}
                                        className="w-20 shrink-0 self-start rounded-lg sm:w-24"
                                    >
                                        <CardThumbnail
                                            name={group.card.name}
                                            image={group.card.imageUrl}
                                            finish={group.foil ? "Foil" : "Nonfoil"}
                                            compact
                                            className="w-full overflow-hidden rounded-lg"
                                        />
                                    </button>

                                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                                        <div className="min-w-0">
                                            <Text className="truncate font-medium">{group.card.name}</Text>
                                            <Text className="truncate font-mono text-xs">
                                                {`${group.card.setCode.toUpperCase()} ${group.card.collectorNumber}`}
                                            </Text>
                                        </div>

                                        {/* Two rows on a phone rather than one that wraps
                                            mid-control: how many, then what kind, then the two
                                            that leave the row. */}
                                        <div className="flex flex-wrap items-center gap-x-1 gap-y-2">
                                            <div className="flex items-center gap-1">
                                                <Button
                                                    plain
                                                    aria-label={t("accessibility.one-fewer", {
                                                        name: group.card.name,
                                                    })}
                                                    onClick={() => remove(group.ids[0])}
                                                >
                                                    <MinusIcon className="size-5" />
                                                </Button>
                                                <Badge>{group.ids.length}</Badge>
                                                <Button
                                                    plain
                                                    aria-label={t("accessibility.one-more", { name: group.card.name })}
                                                    onClick={() => add(group.card, group.foil)}
                                                >
                                                    <PlusIcon className="size-5" />
                                                </Button>
                                            </div>

                                            <Button
                                                plain
                                                aria-pressed={group.foil}
                                                onClick={() => {
                                                    removeMany(group.ids);
                                                    for (let copy = 0; copy < group.ids.length; copy += 1)
                                                        add(group.card, !group.foil);
                                                }}
                                            >
                                                <SparklesIcon className="size-5" />
                                                {group.foil ? (
                                                    <Badge color="blue">{tg("label.foil")}</Badge>
                                                ) : (
                                                    tg("label.foil")
                                                )}
                                            </Button>

                                            <span className="ml-auto flex items-center gap-1">
                                                <Button
                                                    plain
                                                    aria-label={t("accessibility.change-printing-of", {
                                                        name: group.card.name,
                                                    })}
                                                    onClick={() => setCorrecting(group)}
                                                >
                                                    <PencilSquareIcon className="size-5" />
                                                </Button>

                                                <Button
                                                    plain
                                                    aria-label={t("accessibility.remove-staged", {
                                                        name: group.card.name,
                                                    })}
                                                    onClick={() => removeMany(group.ids)}
                                                >
                                                    <TrashIcon className="size-5" />
                                                </Button>
                                            </span>
                                        </div>

                                        {(variants[printingKey(group.card)] ?? []).length > 1 ? (
                                            <Select
                                                aria-label={t("accessibility.language-of", {
                                                    name: group.card.name,
                                                })}
                                                className="w-full sm:max-w-40"
                                                value={group.card.lang ?? ""}
                                                onChange={(event) => chooseLanguage(group, event.target.value)}
                                            >
                                                {(variants[printingKey(group.card)] ?? []).map((printing) => (
                                                    <option key={printing.lang} value={printing.lang}>
                                                        {cardLanguageLabel(printing.lang)}
                                                    </option>
                                                ))}
                                            </Select>
                                        ) : null}
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </DialogBody>
            </Dialog>

            <CardZoomDialog card={zoomed} onClose={() => setZoomed(null)} />

            <PrintingPicker
                card={correcting?.card ?? null}
                open={correcting !== null}
                onClose={() => setCorrecting(null)}
                onSelect={(card) => correcting && correctPrinting(correcting, card)}
            />
        </>
    );
}
