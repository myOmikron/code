import { Badge, Button, Dialog, DialogActions, DialogBody, DialogTitle, Strong, Text } from "components";
import { ArrowTopRightOnSquareIcon } from "@heroicons/react/20/solid";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ManaCost } from "src/components/mana-cost";
import { formatCurrency } from "src/utils/format";
import type { Printing } from "src/utils/scryfall";

/**
 * The properties for {@link CardDetailDialog}
 */
export type CardDetailDialogProps = {
    /** The printing to show, or `null` to keep the dialog closed */
    printing: Printing | null;
    /** Rows shown below the card, e.g. how many copies are filed and in what shape */
    details?: Array<{ label: string; value: ReactNode }>;
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
export function CardDetailDialog({ printing, details = [], onClose }: CardDetailDialogProps) {
    const [t] = useTranslation("collection");
    const [tg] = useTranslation();

    return (
        <Dialog open={printing !== null} onClose={onClose} size={"2xl"}>
            {printing !== null && (
                <>
                    <DialogTitle className={"flex items-center justify-between gap-3"}>
                        <span className={"min-w-0 truncate"}>{printing.name}</span>
                        {printing.manaCost !== "" && <ManaCost value={printing.manaCost} />}
                    </DialogTitle>
                    <DialogBody>
                        <div className={"flex flex-col gap-5 sm:flex-row"}>
                            {printing.largeImageUrl !== null && (
                                <img
                                    src={printing.largeImageUrl}
                                    alt={printing.name}
                                    className={"w-full shrink-0 self-start rounded-xl sm:w-64"}
                                />
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
                                    {printing.priceEur !== null && (
                                        <Badge color={"green"}>{formatCurrency(printing.priceEur)}</Badge>
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

                                {printing.scryfallUrl !== "" && (
                                    // A plain anchor, not `TextLink` — that one is typed against the
                                    // app's own route table and cannot take an external url.
                                    <a
                                        href={printing.scryfallUrl}
                                        target={"_blank"}
                                        rel={"noreferrer"}
                                        className={
                                            "inline-flex items-center gap-1 self-start text-sm text-zinc-950 underline decoration-zinc-950/50 hover:decoration-zinc-950 dark:text-white dark:decoration-white/50 dark:hover:decoration-white"
                                        }
                                    >
                                        {t("button.open-on-scryfall")}
                                        <ArrowTopRightOnSquareIcon className={"size-4"} />
                                    </a>
                                )}
                            </div>
                        </div>
                    </DialogBody>
                    <DialogActions>
                        <Button plain onClick={onClose}>
                            {tg("button.close")}
                        </Button>
                    </DialogActions>
                </>
            )}
        </Dialog>
    );
}
