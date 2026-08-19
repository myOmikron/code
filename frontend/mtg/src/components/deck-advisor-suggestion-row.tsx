import { PlusIcon } from "@heroicons/react/20/solid";
import { Badge, Button } from "components";
import { useTranslation } from "react-i18next";
import { CardFinish } from "src/api/generated";
import { Suggestion } from "src/api/graph-generated";
import { CardThumbnail } from "src/components/card-thumbnail";
import { ManaCost } from "src/components/mana-cost";
import { formatCurrency } from "src/utils/format";
import { Printing } from "src/utils/scryfall";

/**
 * The properties for {@link DeckAdvisorSuggestionRow}
 */
export type DeckAdvisorSuggestionRowProps = {
    /** The suggestion, as the graph ranked it */
    suggestion: Suggestion;
    /** The resolved card, once the catalog has placed the name */
    printing?: Printing;
    /** Called when the card should go into the deck */
    onAdd: () => void;
    /** Whether an add is in flight, disabling the button */
    busy: boolean;
};

/**
 * One suggested add: the card, why it was retrieved, and the button that
 * puts it into the deck.
 *
 * Every provenance badge names its retrieval channel and carries the server's
 * full reasoning as its tooltip — a suggestion without a traceable origin is
 * a defect, not a feature. The add button only exists once the catalog has
 * placed the name, because an add files a printing, not a name.
 *
 * @returns the row
 */
export function DeckAdvisorSuggestionRow({ suggestion, printing, onAdd, busy }: DeckAdvisorSuggestionRowProps) {
    const [t] = useTranslation("advisor");

    return (
        <div className={"flex items-center gap-3 py-2"}>
            <CardThumbnail
                name={suggestion.name}
                image={printing?.largeImageUrl ?? null}
                thumbnail={printing?.imageUrl ?? null}
                sizes={"40px"}
                finish={CardFinish.Nonfoil}
                className={"w-10 shrink-0"}
            />
            <div className={"min-w-0 flex-1"}>
                <div className={"flex items-center gap-2"}>
                    <span className={"truncate text-sm font-medium text-zinc-950 dark:text-white"}>
                        {suggestion.name}
                    </span>
                    {printing !== undefined && printing.manaCost !== "" && (
                        <ManaCost value={printing.manaCost} className={"text-xs"} />
                    )}
                </div>
                <div className={"truncate text-xs text-zinc-500 dark:text-zinc-400"}>{suggestion.type_line}</div>
                <div className={"mt-1 flex flex-wrap items-center gap-1"}>
                    {suggestion.provenance.map((source) => (
                        <span key={`${source.channel}-${source.key ?? ""}`} title={source.detail}>
                            <Badge color={"zinc"}>
                                {t(`label.channel-${source.channel.replace(/_/g, "-")}`, {
                                    defaultValue: source.channel.replace(/_/g, " "),
                                })}
                            </Badge>
                        </span>
                    ))}
                    {suggestion.game_changer === true && <Badge color={"red"}>{t("label.game-changer")}</Badge>}
                </div>
            </div>
            {printing?.priceEur != null && (
                <span className={"shrink-0 text-xs text-zinc-500 tabular-nums dark:text-zinc-400"}>
                    {formatCurrency(printing.priceEur)}
                </span>
            )}
            <Button
                plain={true}
                disabled={busy || printing === undefined}
                onClick={onAdd}
                aria-label={t("accessibility.add-card", { name: suggestion.name })}
            >
                <PlusIcon />
            </Button>
        </div>
    );
}
