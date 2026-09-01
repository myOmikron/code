import { ArchiveBoxIcon, CheckCircleIcon, MagnifyingGlassIcon } from "@heroicons/react/20/solid";
import clsx from "clsx";
import { Button, Input, InputGroup, Label, Strong, Switch, SwitchField, Text } from "components";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatCurrency } from "src/utils/format";
import { searchAllPrintings } from "src/utils/scryfall";
import type { Printing } from "src/utils/scryfall";

/** How long typing rests before the filter is asked of Scryfall */
const DEBOUNCE_MS = 400;

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
    /** The printings of this card that lie in one of the account's collections */
    owned?: ReadonlySet<string>;
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
 * A basic land has hundreds of prints, which no grid makes browsable, so the
 * filter is handed to Scryfall rather than applied to what came back: `art:`,
 * `set:`, `frame:` and the rest only exist on their side, and asking them
 * narrows the answer instead of the view.
 *
 * @returns the picker
 */
export function DeckPrintingPicker({ name, current, onPick, startOpen = false, owned }: DeckPrintingPickerProps) {
    const [t] = useTranslation("deck");
    const [open, setOpen] = useState(startOpen);
    const [prints, setPrints] = useState<Array<Printing>>([]);
    const [loading, setLoading] = useState(false);
    // Off to start with: the question this opens on is which art somebody wants,
    // and owning it is the second thought, not the first.
    const [ownedOnly, setOwnedOnly] = useState(false);
    // What is typed, and what has been asked — a keystroke a request would run
    // straight into Scryfall's two calls a second.
    const [filter, setFilter] = useState("");
    const [asked, setAsked] = useState("");

    useEffect(() => {
        setOpen(startOpen);
        setPrints([]);
        setFilter("");
        setAsked("");
    }, [name, startOpen]);

    useEffect(() => {
        const timer = setTimeout(() => setAsked(filter.trim()), DEBOUNCE_MS);
        return () => clearTimeout(timer);
    }, [filter]);

    useEffect(() => {
        if (!open) return;

        const controller = new AbortController();
        setPrints([]);
        setLoading(true);
        // The filter is parenthesised so a query of its own — `art:cat or
        // art:dog` — still only ever narrows this one card's prints.
        const query = asked === "" ? `!"${name}"` : `!"${name}" (${asked})`;
        void searchAllPrintings(query, controller.signal, (found) => {
            if (controller.signal.aborted) return;
            setPrints(found);
        }).then(() => {
            if (controller.signal.aborted) return;
            setLoading(false);
        });

        return () => controller.abort();
    }, [open, name, asked]);

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

    const shown = ownedOnly && owned !== undefined ? prints.filter((print) => owned.has(print.id)) : prints;

    return (
        <div className={"flex flex-col gap-3"}>
            <div className={"flex flex-wrap items-center justify-between gap-3"}>
                <Strong className={"text-xs"}>{t("heading.printing")}</Strong>
                {owned !== undefined && (
                    <SwitchField className={"flex items-center gap-3"}>
                        <Label className={"text-xs!"}>{t("label.owned-printings-only")}</Label>
                        <Switch color={"blue"} checked={ownedOnly} onChange={setOwnedOnly} />
                    </SwitchField>
                )}
            </div>
            <InputGroup>
                <MagnifyingGlassIcon />
                <Input
                    type={"search"}
                    value={filter}
                    aria-label={t("label.filter-printings")}
                    placeholder={t("label.filter-printings")}
                    onChange={(event) => setFilter(event.target.value)}
                />
            </InputGroup>

            {loading && <Text className={"text-sm"}>{t("description.printing-loading")}</Text>}
            {!loading && prints.length === 0 && (
                <Text className={"text-sm"}>
                    {asked === "" ? t("description.printing-none") : t("description.printing-none-filtered")}
                </Text>
            )}
            {!loading && prints.length > 0 && shown.length === 0 && (
                <Text className={"text-sm"}>{t("description.printing-none-owned")}</Text>
            )}

            {shown.length > 0 && (
                <ul className={"grid grid-cols-[repeat(auto-fill,minmax(min(100%,15rem),1fr))] gap-4"}>
                    {shown.map((printing) => {
                        const held = printing.id === current;
                        const have = owned?.has(printing.id) === true;
                        // The foil quote stands in where a print run has no
                        // ordinary one — a foil-only run is priced there and
                        // nowhere else — and says so, so the two are not read
                        // as the same number.
                        const price = printing.priceEur ?? printing.priceEurFoil ?? null;
                        const foilPrice = price !== null && printing.priceEur == null;
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
                                        {have && !held && (
                                            <ArchiveBoxIcon
                                                aria-label={t("label.owned-printing")}
                                                className={
                                                    "absolute top-1 right-1 size-5 rounded-full bg-zinc-950/60 p-0.5 text-white"
                                                }
                                            />
                                        )}
                                    </span>
                                    <span className={"flex flex-col"}>
                                        <span className={"truncate text-xs text-zinc-950 dark:text-white"}>
                                            {printing.setName}
                                        </span>
                                        <span
                                            className={
                                                "flex items-baseline justify-between gap-2 text-xs text-zinc-500 dark:text-zinc-400"
                                            }
                                        >
                                            <span className={"truncate"}>
                                                {printing.setCode} #{printing.collectorNumber} · {printing.releasedAt}
                                            </span>
                                            {price !== null && (
                                                <span className={"shrink-0 tabular-nums"}>
                                                    {formatCurrency(price)}
                                                    {foilPrice && ` ${t("label.foil")}`}
                                                </span>
                                            )}
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
