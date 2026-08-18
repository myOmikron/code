import { CheckIcon, PencilSquareIcon, PlusIcon, SparklesIcon, TrashIcon, XMarkIcon } from "@heroicons/react/20/solid";
import clsx from "clsx";
import {
    Button,
    Dialog,
    DialogActions,
    DialogBody,
    DialogDescription,
    DialogTitle,
    Input,
    Label,
    Strong,
    Switch,
    SwitchField,
    Text,
} from "components";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { DeckTagResponse } from "src/api/generated";
import { DeckTagMarker } from "src/components/deck-tag-marker";
import type { TagColor, TagIconName } from "src/utils/deck-tags";
import {
    TAG_COLORS,
    TAG_COLOR_FALLBACK,
    TAG_ICONS,
    TAG_ICON_FALLBACK,
    TAG_PRESET,
    readTagNames,
    tagColor,
    tagIcon,
} from "src/utils/deck-tags";

/** How many tags answer to a number key */
const KEYED = 9;

/**
 * The properties for {@link DeckTagsDialog}
 */
export type DeckTagsDialogProps = {
    /** Whether the dialog is on screen */
    open: boolean;
    /** Every tag that can go on this deck's cards */
    tags: Array<DeckTagResponse>;
    /** Writes new tags, several at once when several were named */
    onCreate: (tags: Array<{ name: string; color: TagColor; icon: TagIconName; global: boolean }>) => void;
    /** Writes a changed tag */
    onUpdate: (
        tag: DeckTagResponse,
        name: string,
        color: TagColor,
        icon: TagIconName,
        global: boolean,
    ) => Promise<void>;
    /** Throws a tag away, taking it off every card it sat on */
    onDelete: (tag: DeckTagResponse) => void;
    /** Called when the dialog should close */
    onClose: () => void;
};

/**
 * The tags of a deck: what they are called, what colour they are, where they count.
 *
 * A tag either belongs to this deck or to every deck of the account, and that
 * is a switch rather than two lists to pick from: the same word means the same
 * thing in both cases, and a plan that turns out to repeat should not have to
 * be typed again on the next deck.
 *
 * The field for a new one sits at the top with the focus already in it, so the
 * whole thing is `T`, a word, `Enter`, and the tag exists. Commas separate, so
 * a whole plan goes in in one line, and the preset button lays down the set a
 * deck is normally built with, each tag where it belongs.
 *
 * @returns the dialog
 */
export function DeckTagsDialog({ open, tags, onCreate, onUpdate, onDelete, onClose }: DeckTagsDialogProps) {
    const [t] = useTranslation("deck");
    const [tg] = useTranslation();

    const [name, setName] = useState("");
    const [color, setColor] = useState<TagColor>(TAG_COLOR_FALLBACK);
    const [icon, setIcon] = useState<TagIconName>(TAG_ICON_FALLBACK);
    const [global, setGlobal] = useState(false);
    const [editing, setEditing] = useState<string | null>(null);
    const [removing, setRemoving] = useState<string | null>(null);

    useEffect(() => {
        setName("");
        setColor(TAG_COLOR_FALLBACK);
        setIcon(TAG_ICON_FALLBACK);
        setGlobal(false);
        setEditing(null);
        setRemoving(null);
    }, [open]);

    const local = tags.filter((tag) => tag.deck != null);
    const shared = tags.filter((tag) => tag.deck == null);

    const named = readTagNames(name);
    const missing = TAG_PRESET.filter(
        (preset) => !tags.some((tag) => tag.name.toLowerCase() === preset.name.toLowerCase()),
    );

    /**
     * Writes what is in the field, leaving it ready for the next one
     */
    function create() {
        if (named.length === 0) return;
        onCreate(named.map((entry) => ({ name: entry, color, icon, global })));
        setName("");
    }

    /**
     * The tags a preset would lay down, and where they would go
     *
     * @param heading which decks they would be offered on
     * @param group the tags
     *
     * @returns the line, nothing when the group is empty
     */
    function preview(heading: string, group: Array<{ name: string; color: TagColor; icon: TagIconName }>) {
        if (group.length === 0) return null;
        return (
            <span className={"flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-zinc-500 dark:text-zinc-400"}>
                {heading}
                {group.map((preset) => (
                    <span key={preset.name} className={"flex items-center gap-1.5"}>
                        <DeckTagMarker color={preset.color} icon={preset.icon} size={"sm"} />
                        {preset.name}
                    </span>
                ))}
            </span>
        );
    }

    /**
     * One heading and the tags under it
     *
     * @param heading what the group is called
     * @param group the tags in it
     *
     * @returns the section
     */
    function section(heading: string, group: Array<DeckTagResponse>) {
        if (group.length === 0) return null;
        return (
            <div className={"flex flex-col gap-2"}>
                <Strong className={"text-xs"}>{heading}</Strong>
                <ul className={"flex flex-col divide-y divide-zinc-950/5 dark:divide-white/10"}>
                    {group.map((tag) => (
                        <li key={tag.uuid} className={"py-2"}>
                            {editing === tag.uuid ? (
                                <TagForm
                                    tag={tag}
                                    onSave={async (next, nextColor, nextIcon, nextGlobal) => {
                                        await onUpdate(tag, next, nextColor, nextIcon, nextGlobal);
                                        setEditing(null);
                                    }}
                                    onCancel={() => setEditing(null)}
                                />
                            ) : removing === tag.uuid ? (
                                <div className={"flex flex-wrap items-center gap-3"}>
                                    <Text className={"flex-1 text-xs"}>{t("description.delete-tag")}</Text>
                                    <Button plain onClick={() => setRemoving(null)}>
                                        {tg("button.cancel")}
                                    </Button>
                                    <Button
                                        color={"red"}
                                        onClick={() => {
                                            setRemoving(null);
                                            onDelete(tag);
                                        }}
                                    >
                                        {t("button.delete-tag")}
                                    </Button>
                                </div>
                            ) : (
                                <div className={"flex items-center gap-3"}>
                                    <kbd
                                        className={
                                            "w-4 shrink-0 text-center font-sans text-xs text-zinc-500 tabular-nums dark:text-zinc-400"
                                        }
                                    >
                                        {tags.indexOf(tag) < KEYED ? tags.indexOf(tag) + 1 : ""}
                                    </kbd>
                                    <DeckTagMarker color={tag.color} icon={tag.icon} size={"md"} />
                                    <span className={"min-w-0 flex-1 truncate text-sm/6 text-zinc-950 dark:text-white"}>
                                        {tag.name}
                                    </span>
                                    <button
                                        type={"button"}
                                        aria-label={t("button.edit-tag")}
                                        title={t("button.edit-tag")}
                                        onClick={() => setEditing(tag.uuid)}
                                        className={
                                            "rounded p-1 text-zinc-500 hover:bg-zinc-950/5 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white"
                                        }
                                    >
                                        <PencilSquareIcon className={"size-4"} />
                                    </button>
                                    <button
                                        type={"button"}
                                        aria-label={t("button.delete-tag")}
                                        title={t("button.delete-tag")}
                                        onClick={() => setRemoving(tag.uuid)}
                                        className={
                                            "rounded p-1 text-zinc-500 hover:bg-red-500/10 hover:text-red-600 dark:text-zinc-400 dark:hover:bg-red-500/15 dark:hover:text-red-400"
                                        }
                                    >
                                        <TrashIcon className={"size-4"} />
                                    </button>
                                </div>
                            )}
                        </li>
                    ))}
                </ul>
            </div>
        );
    }

    return (
        <Dialog open={open} onClose={onClose} size={"lg"}>
            <DialogTitle>{t("heading.tags")}</DialogTitle>
            <DialogDescription>{t("description.tags")}</DialogDescription>
            <DialogBody>
                <div className={"flex flex-col gap-6"}>
                    <div className={"flex flex-col gap-3"}>
                        <div className={"flex items-center gap-2"}>
                            <Input
                                autoFocus={true}
                                value={name}
                                placeholder={t("label.tag-name")}
                                aria-label={t("label.tag-name")}
                                onChange={(event) => setName(event.target.value)}
                                onKeyDown={(event) => {
                                    if (event.key !== "Enter") return;
                                    event.preventDefault();
                                    create();
                                }}
                            />
                            <Button disabled={named.length === 0} onClick={create} className={"shrink-0"}>
                                <PlusIcon />
                                {t("button.create-tag")}
                            </Button>
                        </div>
                        <Text className={"text-xs"}>{t("description.tag-names")}</Text>
                        <fieldset className={"flex flex-col gap-2"}>
                            <legend className={"mb-2 text-xs font-medium text-zinc-950 dark:text-white"}>
                                {t("label.tag-color")}
                            </legend>
                            <ColorChoice value={color} icon={icon} onChange={setColor} />
                        </fieldset>
                        <fieldset className={"flex flex-col gap-2"}>
                            <legend className={"mb-2 text-xs font-medium text-zinc-950 dark:text-white"}>
                                {t("label.tag-icon")}
                            </legend>
                            <IconChoice value={icon} color={color} onChange={setIcon} />
                        </fieldset>
                        <SwitchField>
                            <Label className={"text-xs!"}>{t("label.tag-global")}</Label>
                            <Switch name={"tag-global"} color={"emerald"} checked={global} onChange={setGlobal} />
                        </SwitchField>
                        {missing.length > 0 && (
                            <div className={"flex flex-col gap-2"}>
                                <div>
                                    <Button outline onClick={() => onCreate(missing)}>
                                        <SparklesIcon />
                                        {t("button.tag-preset")}
                                    </Button>
                                </div>
                                {preview(
                                    t("label.tag-scope-global"),
                                    missing.filter((preset) => preset.global),
                                )}
                                {preview(
                                    t("label.tag-scope-deck"),
                                    missing.filter((preset) => !preset.global),
                                )}
                            </div>
                        )}
                    </div>

                    <div className={"flex flex-col gap-6 border-t border-zinc-950/5 pt-5 dark:border-white/10"}>
                        <Text className={"text-xs"}>{t("description.tag-keys")}</Text>
                        {tags.length === 0 && <Text className={"text-sm"}>{t("label.no-tags")}</Text>}
                        {section(t("label.tag-scope-deck"), local)}
                        {section(t("label.tag-scope-global"), shared)}
                    </div>
                </div>
            </DialogBody>
            <DialogActions>
                <Button plain onClick={onClose}>
                    {tg("button.close")}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

/**
 * The properties for {@link TagForm}
 */
type TagFormProps = {
    /** The tag being changed */
    tag: DeckTagResponse;
    /** Takes the changed tag */
    onSave: (name: string, color: TagColor, icon: TagIconName, global: boolean) => Promise<void>;
    /** Leaves the tag as it was */
    onCancel: () => void;
};

/**
 * One tag while it is being changed, `Enter` to keep it and `Escape` to drop it
 *
 * @returns the form
 */
function TagForm({ tag, onSave, onCancel }: TagFormProps) {
    const [t] = useTranslation("deck");
    const [name, setName] = useState(tag.name);
    const [color, setColor] = useState<TagColor>(tagColor(tag.color));
    const [icon, setIcon] = useState<TagIconName>(tagIcon(tag.icon));
    const [global, setGlobal] = useState(tag.deck == null);
    const [saving, setSaving] = useState(false);

    /**
     * Keeps the change unless the name was emptied
     */
    async function save() {
        if (name.trim() === "" || saving) return;
        setSaving(true);
        try {
            await onSave(name.trim(), color, icon, global);
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className={"flex flex-col gap-3 py-1"}>
            <div className={"flex items-center gap-2"}>
                <Input
                    autoFocus={true}
                    value={name}
                    aria-label={t("label.tag-name")}
                    onChange={(event) => setName(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === "Enter") {
                            event.preventDefault();
                            void save();
                        }
                        if (event.key === "Escape") {
                            event.preventDefault();
                            onCancel();
                        }
                    }}
                />
                <button
                    type={"button"}
                    aria-label={t("button.save-tag")}
                    title={t("button.save-tag")}
                    disabled={name.trim() === "" || saving}
                    onClick={() => void save()}
                    className={
                        "rounded p-1.5 text-(--color-success) hover:bg-zinc-950/5 disabled:opacity-40 dark:hover:bg-white/10"
                    }
                >
                    <CheckIcon className={"size-5"} />
                </button>
                <button
                    type={"button"}
                    aria-label={t("button.cancel-tag")}
                    title={t("button.cancel-tag")}
                    disabled={saving}
                    onClick={onCancel}
                    className={
                        "rounded p-1.5 text-zinc-500 hover:bg-zinc-950/5 dark:text-zinc-400 dark:hover:bg-white/10"
                    }
                >
                    <XMarkIcon className={"size-5"} />
                </button>
            </div>
            <fieldset className={"flex flex-col gap-2"}>
                <legend className={"mb-2 text-xs font-medium text-zinc-950 dark:text-white"}>
                    {t("label.tag-color")}
                </legend>
                <ColorChoice value={color} icon={icon} onChange={setColor} />
            </fieldset>
            <fieldset className={"flex flex-col gap-2"}>
                <legend className={"mb-2 text-xs font-medium text-zinc-950 dark:text-white"}>
                    {t("label.tag-icon")}
                </legend>
                <IconChoice value={icon} color={color} onChange={setIcon} />
            </fieldset>
            <SwitchField>
                <Label className={"text-xs!"}>{t("label.tag-global")}</Label>
                <Switch name={"tag-global"} color={"emerald"} checked={global} onChange={setGlobal} />
            </SwitchField>
        </div>
    );
}

/**
 * The properties for {@link ColorChoice}
 */
type ColorChoiceProps = {
    /** The colour picked now */
    value: TagColor;
    /** The pictogram used to preview it */
    icon: TagIconName;
    /** Takes the picked colour */
    onChange: (color: TagColor) => void;
};

/**
 * The colour a tag is drawn in, as the colours themselves
 *
 * @returns the swatches
 */
function ColorChoice({ value, icon, onChange }: ColorChoiceProps) {
    const [t] = useTranslation("deck");

    return (
        <div className={"flex flex-wrap gap-2"}>
            {TAG_COLORS.map((option) => (
                <button
                    key={option}
                    type={"button"}
                    aria-label={t("accessibility.tag-color", { color: option })}
                    title={option}
                    aria-pressed={value === option}
                    onClick={() => onChange(option)}
                    className={clsx(
                        "rounded-full transition",
                        value === option
                            ? "ring-2 ring-zinc-950 ring-offset-2 ring-offset-white dark:ring-white dark:ring-offset-zinc-900"
                            : "hover:opacity-75",
                    )}
                >
                    <DeckTagMarker color={option} icon={icon} size={"lg"} />
                </button>
            ))}
        </div>
    );
}

/** The properties for {@link IconChoice} */
type IconChoiceProps = {
    /** The pictogram picked now */
    value: TagIconName;
    /** The colour used to preview it */
    color: TagColor;
    /** Takes the picked pictogram */
    onChange: (icon: TagIconName) => void;
};

/** The pictogram a tag carries, previewed in its current colour */
function IconChoice({ value, color, onChange }: IconChoiceProps) {
    const [t] = useTranslation("deck");

    return (
        <div className={"flex flex-wrap gap-2"}>
            {TAG_ICONS.map((option) => (
                <button
                    key={option}
                    type={"button"}
                    aria-label={t("accessibility.tag-icon", { icon: option })}
                    title={option}
                    aria-pressed={value === option}
                    onClick={() => onChange(option)}
                    className={clsx(
                        "rounded-full transition",
                        value === option
                            ? "ring-2 ring-zinc-950 ring-offset-2 ring-offset-white dark:ring-white dark:ring-offset-zinc-900"
                            : "hover:opacity-75",
                    )}
                >
                    <DeckTagMarker color={color} icon={option} size={"lg"} />
                </button>
            ))}
        </div>
    );
}
