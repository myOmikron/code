import { BookmarkIcon } from "@heroicons/react/20/solid";
import { Button, Dialog, DialogActions, DialogBody, DialogTitle } from "components";
import { useTranslation } from "react-i18next";
import { CardFinish } from "src/api/generated";
import type { CutCandidate, Suggestion } from "src/api/graph-generated";
import { CardThumbnail } from "src/components/card-thumbnail";
import { DeckAdvisorImpactBadges } from "src/components/deck-advisor-impact-badges";
import type { Room } from "src/utils/advisor-impact";
import { Printing } from "src/utils/scryfall";

/**
 * The properties for {@link DeckAdvisorRoomDialog}
 */
export type DeckAdvisorRoomDialogProps = {
    /** The card going in, `null` while closed */
    add: Suggestion | null;
    /** The cuts that make room without making anything worse */
    options: Array<Room<CutCandidate>>;
    /** One fact per cut, keyed by oracle id */
    facts: Record<string, string>;
    /** Resolved card data by name */
    cards: Map<string, Printing>;
    /** Theme id to label */
    themeLabels: Record<string, string>;
    /** Whether a swap is in flight */
    busy: boolean;
    onSwap: (cut: CutCandidate, add: Suggestion) => void;
    onMaybe: (add: Suggestion) => void;
    onClose: () => void;
};

/**
 * The second step of adding to a full deck: which card goes out for it.
 *
 * @returns the dialog
 */
export function DeckAdvisorRoomDialog({
    add,
    options,
    facts,
    cards,
    themeLabels,
    busy,
    onSwap,
    onMaybe,
    onClose,
}: DeckAdvisorRoomDialogProps) {
    const [t] = useTranslation("advisor");
    const going = add === null ? undefined : cards.get(add.name);

    return (
        <Dialog open={add !== null} onClose={onClose} size={"xl"}>
            {add !== null && (
                <>
                    <div className={"flex items-center gap-4"}>
                        <CardThumbnail
                            name={add.name}
                            image={going?.largeImageUrl ?? null}
                            thumbnail={going?.imageUrl ?? null}
                            sizes={"56px"}
                            finish={CardFinish.Nonfoil}
                            className={"w-14 shrink-0 rounded-sm"}
                        />
                        <DialogTitle>{t("heading.make-room", { name: add.name })}</DialogTitle>
                    </div>
                    <DialogBody>
                        {options.length === 0 ? (
                            <p className={"text-sm text-zinc-500 dark:text-zinc-400"}>{t("description.no-room")}</p>
                        ) : (
                            <ul className={"flex flex-col gap-2"}>
                                {options.map(({ cut, badges }) => {
                                    const printing = cards.get(cut.name);
                                    return (
                                        <li
                                            key={cut.oracle_id}
                                            className={
                                                "grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-(--radius-control) p-2.5 ring-1 ring-zinc-950/10 transition hover:bg-lime-400/10 hover:ring-lime-600/40 dark:ring-white/10 dark:hover:ring-lime-300/40"
                                            }
                                        >
                                            <CardThumbnail
                                                name={cut.name}
                                                image={printing?.largeImageUrl ?? null}
                                                thumbnail={printing?.imageUrl ?? null}
                                                sizes={"44px"}
                                                finish={CardFinish.Nonfoil}
                                                className={"w-11 rounded-sm opacity-75 grayscale-[60%]"}
                                            />
                                            <div className={"flex min-w-0 flex-col gap-1"}>
                                                <span
                                                    className={
                                                        "truncate text-sm/6 font-medium text-zinc-950 dark:text-white"
                                                    }
                                                >
                                                    {cut.name}
                                                </span>
                                                {facts[cut.oracle_id] !== undefined && (
                                                    <span
                                                        className={
                                                            "line-clamp-1 text-xs/5 text-zinc-500 dark:text-zinc-400"
                                                        }
                                                    >
                                                        {facts[cut.oracle_id]}
                                                    </span>
                                                )}
                                                <DeckAdvisorImpactBadges
                                                    badges={badges}
                                                    themeLabels={themeLabels}
                                                    max={5}
                                                />
                                            </div>
                                            <Button color={"lime"} disabled={busy} onClick={() => onSwap(cut, add)}>
                                                {t("button.swap")}
                                            </Button>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </DialogBody>
                    <DialogActions>
                        <Button plain onClick={() => onMaybe(add)} className={"sm:mr-auto"}>
                            <BookmarkIcon />
                            {t("button.maybe-instead")}
                        </Button>
                        <Button outline onClick={onClose}>
                            {t("button.cancel")}
                        </Button>
                    </DialogActions>
                </>
            )}
        </Dialog>
    );
}
