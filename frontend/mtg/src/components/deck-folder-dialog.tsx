import { CheckIcon, PencilSquareIcon, PlusIcon, XMarkIcon } from "@heroicons/react/20/solid";
import { TrashIcon } from "@heroicons/react/20/solid";
import { Button, Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle, Input, Text } from "components";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { DeckFolderResponse } from "src/api/generated";
import { folderLabel } from "src/utils/deck-folders";

/**
 * The properties for {@link DeckFolderDialog}
 */
export type DeckFolderDialogProps = {
    /** Whether the dialog is on screen */
    open: boolean;
    /** Every folder the account keeps, the archive among them */
    folders: Array<DeckFolderResponse>;
    /** How many decks are filed in each, by folder id */
    counts: Record<string, number>;
    /** Makes a folder */
    onCreate: (name: string) => void;
    /** Renames one */
    onRename: (folder: DeckFolderResponse, name: string) => Promise<void>;
    /** Throws one away, leaving the decks in it unfiled */
    onDelete: (folder: DeckFolderResponse) => void;
    /** Called when the dialog should close */
    onClose: () => void;
};

/**
 * The shelves decks stand on: making them, naming them, throwing them away.
 *
 * The field for a new one sits at the top with the focus in it, so a shelf is a
 * word and `Enter`. The archive is in the list like any other folder and
 * carries no buttons: it is the app's own, it is what putting a deck away files
 * it into, and it is called what the app calls it.
 *
 * @returns the dialog
 */
export function DeckFolderDialog({
    open,
    folders,
    counts,
    onCreate,
    onRename,
    onDelete,
    onClose,
}: DeckFolderDialogProps) {
    const [t] = useTranslation("deck");
    const [tg] = useTranslation();

    const [name, setName] = useState("");
    const [editing, setEditing] = useState<string | null>(null);
    const [draft, setDraft] = useState("");
    const [removing, setRemoving] = useState<string | null>(null);

    useEffect(() => {
        setName("");
        setEditing(null);
        setDraft("");
        setRemoving(null);
    }, [open]);

    const wanted = name.trim();

    /**
     * Writes what is in the field, leaving it ready for the next one
     */
    function create() {
        if (wanted === "") return;
        onCreate(wanted);
        setName("");
    }

    /**
     * Writes a renamed folder, unless the name was only whitespace
     *
     * @param folder the folder being renamed
     */
    async function rename(folder: DeckFolderResponse) {
        const next = draft.trim();
        if (next === "" || next === folder.name) {
            setEditing(null);
            return;
        }
        await onRename(folder, next);
        setEditing(null);
    }

    return (
        <Dialog open={open} onClose={onClose} size={"lg"}>
            <DialogTitle>{t("heading.folders")}</DialogTitle>
            <DialogDescription>{t("description.folders")}</DialogDescription>
            <DialogBody>
                <div className={"flex flex-col gap-6"}>
                    <div className={"flex items-center gap-2"}>
                        <Input
                            autoFocus={true}
                            value={name}
                            placeholder={t("label.folder-name")}
                            aria-label={t("label.folder-name")}
                            onChange={(event) => setName(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key !== "Enter") return;
                                event.preventDefault();
                                create();
                            }}
                        />
                        <Button disabled={wanted === ""} onClick={create} className={"shrink-0"}>
                            <PlusIcon />
                            {t("button.create-folder")}
                        </Button>
                    </div>

                    <ul className={"flex flex-col divide-y divide-zinc-950/5 dark:divide-white/10"}>
                        {folders.map((folder) => (
                            <li key={folder.uuid} className={"py-2"}>
                                {editing === folder.uuid ? (
                                    <div className={"flex items-center gap-2"}>
                                        <Input
                                            autoFocus={true}
                                            value={draft}
                                            aria-label={t("label.folder-name")}
                                            onChange={(event) => setDraft(event.target.value)}
                                            onKeyDown={(event) => {
                                                if (event.key === "Escape") setEditing(null);
                                                if (event.key !== "Enter") return;
                                                event.preventDefault();
                                                void rename(folder);
                                            }}
                                        />
                                        <Button
                                            plain
                                            onClick={() => setEditing(null)}
                                            aria-label={t("button.cancel-folder")}
                                        >
                                            <XMarkIcon />
                                        </Button>
                                        <Button
                                            onClick={() => void rename(folder)}
                                            aria-label={t("button.save-folder")}
                                        >
                                            <CheckIcon />
                                        </Button>
                                    </div>
                                ) : removing === folder.uuid ? (
                                    <div className={"flex flex-wrap items-center gap-3"}>
                                        <Text className={"flex-1 text-xs"}>{t("description.delete-folder")}</Text>
                                        <Button plain onClick={() => setRemoving(null)}>
                                            {tg("button.cancel")}
                                        </Button>
                                        <Button
                                            color={"red"}
                                            onClick={() => {
                                                setRemoving(null);
                                                onDelete(folder);
                                            }}
                                        >
                                            {t("button.delete-folder")}
                                        </Button>
                                    </div>
                                ) : (
                                    <div className={"flex items-center gap-3"}>
                                        <span
                                            className={
                                                "min-w-0 flex-1 truncate text-sm/6 text-zinc-950 dark:text-white"
                                            }
                                        >
                                            {folderLabel(folder, t("label.folder-archive"))}
                                        </span>
                                        <span
                                            className={"shrink-0 text-xs text-zinc-500 tabular-nums dark:text-zinc-400"}
                                        >
                                            {t("label.deck-count", { count: counts[folder.uuid] ?? 0 })}
                                        </span>
                                        {folder.kind === "Archive" ? (
                                            <span className={"shrink-0 text-xs text-zinc-500 dark:text-zinc-400"}>
                                                {t("label.folder-fixed")}
                                            </span>
                                        ) : (
                                            <>
                                                <button
                                                    type={"button"}
                                                    aria-label={t("button.edit-folder")}
                                                    title={t("button.edit-folder")}
                                                    onClick={() => {
                                                        setDraft(folder.name);
                                                        setEditing(folder.uuid);
                                                    }}
                                                    className={
                                                        "rounded p-1 text-zinc-500 hover:bg-zinc-950/5 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white"
                                                    }
                                                >
                                                    <PencilSquareIcon className={"size-4"} />
                                                </button>
                                                <button
                                                    type={"button"}
                                                    aria-label={t("button.delete-folder")}
                                                    title={t("button.delete-folder")}
                                                    onClick={() => setRemoving(folder.uuid)}
                                                    className={
                                                        "rounded p-1 text-zinc-500 hover:bg-red-500/10 hover:text-red-600 dark:text-zinc-400 dark:hover:bg-red-500/15 dark:hover:text-red-400"
                                                    }
                                                >
                                                    <TrashIcon className={"size-4"} />
                                                </button>
                                            </>
                                        )}
                                    </div>
                                )}
                            </li>
                        ))}
                    </ul>
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
