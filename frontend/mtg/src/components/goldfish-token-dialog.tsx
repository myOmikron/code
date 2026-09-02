import { MagnifyingGlassIcon } from "@heroicons/react/20/solid";
import {
    Button,
    Dialog,
    DialogActions,
    DialogBody,
    DialogTitle,
    Field,
    Input,
    InputGroup,
    Label,
    Text,
} from "components";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TokenSource } from "src/utils/goldfish";
import type { Printing } from "src/utils/scryfall";
import { searchPrintings } from "src/utils/scryfall";

/** How long the search box waits after the last keystroke */
const SEARCH_DELAY = 350;

/**
 * The properties for {@link GoldfishTokenDialog}
 */
export type GoldfishTokenDialogProps = {
    /** Whether the dialog is open */
    open: boolean;
    /** The tokens the deck's cards make, `null` while they are still being looked up */
    deckTokens: Array<Printing> | null;
    /** Puts tokens onto the battlefield */
    onCreate: (token: TokenSource, count: number) => void;
    /** Closes the dialog */
    onClose: () => void;
};

/**
 * Turns a Scryfall printing into what a token is made from
 *
 * @param printing the printing
 *
 * @returns the source
 */
function sourceOf(printing: Printing): TokenSource {
    return {
        printing: printing.id,
        name: printing.name,
        typeLine: printing.typeLine,
        image: printing.largeImageUrl ?? printing.imageUrl,
        backImage: printing.backLargeImageUrl ?? printing.backImageUrl,
    };
}

/**
 * Making tokens: those the deck makes itself first, everything else by search.
 *
 * @returns the dialog
 */
export function GoldfishTokenDialog({ open, deckTokens, onCreate, onClose }: GoldfishTokenDialogProps) {
    const [t] = useTranslation("goldfish");
    const [tg] = useTranslation();
    const [count, setCount] = useState("1");
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<Array<Printing>>([]);
    const [searching, setSearching] = useState(false);

    useEffect(() => {
        const trimmed = query.trim();
        if (trimmed === "") {
            setResults([]);
            setSearching(false);
            return;
        }
        const controller = new AbortController();
        const timer = window.setTimeout(() => {
            setSearching(true);
            void searchPrintings(`t:token ${trimmed}`, controller.signal, "cards")
                .then((found) => {
                    if (!controller.signal.aborted) setResults(found);
                })
                .catch(() => {
                    if (!controller.signal.aborted) setResults([]);
                })
                .finally(() => {
                    if (!controller.signal.aborted) setSearching(false);
                });
        }, SEARCH_DELAY);
        return () => {
            window.clearTimeout(timer);
            controller.abort();
        };
    }, [query]);

    /**
     * Makes the chosen token, as many times as the count says
     *
     * @param printing the token
     */
    function create(printing: Printing) {
        const amount = Math.max(1, Math.min(99, Number(count) || 1));
        onCreate(sourceOf(printing), amount);
        onClose();
    }

    /**
     * A grid of tokens to pick from
     *
     * @param printings the tokens
     *
     * @returns the grid
     */
    function grid(printings: Array<Printing>) {
        return (
            <div className={"grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5"}>
                {printings.map((printing) => (
                    <button
                        key={printing.id}
                        type={"button"}
                        title={printing.name}
                        onClick={() => create(printing)}
                        className={
                            "group flex flex-col gap-1 rounded-lg p-1 text-left outline-none hover:bg-zinc-950/5 focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:bg-white/10"
                        }
                    >
                        <div className={"aspect-5/7 w-full overflow-hidden rounded-[4.5%/3.2%] bg-zinc-800"}>
                            {printing.imageUrl !== null ? (
                                <img src={printing.imageUrl} alt={printing.name} className={"size-full object-cover"} />
                            ) : (
                                <div
                                    className={
                                        "flex size-full items-center justify-center p-1 text-center text-xs text-white"
                                    }
                                >
                                    {printing.name}
                                </div>
                            )}
                        </div>
                        <span className={"truncate text-xs text-zinc-700 dark:text-zinc-300"}>{printing.name}</span>
                    </button>
                ))}
            </div>
        );
    }

    return (
        <Dialog open={open} onClose={onClose} size={"2xl"}>
            <DialogTitle>{t("heading.tokens")}</DialogTitle>
            <DialogBody>
                <div className={"flex flex-col gap-5"}>
                    <div className={"flex flex-col gap-3 sm:flex-row sm:items-end"}>
                        <Field className={"grow"}>
                            <Label>{t("label.token-search")}</Label>
                            <InputGroup>
                                <MagnifyingGlassIcon />
                                <Input
                                    value={query}
                                    autoFocus={true}
                                    placeholder={t("description.token-search")}
                                    onChange={(event) => setQuery(event.target.value)}
                                />
                            </InputGroup>
                        </Field>
                        <Field className={"sm:w-24"}>
                            <Label>{t("label.quantity")}</Label>
                            <Input
                                type={"number"}
                                inputMode={"numeric"}
                                min={1}
                                max={99}
                                value={count}
                                onChange={(event) => setCount(event.target.value)}
                            />
                        </Field>
                    </div>
                    {query.trim() !== "" ? (
                        <div className={"flex flex-col gap-2"}>
                            <Text>{searching ? t("label.searching") : t("label.search-results")}</Text>
                            {results.length === 0 && !searching ? (
                                <Text>{t("description.no-results")}</Text>
                            ) : (
                                grid(results)
                            )}
                        </div>
                    ) : (
                        <div className={"flex flex-col gap-2"}>
                            <Text>{t("label.deck-tokens")}</Text>
                            {deckTokens === null ? (
                                <Text>{t("description.tokens-loading")}</Text>
                            ) : deckTokens.length === 0 ? (
                                <Text>{t("description.no-deck-tokens")}</Text>
                            ) : (
                                grid(deckTokens)
                            )}
                        </div>
                    )}
                </div>
            </DialogBody>
            <DialogActions>
                <Button plain={true} onClick={onClose}>
                    {tg("button.close")}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
