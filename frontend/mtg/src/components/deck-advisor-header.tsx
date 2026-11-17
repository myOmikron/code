import { FlagIcon, HandRaisedIcon, RectangleStackIcon } from "@heroicons/react/20/solid";
import { Badge, Button } from "components";
import { useTranslation } from "react-i18next";
import { QuietButton } from "src/components/quiet-button";

/**
 * The properties for {@link DeckAdvisorHeader}
 */
export type DeckAdvisorHeaderProps = {
    /** Cards in the main deck and command zone */
    count: number;
    /** The size the deck is built to */
    target: number | null;
    /** What the advice stands on, already joined into one line */
    goals: string;
    onOpenGoals: () => void;
    onFill: () => void;
    /** Open card swiping */
    onSwipe: () => void;
};

/**
 * The advisor's one header, the same in every state of the deck: how full
 * it is, what the advice stands on, and Fill while it is short.
 *
 * @returns the header row
 */
export function DeckAdvisorHeader({ count, target, goals, onOpenGoals, onFill, onSwipe }: DeckAdvisorHeaderProps) {
    const [t] = useTranslation("advisor");
    const diff = target === null ? 0 : count - target;
    const share = target === null || target === 0 ? 1 : Math.min(1, count / target);

    return (
        <div className={"flex flex-wrap items-center justify-between gap-4"}>
            <div className={"flex items-center gap-4"}>
                <span className={"text-3xl/8 font-semibold tracking-tight text-zinc-950 tabular-nums dark:text-white"}>
                    {count}
                    {target !== null && (
                        <span className={"text-base font-medium text-zinc-500 dark:text-zinc-400"}> / {target}</span>
                    )}
                </span>
                {target !== null && (
                    <span
                        className={
                            "hidden h-1.5 w-36 overflow-hidden rounded-full bg-zinc-950/10 sm:block dark:bg-white/10"
                        }
                        role={"progressbar"}
                        aria-valuemin={0}
                        aria-valuemax={target}
                        aria-valuenow={count}
                        aria-label={t("accessibility.deck-count")}
                    >
                        <span
                            className={
                                diff > 0
                                    ? "block h-full rounded-full bg-amber-500 transition-[width]"
                                    : "block h-full rounded-full bg-(--color-accent) transition-[width]"
                            }
                            style={{ width: `${share * 100}%` }}
                        />
                    </span>
                )}
                {target !== null && (
                    <Badge color={diff < 0 ? "zinc" : diff > 0 ? "amber" : "lime"}>
                        {diff < 0
                            ? t("label.count-to-go", { count: -diff })
                            : diff > 0
                              ? t("label.count-over", { count: diff })
                              : t("label.count-complete")}
                    </Badge>
                )}
            </div>
            <div className={"flex min-w-0 flex-wrap items-center gap-3"}>
                <QuietButton onClick={onOpenGoals} className={"max-w-full"}>
                    <FlagIcon className={"size-3.5 shrink-0"} />
                    <span className={"truncate"}>{goals}</span>
                </QuietButton>
                {diff < 0 && (
                    <Button outline onClick={onSwipe}>
                        <HandRaisedIcon />
                        {t("button.swipe")}
                    </Button>
                )}
                {diff < 0 && (
                    <Button outline onClick={onFill}>
                        <RectangleStackIcon />
                        {t("button.fill-count", { count: -diff })}
                    </Button>
                )}
            </div>
        </div>
    );
}
