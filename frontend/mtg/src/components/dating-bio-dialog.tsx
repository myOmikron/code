import { Dialog, DialogBody, DialogTitle, Text } from "components";
import { useTranslation } from "react-i18next";
import type { DatingCardResponse } from "src/api/generated";
import { ManaCost } from "src/components/mana-cost";
import { manaSymbols } from "src/utils/dating";
import { formatCurrency } from "src/utils/format";

/**
 * The properties for {@link DatingBioDialog}
 */
export type DatingBioDialogProps = {
    /** The Commander shown, `null` while closed */
    card: DatingCardResponse | null;
    /** Close it */
    onClose: () => void;
};

/**
 * A Commander's bio: its rules text, popularity and price.
 *
 * @returns the dialog
 */
export function DatingBioDialog({ card, onClose }: DatingBioDialogProps) {
    const [t] = useTranslation("dating");

    return (
        <Dialog open={card !== null} onClose={onClose} size={"md"}>
            {card !== null && (
                <>
                    <DialogTitle className={"flex items-center justify-between gap-3"}>
                        <span>{card.name}</span>
                        {card.color_identity !== "" && <ManaCost value={manaSymbols(card.color_identity)} />}
                    </DialogTitle>
                    <DialogBody className={"flex flex-col gap-4"}>
                        <Text className={"text-xs"}>{card.type_line}</Text>
                        <p
                            className={
                                "rounded-(--radius-control) bg-zinc-100 px-3 py-2.5 text-sm/6 whitespace-pre-line text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200"
                            }
                        >
                            {card.oracle_text}
                        </p>
                        <dl className={"grid grid-cols-2 gap-2"}>
                            <div className={"rounded-(--radius-control) bg-zinc-100 p-3 dark:bg-zinc-800"}>
                                <dt className={"text-xs text-zinc-500 dark:text-zinc-400"}>{t("label.edhrec-rank")}</dt>
                                <dd className={"font-bold text-zinc-950 dark:text-white"}>
                                    {card.edhrec_rank != null ? `#${card.edhrec_rank}` : "–"}
                                </dd>
                            </div>
                            <div className={"rounded-(--radius-control) bg-zinc-100 p-3 dark:bg-zinc-800"}>
                                <dt className={"text-xs text-zinc-500 dark:text-zinc-400"}>
                                    {t("label.commander-price")}
                                </dt>
                                <dd className={"font-bold text-zinc-950 dark:text-white"}>
                                    {card.price_eur != null ? formatCurrency(card.price_eur) : "–"}
                                </dd>
                            </div>
                        </dl>
                        <div className={"flex flex-col gap-2"}>
                            <Text className={"text-xs font-semibold uppercase"}>{t("heading.interests")}</Text>
                            <div className={"flex flex-wrap gap-1.5"}>
                                {card.interests.map((interest) => (
                                    <span
                                        key={interest.label}
                                        className={
                                            "rounded-full bg-zinc-100 px-2.5 py-1 text-sm font-semibold text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100"
                                        }
                                    >
                                        {interest.label}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </DialogBody>
                </>
            )}
        </Dialog>
    );
}
