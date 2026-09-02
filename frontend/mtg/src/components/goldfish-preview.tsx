import { Strong, Text } from "components";
import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import { ManaCost } from "src/components/mana-cost";
import type { GoldfishCard } from "src/utils/goldfish";
import { largerScan } from "src/utils/card-artwork";

/**
 * The properties for {@link GoldfishPreview}
 */
export type GoldfishPreviewProps = {
    /** The card the pointer is on, `null` while it is on none */
    card: GoldfishCard | null;
};

/**
 * The card under the pointer, big enough to read.
 *
 * The table draws cards small so a board fits on screen, and the rules text
 * is unreadable at that size. This column shows whichever card the pointer
 * rests on, in the same corner every time.
 *
 * @returns the preview
 */
export function GoldfishPreview({ card }: GoldfishPreviewProps) {
    const [t] = useTranslation("goldfish");

    if (card === null) {
        return (
            <div className={"flex flex-col gap-3"}>
                <div
                    className={
                        "flex aspect-5/7 w-full items-center justify-center rounded-2xl border border-dashed border-zinc-300 p-6 text-center dark:border-zinc-700"
                    }
                >
                    <Text>{t("description.preview-empty")}</Text>
                </div>
                <Shortcuts
                    rows={[
                        ["D", t("button.draw")],
                        ["N", t("button.next-turn")],
                        ["U", t("button.untap-all")],
                        ["T", t("button.token")],
                        ["L", t("button.look-library")],
                        ["?", t("button.shortcuts")],
                    ]}
                />
            </div>
        );
    }

    const image = card.flipped ? card.backImage : card.image;
    const counters = Object.entries(card.counters);
    const rows: Array<[string, string]> = [];
    if (card.zone === "battlefield") {
        rows.push(["␣", card.tapped ? t("button.untap") : t("button.tap")], ["C", t("button.counters")]);
    }
    if (card.zone !== "battlefield" && !card.token) rows.push(["P", t("button.to-battlefield")]);
    if (card.zone !== "hand" && !card.token) rows.push(["H", t("button.to-hand")]);
    if (card.zone !== "graveyard") rows.push(["G", card.token ? t("button.remove-token") : t("button.to-graveyard")]);
    if (card.zone !== "exile" && !card.token) rows.push(["X", t("button.to-exile")]);
    if (!card.token) rows.push(["O", t("button.to-library-top")], ["B", t("button.to-library-bottom")]);
    if (card.zone !== "command" && !card.token) rows.push(["K", t("button.to-command")]);
    if (card.backImage !== null) rows.push(["F", t("button.flip")]);
    if (card.zone === "battlefield") rows.push(["V", t("button.copy")]);
    rows.push(["Z", t("button.zoom")]);

    return (
        <div
            className={
                "flex flex-col gap-3 transition duration-300 ease-out starting:-translate-x-6 starting:opacity-0"
            }
        >
            <div
                className={
                    "flex flex-col gap-2 rounded-2xl bg-(--surface-card) p-2 shadow-2xl ring-1 ring-zinc-950/10 dark:ring-white/10"
                }
            >
                <div className={"aspect-5/7 w-full overflow-hidden rounded-xl bg-zinc-800"}>
                    {image !== null && (
                        <img src={largerScan(image)} alt={card.name} className={"size-full object-cover"} />
                    )}
                </div>
                <div className={"flex flex-col gap-2 px-1 pb-1"}>
                    <div className={"flex items-start justify-between gap-2"}>
                        <Strong className={"min-w-0 truncate text-sm"}>{card.name}</Strong>
                        {card.manaCost !== "" && <ManaCost value={card.manaCost} className={"shrink-0"} />}
                    </div>
                    {card.typeLine !== "" && <Text className={"truncate text-xs"}>{card.typeLine}</Text>}
                    {(card.tapped || card.token || counters.length > 0) && (
                        <div className={"flex flex-wrap items-center gap-1.5"}>
                            {card.token && <Chip>{t("label.token")}</Chip>}
                            {card.tapped && <Chip>{t("label.tapped")}</Chip>}
                            {counters.map(([kind, value]) => (
                                <Chip key={kind}>{`${value}× ${kind}`}</Chip>
                            ))}
                        </div>
                    )}
                </div>
            </div>
            <Shortcuts rows={rows} />
        </div>
    );
}

/**
 * The keys that act on what is shown, two to a line
 *
 * @param props the rows
 * @param props.rows key and what it does
 *
 * @returns the list
 */
function Shortcuts({ rows }: { rows: Array<[string, string]> }) {
    return (
        <dl className={"grid grid-cols-[auto_1fr_auto_1fr] items-baseline gap-x-2 gap-y-1 px-1"}>
            {rows.map(([keys, description]) => (
                <Fragment key={keys}>
                    <dt>
                        <kbd
                            className={
                                "inline-block min-w-5 rounded-sm bg-zinc-950/5 px-1 text-center font-sans text-[11px]/4 text-zinc-600 ring-1 ring-zinc-950/10 dark:bg-white/10 dark:text-zinc-300 dark:ring-white/15"
                            }
                        >
                            {keys}
                        </kbd>
                    </dt>
                    <dd className={"truncate text-[11px]/4 text-zinc-500 dark:text-zinc-400"}>{description}</dd>
                </Fragment>
            ))}
        </dl>
    );
}

/**
 * One fact about the card
 *
 * @param props what the chip says
 * @param props.children the text
 *
 * @returns the chip
 */
function Chip({ children }: { children: string }) {
    return (
        <span
            className={
                "rounded-(--radius-pill) bg-zinc-950/5 px-2 py-0.5 text-xs font-medium text-zinc-600 tabular-nums dark:bg-white/10 dark:text-zinc-300"
            }
        >
            {children}
        </span>
    );
}
