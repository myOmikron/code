import { CheckIcon, Cog6ToothIcon, TagIcon } from "@heroicons/react/20/solid";
import clsx from "clsx";
import {
    Badge,
    Dropdown,
    DropdownButton,
    DropdownDivider,
    DropdownItem,
    DropdownLabel,
    DropdownMenu,
    DropdownShortcut,
} from "components";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { DeckTagResponse } from "src/api/generated";
import { TAG_DOT, tagColor } from "src/utils/deck-tags";

/**
 * The properties for {@link DeckTagBadge}
 */
export type DeckTagBadgeProps = {
    /** The tag to draw */
    tag: DeckTagResponse;
};

/**
 * A tag as it is read on a card
 *
 * @returns the badge
 */
export function DeckTagBadge({ tag }: DeckTagBadgeProps) {
    return <Badge color={tagColor(tag.color)}>{tag.name}</Badge>;
}

/**
 * The properties for {@link DeckTagDots}
 */
export type DeckTagDotsProps = {
    /** The tags on the card */
    tags: Array<DeckTagResponse>;
};

/**
 * The tags of a card as coloured dots, for where a word does not fit
 *
 * @returns the dots
 */
export function DeckTagDots({ tags }: DeckTagDotsProps) {
    return (
        <span className={"flex items-center gap-0.5"} title={tags.map((tag) => tag.name).join(", ")}>
            {tags.map((tag) => (
                <span key={tag.uuid} className={clsx("size-2 rounded-full", TAG_DOT[tagColor(tag.color)])} />
            ))}
        </span>
    );
}

/**
 * The properties for {@link DeckTagPicker}
 */
export type DeckTagPickerProps = {
    /** Every tag that can go on this card */
    tags: Array<DeckTagResponse>;
    /** The ones on it, by id */
    assigned: Array<string>;
    /** Puts a tag on the card or takes it off */
    onToggle: (tag: DeckTagResponse, on: boolean) => void;
    /** Opens the tag manager, left out where there is nowhere to open it */
    onManage?: () => void;
    /** What the button shows, the tag icon when nothing is given */
    children?: ReactNode;
    /** Extra classes for the button */
    className?: string;
};

/**
 * The tags of one card, changed from where the card is.
 *
 * The menu stays open while tags are ticked: a card usually gets two or three
 * in one go, and re-opening the menu for each of them is three times the work
 * for the same result. The number beside each tag is the key that puts it on
 * whichever card the pointer is over, which is the way this is used once the
 * tags are known by heart.
 *
 * @returns the picker
 */
export function DeckTagPicker({ tags, assigned, onToggle, onManage, children, className }: DeckTagPickerProps) {
    const [t] = useTranslation("deck");

    return (
        <Dropdown>
            <DropdownButton
                as={"button"}
                type={"button"}
                aria-label={t("label.tags")}
                title={t("label.tags")}
                className={clsx(
                    "flex shrink-0 items-center gap-1 rounded-(--radius-pill) px-1.5 py-0.5 text-xs text-zinc-500 transition hover:bg-zinc-950/5 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white",
                    className,
                )}
            >
                {children ?? <TagIcon className={"size-4"} />}
            </DropdownButton>
            <DropdownMenu anchor={{ to: "bottom start", gap: 4, padding: 8 }} className={"min-w-56"}>
                {tags.length === 0 ? (
                    <DropdownItem disabled={true}>
                        <DropdownLabel>{t("label.no-tags")}</DropdownLabel>
                    </DropdownItem>
                ) : (
                    tags.map((tag, index) => (
                        <DropdownItem
                            key={tag.uuid}
                            onClick={(event) => {
                                // Keeps the menu open, which Headless UI leaves
                                // to whoever handles the click.
                                event.preventDefault();
                                onToggle(tag, !assigned.includes(tag.uuid));
                            }}
                        >
                            {assigned.includes(tag.uuid) ? <CheckIcon /> : <span className={"size-4"} />}
                            <DropdownLabel>
                                <span className={"flex items-center gap-2"}>
                                    <span className={clsx("size-2 rounded-full", TAG_DOT[tagColor(tag.color)])} />
                                    {tag.name}
                                </span>
                            </DropdownLabel>
                            {index < 9 && <DropdownShortcut keys={String(index + 1)} />}
                        </DropdownItem>
                    ))
                )}

                {onManage !== undefined && (
                    <>
                        <DropdownDivider />
                        <DropdownItem onClick={onManage}>
                            <Cog6ToothIcon />
                            <DropdownLabel>{t("button.manage-tags")}</DropdownLabel>
                            <DropdownShortcut keys={"T"} />
                        </DropdownItem>
                    </>
                )}
            </DropdownMenu>
        </Dropdown>
    );
}
