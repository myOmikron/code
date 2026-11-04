import { ChevronRightIcon, XMarkIcon } from "@heroicons/react/20/solid";
import clsx from "clsx";
import { Button, Strong, Subheading } from "components";
import { useTranslation } from "react-i18next";
import type { ProxyGroup } from "src/utils/proxy-list";

/**
 * The properties for {@link ProxyGroupRow}
 */
export type ProxyGroupRowProps = {
    /** The group */
    group: ProxyGroup;
    /** How many cards of it go out, as the page counts them */
    count: number;
    /** The heading level, left out for a plain row */
    level?: 2 | 4;
    /** Whether its cards are showing, for a row that folds them */
    open?: boolean;
    /** Folds or unfolds its cards, left out for a row that does not */
    onToggle?: () => void;
    /** Takes the group and its cards off, `null` for the hand picks */
    onDropDeck: (uuid: string | null) => void;
};

/**
 * Names one group on a proxy list.
 *
 * @returns the row
 */
export function ProxyGroupRow({ group, count, level, open = false, onToggle, onDropDeck }: ProxyGroupRowProps) {
    const [t] = useTranslation("game-utils");
    const { deck } = group;
    const name = deck?.name ?? t("label.hand-picked");

    const label = <span className={"min-w-0 flex-1 truncate"}>{name}</span>;
    const counted = (
        <span className={"shrink-0 text-xs font-normal text-zinc-500 tabular-nums dark:text-zinc-400"}>
            {t("label.card-count", { count })}
        </span>
    );
    const text =
        onToggle === undefined ? (
            <span className={"flex min-w-0 flex-1 items-center gap-2"}>
                {label}
                {counted}
            </span>
        ) : (
            <button
                type={"button"}
                aria-expanded={open}
                onClick={onToggle}
                className={"flex min-h-11 w-full min-w-0 items-center gap-2 text-left"}
            >
                <ChevronRightIcon
                    aria-hidden={true}
                    className={clsx(
                        "size-4 shrink-0 text-zinc-500 transition-transform dark:text-zinc-400",
                        open && "rotate-90",
                    )}
                />
                {label}
                {counted}
            </button>
        );

    return (
        <div className={"flex items-center gap-2"}>
            {level === undefined ? (
                <Strong className={"flex min-w-0 flex-1 items-center text-sm"}>{text}</Strong>
            ) : (
                <Subheading level={level} className={"flex min-w-0 flex-1 items-center"}>
                    {text}
                </Subheading>
            )}
            <Button
                plain={true}
                aria-label={t("accessibility.drop-deck", { name })}
                onClick={() => onDropDeck(deck?.uuid ?? null)}
            >
                <XMarkIcon />
            </Button>
        </div>
    );
}
