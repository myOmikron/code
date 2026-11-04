import { XMarkIcon } from "@heroicons/react/20/solid";
import { Button, Strong, Subheading, Text } from "components";
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
    /** Takes a deck and its cards off */
    onDropDeck: (uuid: string) => void;
};

/**
 * Names one deck on a proxy list.
 *
 * @returns the row
 */
export function ProxyGroupRow({ group, count, level, onDropDeck }: ProxyGroupRowProps) {
    const [t] = useTranslation("game-utils");
    const { deck } = group;
    const name = deck?.name ?? t("label.hand-picked");

    return (
        <div className={"flex items-center gap-2"}>
            {level === undefined ? (
                <Strong className={"min-w-0 truncate text-sm"}>{name}</Strong>
            ) : (
                <Subheading level={level} className={"min-w-0 truncate"}>
                    {name}
                </Subheading>
            )}
            <Text className={"ml-auto shrink-0 text-xs"}>{t("label.card-count", { count })}</Text>
            {deck !== null && (
                <Button
                    plain={true}
                    aria-label={t("accessibility.drop-deck", { name: deck.name })}
                    onClick={() => onDropDeck(deck.uuid)}
                >
                    <XMarkIcon />
                </Button>
            )}
        </div>
    );
}
