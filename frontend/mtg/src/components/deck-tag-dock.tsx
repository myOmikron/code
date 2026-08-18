import { Cog6ToothIcon } from "@heroicons/react/20/solid";
import { useTranslation } from "react-i18next";
import type { DeckTagResponse } from "src/api/generated";
import { DeckTagMarker } from "src/components/deck-tag-marker";

/** How many tags already answer to a number shortcut in the deck builder */
const KEYED_TAGS = 9;

/** The properties for {@link DeckTagDock} */
export type DeckTagDockProps = {
    /** Every tag available in this deck, in shortcut order */
    tags: Array<DeckTagResponse>;
    /** Opens the dialog where tags are created and changed */
    onManage: () => void;
};

/**
 * A persistent legend for the deck's tag colours and keyboard shortcuts.
 *
 * It floats at the bottom of the viewport so the shortcut mapping stays in
 * sight while the pointer moves down a long deck. More than nine tags remain
 * visible but carry no key, matching the actual shortcut handler.
 *
 * @returns the dock, or nothing before the deck has tags
 */
export function DeckTagDock({ tags, onManage }: DeckTagDockProps) {
    const [t] = useTranslation("deck");

    if (tags.length === 0) return null;

    return (
        <aside
            aria-label={t("label.tags")}
            className={
                "pointer-events-none fixed inset-x-0 bottom-0 z-40 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:px-4"
            }
        >
            <div
                className={
                    "pointer-events-auto mx-auto flex w-fit max-w-full items-center gap-1.5 rounded-2xl border border-zinc-950/15 bg-zinc-200/90 p-1.5 shadow-(--shadow-card-lg) backdrop-blur-xl dark:border-white/15 dark:bg-zinc-800/90"
                }
            >
                <button
                    type={"button"}
                    onClick={onManage}
                    title={t("button.manage-tags")}
                    className={
                        "flex shrink-0 items-center gap-2 rounded-xl px-2 py-1.5 text-xs font-medium text-zinc-600 transition hover:bg-white/60 hover:text-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-950/40 dark:hover:text-white"
                    }
                >
                    <Cog6ToothIcon className={"size-4"} />
                    <span className={"max-sm:sr-only"}>{t("button.manage-tags")}</span>
                    <ShortcutKey value={"T"} />
                </button>

                <span className={"h-6 w-px shrink-0 bg-zinc-950/10 dark:bg-white/15"} aria-hidden={true} />

                <ul className={"flex min-w-0 items-center gap-1.5 overflow-x-auto overscroll-x-contain"}>
                    {tags.map((tag, index) => (
                        <li
                            key={tag.uuid}
                            className={
                                "flex shrink-0 items-center gap-2 rounded-xl bg-white/65 px-2.5 py-1.5 text-xs font-medium text-zinc-700 ring-1 ring-zinc-950/5 dark:bg-zinc-950/40 dark:text-zinc-200 dark:ring-white/10"
                            }
                        >
                            <DeckTagMarker color={tag.color} icon={tag.icon} size={"md"} />
                            <span>{tag.name}</span>
                            {index < KEYED_TAGS && <ShortcutKey value={String(index + 1)} />}
                        </li>
                    ))}
                </ul>
            </div>
        </aside>
    );
}

/** The properties for one key cap */
type ShortcutKeyProps = {
    /** The keyboard key printed on it */
    value: string;
};

/**
 * One small key cap in the dock
 *
 * @returns the key cap
 */
function ShortcutKey({ value }: ShortcutKeyProps) {
    return <kbd className={"font-sans text-xs font-normal text-zinc-400 dark:text-zinc-500"}>{value}</kbd>;
}
