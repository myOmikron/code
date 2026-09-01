import { MinusIcon, PencilSquareIcon, PlusIcon, SparklesIcon, TrashIcon } from "@heroicons/react/20/solid";
import { Badge, Button, Dialog, DialogActions, DialogBody, DialogTitle, Select, Text } from "components";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
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
    /** Camera stills from this session, by card id, shown in place of catalogue artwork */
    stills: Record<string, string>;
};

/**
 * Everything scanned so far, with the corrections a scan actually needs.
 *
 * Quantity is not stored as a number. The staging list keeps one entry per copy, so the count is
 * how many entries a card has, and changing it adds or drops one of them.
 *
 * @returns the dialog
 */
export function ScanStagingSheet({ open, onClose, stills }: ScanStagingSheetProps) {
    const [t] = useTranslation("scan");
    const [tg] = useTranslation();
    const { scans, add, remove, removeMany, replaceCard } = usePendingScans();
    const [correcting, setCorrecting] = useState<PendingGroup | null>(null);
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
            <Dialog open={open} onClose={onClose} size={"2xl"}>
                <DialogTitle>{t("heading.staged", { count: scans.length })}</DialogTitle>
                <DialogBody>
                    {groups.length === 0 ? (
                        <Text>{t("description.nothing-staged")}</Text>
                    ) : (
                        <ul className="divide-y divide-zinc-950/5 dark:divide-white/10">
                            {groups.map((group) => (
                                <li key={`${group.card.id}-${group.foil}`} className="flex gap-3 py-3">
                                    <img
                                        src={stills[group.card.id] ?? group.card.imageUrl}
                                        alt=""
                                        className="aspect-5/7 w-12 shrink-0 rounded-md bg-zinc-900 object-cover"
                                    />

                                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                                        <div className="min-w-0">
                                            <Text className="truncate font-medium">{group.card.name}</Text>
                                            <Text className="truncate font-mono text-xs">
                                                {`${group.card.setCode.toUpperCase()} ${group.card.collectorNumber}`}
                                            </Text>
                                        </div>

                                        <div className="flex flex-wrap items-center gap-2">
                                            <div className="flex items-center gap-1">
                                                <Button
                                                    plain
                                                    aria-label={t("accessibility.one-fewer", {
                                                        name: group.card.name,
                                                    })}
                                                    onClick={() => remove(group.ids[0])}
                                                >
                                                    <MinusIcon className="size-4" />
                                                </Button>
                                                <Badge>{group.ids.length}</Badge>
                                                <Button
                                                    plain
                                                    aria-label={t("accessibility.one-more", { name: group.card.name })}
                                                    onClick={() => add(group.card, group.foil)}
                                                >
                                                    <PlusIcon className="size-4" />
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
                                                <SparklesIcon className="size-4" />
                                                {group.foil ? (
                                                    <Badge color="blue">{tg("label.foil")}</Badge>
                                                ) : (
                                                    tg("label.foil")
                                                )}
                                            </Button>

                                            {(variants[printingKey(group.card)] ?? []).length > 1 ? (
                                                <Select
                                                    aria-label={t("accessibility.language-of", {
                                                        name: group.card.name,
                                                    })}
                                                    className="max-w-40"
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

                                            <Button
                                                plain
                                                aria-label={t("accessibility.change-printing-of", {
                                                    name: group.card.name,
                                                })}
                                                onClick={() => setCorrecting(group)}
                                            >
                                                <PencilSquareIcon className="size-4" />
                                            </Button>

                                            <Button
                                                plain
                                                aria-label={t("accessibility.remove-staged", {
                                                    name: group.card.name,
                                                })}
                                                onClick={() => removeMany(group.ids)}
                                            >
                                                <TrashIcon className="size-4" />
                                            </Button>
                                        </div>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </DialogBody>
                <DialogActions>
                    <Button plain onClick={onClose}>
                        {tg("button.close")}
                    </Button>
                </DialogActions>
            </Dialog>

            <PrintingPicker
                card={correcting?.card ?? null}
                open={correcting !== null}
                onClose={() => setCorrecting(null)}
                onSelect={(card) => correcting && correctPrinting(correcting, card)}
            />
        </>
    );
}
