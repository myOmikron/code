import { Description, Field, Input, Label, Text } from "components";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { searchPrintings } from "src/utils/scryfall";
import type { Printing } from "src/utils/scryfall";

/** How long typing has to pause before a search goes out */
const DEBOUNCE_MS = 400;

/**
 * The properties for {@link CardSearchPanel}
 */
export type CardSearchPanelProps = {
    /** Called when a result is picked without dragging (click, or touch) */
    onPick: (printing: Printing) => void;
};

/**
 * Searches Scryfall and offers the hits as draggable cards.
 *
 * The drag payload is the card's public Scryfall url rather than a private
 * format. That means the same drop target accepts a card dragged straight out
 * of a scryfall.com tab, and it costs nothing — the url is what a browser hands
 * over for a link anyway.
 *
 * @returns the search panel
 */
export function CardSearchPanel({ onPick }: CardSearchPanelProps) {
    const [t] = useTranslation("collection");
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<Printing[]>([]);
    const [searching, setSearching] = useState(false);

    useEffect(() => {
        if (query.trim() === "") {
            setResults([]);
            return;
        }
        // Debounced and abortable: `/cards/search` allows two calls a second,
        // and a keystroke-per-request would blow straight through that.
        const controller = new AbortController();
        const timer = setTimeout(() => {
            setSearching(true);
            void searchPrintings(query, controller.signal).then((found) => {
                if (!controller.signal.aborted) {
                    setResults(found);
                    setSearching(false);
                }
            });
        }, DEBOUNCE_MS);

        return () => {
            clearTimeout(timer);
            controller.abort();
        };
    }, [query]);

    return (
        <div className={"flex flex-col gap-3"}>
            <Field>
                <Label>{t("label.card-search")}</Label>
                <Description>{t("description.card-search")}</Description>
                <Input
                    type={"search"}
                    value={query}
                    placeholder={t("label.card-search-placeholder")}
                    onChange={(e) => setQuery(e.target.value)}
                />
            </Field>

            {query.trim() !== "" && results.length === 0 && !searching && <Text>{t("description.no-hits")}</Text>}

            {results.length > 0 && (
                <div className={"grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-7"}>
                    {results.map((printing) => (
                        <button
                            key={printing.id}
                            type={"button"}
                            draggable={true}
                            title={`${printing.name} · ${printing.setCode} #${printing.collectorNumber}`}
                            aria-label={t("accessibility.add-printing", {
                                name: printing.name,
                                set: printing.setCode,
                            })}
                            onDragStart={(event) => {
                                const url = `https://scryfall.com/card/${printing.setCode.toLowerCase()}/${printing.collectorNumber}`;
                                event.dataTransfer.setData("text/uri-list", url);
                                event.dataTransfer.setData("text/plain", url);
                                event.dataTransfer.effectAllowed = "copy";
                            }}
                            onClick={() => onPick(printing)}
                            className={
                                "cursor-grab overflow-hidden rounded transition hover:opacity-80 active:cursor-grabbing"
                            }
                        >
                            {printing.imageUrl !== null ? (
                                <img
                                    src={printing.imageUrl}
                                    crossOrigin={"anonymous"}
                                    alt={printing.name}
                                    loading={"lazy"}
                                    className={"aspect-5/7 w-full bg-zinc-200 object-cover dark:bg-zinc-700"}
                                />
                            ) : (
                                <div
                                    className={
                                        "flex aspect-5/7 items-center justify-center bg-zinc-200 p-1 dark:bg-zinc-700"
                                    }
                                >
                                    <span className={"text-xs"}>{printing.name}</span>
                                </div>
                            )}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
