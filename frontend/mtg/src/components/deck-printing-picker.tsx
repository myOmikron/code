import { CheckCircleIcon } from "@heroicons/react/20/solid";
import clsx from "clsx";
import { Button, Strong, Text } from "components";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { searchPrintings } from "src/utils/scryfall";
import type { Printing } from "src/utils/scryfall";

/**
 * The properties for {@link DeckPrintingPicker}
 */
export type DeckPrintingPickerProps = {
    /** The card whose print runs are offered */
    name: string;
    /** Which print run the slot holds today */
    current: string;
    /** Records a different print run */
    onPick: (printing: Printing) => void;
    /** Whether the prints are shown right away rather than behind the button */
    startOpen?: boolean;
};

/**
 * Which print of a card a deck slot holds.
 *
 * The deck search answers one row per card rather than per print, because
 * building a deck is choosing cards; the art is chosen afterwards, here, where
 * every print of that one card is on screen at once.
 *
 * The prints are fetched when they are asked for, not when a card is opened: a
 * long evening of looking at cards should not be a request per card.
 *
 * @returns the picker
 */
export function DeckPrintingPicker({ name, current, onPick, startOpen = false }: DeckPrintingPickerProps) {
    const [t] = useTranslation("deck");
    const [open, setOpen] = useState(startOpen);
    const [prints, setPrints] = useState<Array<Printing>>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        setOpen(startOpen);
        setPrints([]);
    }, [name, startOpen]);

    useEffect(() => {
        if (!open) return;

        const controller = new AbortController();
        setLoading(true);
        void searchPrintings(`!"${name}"`, controller.signal, "prints").then((found) => {
            if (controller.signal.aborted) return;
            setPrints(found);
            setLoading(false);
        });

        return () => controller.abort();
    }, [open, name]);

    if (!open) {
        return (
            <div className={"flex flex-col gap-2"}>
                <Strong className={"text-xs"}>{t("heading.printing")}</Strong>
                <div>
                    <Button outline onClick={() => setOpen(true)}>
                        {t("button.change-printing")}
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className={"flex flex-col gap-3"}>
            <Strong className={"text-xs"}>{t("heading.printing")}</Strong>
            {loading && <Text className={"text-sm"}>{t("description.printing-loading")}</Text>}
            {!loading && prints.length === 0 && <Text className={"text-sm"}>{t("description.printing-none")}</Text>}

            {prints.length > 0 && (
                <ul className={"grid grid-cols-[repeat(auto-fill,minmax(min(100%,15rem),1fr))] gap-4"}>
                    {prints.map((printing) => {
                        const held = printing.id === current;
                        return (
                            <li key={printing.id}>
                                <button
                                    type={"button"}
                                    onClick={() => onPick(printing)}
                                    title={`${printing.setName} #${printing.collectorNumber}`}
                                    className={"flex w-full flex-col gap-1 text-left"}
                                >
                                    <span className={"relative block"}>
                                        {(printing.largeImageUrl ?? printing.imageUrl) !== null ? (
                                            <img
                                                src={printing.largeImageUrl ?? printing.imageUrl ?? ""}
                                                crossOrigin={"anonymous"}
                                                alt={`${printing.name} · ${printing.setCode}`}
                                                loading={"lazy"}
                                                className={clsx(
                                                    "aspect-5/7 w-full rounded-lg bg-zinc-200 object-cover ring-1 transition dark:bg-zinc-700",
                                                    held
                                                        ? "ring-2 ring-(--color-success)"
                                                        : "ring-transparent hover:ring-zinc-950/20 dark:hover:ring-white/25",
                                                )}
                                            />
                                        ) : (
                                            <span
                                                className={
                                                    "flex aspect-5/7 items-center justify-center rounded-lg bg-zinc-200 p-2 text-center text-xs text-zinc-950 dark:bg-zinc-700 dark:text-white"
                                                }
                                            >
                                                {printing.setCode}
                                            </span>
                                        )}
                                        {held && (
                                            <CheckCircleIcon
                                                className={"absolute top-1 right-1 size-5 text-(--color-success)"}
                                            />
                                        )}
                                    </span>
                                    <span className={"flex flex-col"}>
                                        <span className={"truncate text-xs text-zinc-950 dark:text-white"}>
                                            {printing.setName}
                                        </span>
                                        <span className={"truncate text-xs text-zinc-500 dark:text-zinc-400"}>
                                            {printing.setCode} #{printing.collectorNumber} · {printing.releasedAt}
                                        </span>
                                    </span>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
