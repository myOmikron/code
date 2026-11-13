import { Badge, StackedListFlexRow, Text } from "components";
import { useTranslation } from "react-i18next";
import type { PhysicalStackResponse } from "src/api/generated";
import { FoilMark, conditionLabel, finishLabel } from "src/components/card-attribute-badge";
import { CardThumbnail } from "src/components/card-thumbnail";

/**
 * The properties for {@link DeckPhysicalStackRow}
 */
export type DeckPhysicalStackRowProps = {
    /** The stack lying in the Physical deck */
    stack: PhysicalStackResponse;
};

/**
 * One stack lying in a Physical deck, read only
 *
 * @returns the row
 */
export function DeckPhysicalStackRow({ stack }: DeckPhysicalStackRowProps) {
    const [t] = useTranslation("collection");
    const [tg] = useTranslation();
    const card = stack.card;

    return (
        <StackedListFlexRow className={"items-center gap-4"}>
            <CardThumbnail
                name={card?.name ?? ""}
                image={card?.image_small ?? null}
                finish={stack.finish}
                className={"h-20 shrink-0 rounded-lg sm:h-24"}
            />
            <div className={"flex min-w-0 flex-1 flex-col gap-1"}>
                <span className={"flex min-w-0 items-center gap-1.5"}>
                    <span className={"truncate font-medium text-zinc-950 dark:text-white"}>
                        {stack.quantity}× {card?.name ?? t("label.unknown-printing")}
                    </span>
                    <FoilMark finish={stack.finish} />
                </span>
                <Text className={"truncate text-xs"}>
                    {card != null && `${card.set_name} · `}
                    {conditionLabel(tg, stack.condition)} · {finishLabel(tg, stack.finish)}
                </Text>
                {stack.proxy && (
                    <span>
                        <Badge color={"zinc"}>{t("label.proxy")}</Badge>
                    </span>
                )}
            </div>
        </StackedListFlexRow>
    );
}
