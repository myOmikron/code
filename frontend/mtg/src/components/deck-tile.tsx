import {
    EllipsisHorizontalIcon,
    GlobeAltIcon,
    LinkIcon,
    LockClosedIcon,
    PencilSquareIcon,
    TrashIcon,
} from "@heroicons/react/20/solid";
import { Link } from "@tanstack/react-router";
import {
    Dropdown,
    DropdownButton,
    DropdownDivider,
    DropdownItem,
    DropdownLabel,
    DropdownMenu,
    DropdownSection,
    DropdownHeading,
} from "components";
import type { ComponentType } from "react";
import { useTranslation } from "react-i18next";
import { Visibility } from "src/api/generated";
import type { DeckOverviewResponse, FormatRulesResponse } from "src/api/generated";
import { useDeckLabels } from "src/components/deck-labels";
import { ManaCost } from "src/components/mana-cost";
import { letters } from "src/utils/deck-rules";
import { formatCurrency } from "src/utils/format";

/** What each visibility is drawn with */
const VISIBILITY_ICON: Record<Visibility, ComponentType<{ className?: string }>> = {
    Public: GlobeAltIcon,
    Unlisted: LinkIcon,
    Private: LockClosedIcon,
};

/** The menu's order, from closed to open */
const VISIBILITY_ORDER: Array<Visibility> = [Visibility.Private, Visibility.Unlisted, Visibility.Public];

/** What each colour looks like, for the decks that have no artwork to show */
const COLOR_HEX: Record<string, string> = {
    W: "#f5e9c8",
    U: "#1b6ca8",
    B: "#2b2b31",
    R: "#c8352c",
    G: "#1f7a4d",
};

/**
 * The properties for {@link DeckTile}
 */
export type DeckTileProps = {
    /** The deck and what was read about it */
    overview: DeckOverviewResponse;
    /** The rules of its format, missing for a format the service dropped */
    rules: FormatRulesResponse | undefined;
    /** Records a different visibility */
    onChangeVisibility: (deck: DeckOverviewResponse, visibility: Visibility) => void;
    /** Opens the share dialog */
    onShare: (deck: DeckOverviewResponse) => void;
    /** Opens the edit dialog */
    onEdit: (deck: DeckOverviewResponse) => void;
    /** Asks to throw the deck away */
    onDelete: (deck: DeckOverviewResponse) => void;
    /** Whether keyboard navigation currently points at this deck */
    selected?: boolean;
    /** Records pointer or focus arriving on this deck */
    onActivate?: () => void;
};

/**
 * One deck, led by the face at the head of it.
 *
 * A deck is recognised by its commander long before its name is read, so the
 * artwork is the tile and everything else sits on top of it. Decks without a
 * commander get a band mixed from the colours they may play, which is the next
 * best thing to a face.
 *
 * @returns the tile
 */
export function DeckTile({
    overview,
    rules,
    onChangeVisibility,
    onShare,
    onEdit,
    onDelete,
    selected = false,
    onActivate,
}: DeckTileProps) {
    const [t] = useTranslation("deck");
    const labels = useDeckLabels();

    const deck = overview.deck;
    const commanders = overview.commanders;
    const arts = commanders
        .filter((commander) => commander.image_normal != null || commander.image_small != null)
        .slice(0, 2);
    const colors = deckColors(overview);
    const target = rules?.deck_size.cards ?? null;
    const done = target !== null && overview.cards >= target;
    const VisibilityIcon = VISIBILITY_ICON[deck.visibility];
    const visibilityName: Record<Visibility, string> = {
        Public: t("label.visibility-public"),
        Unlisted: t("label.visibility-unlisted"),
        Private: t("label.visibility-private"),
    };

    return (
        <li
            onMouseEnter={onActivate}
            className={
                selected
                    ? "group/deck relative flex flex-col overflow-hidden rounded-(--radius-card) bg-(--surface-card) shadow-(--shadow-card) ring-2 ring-(--color-brand-500) transition"
                    : "group/deck relative flex flex-col overflow-hidden rounded-(--radius-card) bg-(--surface-card) shadow-(--shadow-card-sm) ring-1 ring-zinc-950/5 transition hover:shadow-(--shadow-card) hover:ring-zinc-950/10 dark:ring-white/10 dark:hover:ring-white/20"
            }
        >
            <Link
                to={"/decks/$deckUuid/cards"}
                params={{ deckUuid: deck.uuid }}
                className={"block focus:outline-none"}
                aria-label={deck.name}
                onFocus={onActivate}
            >
                <div className={"relative h-32 overflow-hidden sm:h-36"}>
                    {arts.length > 1 ? (
                        <>
                            <span
                                className={
                                    "group/commander absolute inset-0 [clip-path:polygon(0_0,52%_0,48%_100%,0_100%)]"
                                }
                            >
                                <img
                                    src={arts[0]?.image_normal ?? arts[0]?.image_small ?? ""}
                                    crossOrigin={"anonymous"}
                                    alt={""}
                                    loading={"lazy"}
                                    className={
                                        "absolute inset-y-0 left-0 h-full w-[54%] object-cover object-[center_22%] transition duration-500 group-hover/commander:scale-105 group-active/commander:scale-105"
                                    }
                                />
                            </span>
                            <span
                                className={
                                    "group/commander absolute inset-0 [clip-path:polygon(52%_0,100%_0,100%_100%,48%_100%)]"
                                }
                            >
                                <img
                                    src={arts[1]?.image_normal ?? arts[1]?.image_small ?? ""}
                                    crossOrigin={"anonymous"}
                                    alt={""}
                                    loading={"lazy"}
                                    className={
                                        "absolute inset-y-0 right-0 h-full w-[54%] object-cover object-[center_22%] transition duration-500 group-hover/commander:scale-105 group-active/commander:scale-105"
                                    }
                                />
                            </span>
                            <svg
                                aria-hidden={true}
                                viewBox={"0 0 100 100"}
                                preserveAspectRatio={"none"}
                                className={
                                    "pointer-events-none absolute inset-0 z-1 h-full w-full overflow-visible text-white/75 drop-shadow-[0_0_3px_rgba(0,0,0,0.8)]"
                                }
                            >
                                <line
                                    x1={52}
                                    y1={0}
                                    x2={48}
                                    y2={100}
                                    stroke={"currentColor"}
                                    strokeWidth={2}
                                    vectorEffect={"non-scaling-stroke"}
                                />
                            </svg>
                        </>
                    ) : arts.length === 1 ? (
                        <img
                            src={arts[0]?.image_normal ?? arts[0]?.image_small ?? ""}
                            crossOrigin={"anonymous"}
                            alt={""}
                            loading={"lazy"}
                            className={
                                "h-full w-full object-cover object-[center_22%] transition duration-500 group-hover/deck:scale-105"
                            }
                        />
                    ) : (
                        <div className={"h-full w-full"} style={{ backgroundImage: colorBand(colors) }} />
                    )}

                    <div
                        className={
                            "pointer-events-none absolute inset-0 bg-linear-to-t from-zinc-950/90 via-zinc-950/35 to-zinc-950/5"
                        }
                    />

                    {colors.length > 0 && (
                        <span
                            className={
                                "pointer-events-none absolute top-3 left-3 rounded-(--radius-pill) bg-zinc-950/55 px-1.5 py-1"
                            }
                        >
                            <ManaCost value={colors.map((color) => `{${color}}`).join("")} />
                        </span>
                    )}

                    <div className={"pointer-events-none absolute inset-x-4 bottom-3 flex flex-col"}>
                        <span className={"truncate text-base font-semibold text-white"}>{deck.name}</span>
                        <span className={"truncate text-xs text-white/75"}>
                            {commanders.length > 0
                                ? commanders.map((commander) => commander.name).join(" & ")
                                : labels.format(deck.format)}
                        </span>
                    </div>
                </div>
            </Link>

            <div className={"flex items-center gap-3 px-4 py-3"}>
                <span className={"flex min-w-0 flex-1 flex-col gap-1.5"}>
                    <span className={"flex items-baseline gap-1.5 text-xs text-zinc-500 dark:text-zinc-400"}>
                        <span
                            className={
                                done
                                    ? "font-semibold text-(--color-success) tabular-nums"
                                    : "font-semibold text-zinc-950 tabular-nums dark:text-white"
                            }
                        >
                            {overview.cards}
                        </span>
                        {target !== null && <span className={"tabular-nums"}>/ {target}</span>}
                        <span className={"truncate"}>{t("label.total-cards")}</span>
                        {overview.price_eur_cents > 0 && (
                            <span className={"ml-auto shrink-0 tabular-nums"}>
                                {formatCurrency(overview.price_eur_cents / 100)}
                            </span>
                        )}
                    </span>
                    <span className={"h-1 w-full overflow-hidden rounded-full bg-zinc-950/5 dark:bg-white/10"}>
                        <span
                            className={done ? "block h-full bg-(--color-success)" : "block h-full bg-(--color-accent)"}
                            style={{ width: `${filled(overview.cards, target)}%` }}
                        />
                    </span>
                </span>

                {deck.bracket != null && (
                    <span
                        className={
                            "shrink-0 rounded-(--radius-pill) bg-zinc-950/5 px-2 py-0.5 text-xs font-medium text-zinc-600 tabular-nums dark:bg-white/10 dark:text-zinc-300"
                        }
                        title={t("label.bracket")}
                    >
                        {`B${deck.bracket}`}
                    </span>
                )}
            </div>

            <Dropdown>
                <DropdownButton
                    as={"button"}
                    type={"button"}
                    aria-label={t("button.deck-actions")}
                    className={
                        "absolute top-2 right-2 rounded-full bg-zinc-950/55 p-1 text-white opacity-0 transition group-focus-within/deck:opacity-100 group-hover/deck:opacity-100 hover:bg-zinc-950/75 focus:opacity-100"
                    }
                >
                    <EllipsisHorizontalIcon className={"size-5"} />
                </DropdownButton>
                <DropdownMenu anchor={"bottom end"}>
                    <DropdownItem onClick={() => onShare(overview)}>
                        <LinkIcon />
                        <DropdownLabel>{t("button.share-deck")}</DropdownLabel>
                    </DropdownItem>
                    <DropdownItem onClick={() => onEdit(overview)}>
                        <PencilSquareIcon />
                        <DropdownLabel>{t("button.edit-deck")}</DropdownLabel>
                    </DropdownItem>
                    <DropdownDivider />
                    <DropdownSection>
                        <DropdownHeading>{t("label.visibility")}</DropdownHeading>
                        {VISIBILITY_ORDER.map((visibility) => {
                            const Icon = VISIBILITY_ICON[visibility];
                            return (
                                <DropdownItem key={visibility} onClick={() => onChangeVisibility(overview, visibility)}>
                                    <Icon />
                                    <DropdownLabel>{visibilityName[visibility]}</DropdownLabel>
                                </DropdownItem>
                            );
                        })}
                    </DropdownSection>
                    <DropdownDivider />
                    <DropdownItem onClick={() => onDelete(overview)}>
                        <TrashIcon />
                        <DropdownLabel>{t("button.delete-deck")}</DropdownLabel>
                    </DropdownItem>
                </DropdownMenu>
            </Dropdown>

            <span
                className={"absolute top-2 left-2 rounded-full bg-zinc-950/55 p-1 text-white"}
                title={visibilityName[deck.visibility]}
            >
                <VisibilityIcon className={"size-3.5"} />
            </span>
        </li>
    );
}

/**
 * The colours a deck plays
 *
 * @param overview the deck and its commanders
 *
 * @returns the letters, the override where one is set
 */
export function deckColors(overview: DeckOverviewResponse): Array<string> {
    if (overview.deck.allowed_color_identity != null) return letters(overview.deck.allowed_color_identity);
    return letters(overview.commanders.map((commander) => commander.color_identity).join(""));
}

/**
 * A band mixed from the colours a deck plays
 *
 * @param colors the letters
 *
 * @returns a css gradient, grey for a deck that plays none
 */
function colorBand(colors: Array<string>): string {
    const stops = colors.map((color) => COLOR_HEX[color] ?? "#52525b");
    if (stops.length === 0) return "linear-gradient(135deg, #52525b, #27272a)";
    if (stops.length === 1) return `linear-gradient(135deg, ${stops[0]}, #27272a)`;
    return `linear-gradient(135deg, ${stops.join(", ")})`;
}

/**
 * How much of the bar under a deck is filled
 *
 * @param cards how many cards it holds
 * @param target how many the format wants, `null` when it names no number
 *
 * @returns the percentage
 */
function filled(cards: number, target: number | null): number {
    if (target === null || target === 0) return cards > 0 ? 100 : 0;
    return Math.min(100, Math.round((cards / target) * 100));
}
