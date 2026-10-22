import { PlusIcon, TrashIcon } from "@heroicons/react/20/solid";
import {
    Button,
    Dialog,
    DialogActions,
    DialogBody,
    DialogDescription,
    DialogTitle,
    ErrorMessage,
    Field,
    Input,
    Listbox,
    ListboxLabel,
    ListboxOption,
    Text,
    notify,
} from "components";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import type { CollaboratorLevel, DeckCollaboratorResponse } from "src/api/generated";
import { useDeckLabels } from "src/components/deck-labels";
import { isFormError } from "src/utils/error";

/** The levels a Collaborator can be named at, in the order they are offered */
const LEVELS: Array<CollaboratorLevel> = ["Viewer", "Editor"];

/**
 * The properties for {@link DeckCollaboratorsDialog}
 */
export type DeckCollaboratorsDialogProps = {
    /** The deck whose Collaborators are managed, `null` to keep the dialog closed */
    deckUuid: string | null;
    /** Called when the dialog should close */
    onClose: () => void;
};

/**
 * The Accounts the owner named on a deck: adding one by username, changing its level, removing it.
 *
 * @returns the dialog
 */
export function DeckCollaboratorsDialog({ deckUuid, onClose }: DeckCollaboratorsDialogProps) {
    const [t] = useTranslation("deck");
    const [tg] = useTranslation();
    const labels = useDeckLabels();

    const [collaborators, setCollaborators] = useState<Array<DeckCollaboratorResponse>>([]);
    const [username, setUsername] = useState("");
    const [level, setLevel] = useState<CollaboratorLevel>("Viewer");
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        setUsername("");
        setLevel("Viewer");
        setError(null);
        setCollaborators([]);
        if (deckUuid === null) return;
        let gone = false;
        Api.decks.collaborators
            .list(deckUuid)
            .then((list) => {
                if (!gone) setCollaborators(list.collaborators);
            })
            .catch(() => undefined);
        return () => {
            gone = true;
        };
    }, [deckUuid]);

    /**
     * Reads the Collaborators again after a change
     *
     * @param deck the deck they are named on
     */
    async function reload(deck: string) {
        const list = await Api.decks.collaborators.list(deck);
        setCollaborators(list.collaborators);
    }

    /**
     * Names an Account on the deck, or changes the level it is named at
     *
     * @param name the Account's username
     * @param next the level to name it at
     *
     * @returns whether it went through
     */
    async function put(name: string, next: CollaboratorLevel): Promise<boolean> {
        if (deckUuid === null) return false;
        setBusy(true);
        try {
            const result = await Api.decks.collaborators.put(deckUuid, name, next);
            if (isFormError(result)) {
                setError(
                    result.error.own_account
                        ? t("error.collaborator-is-owner")
                        : t("error.collaborator-unknown-username"),
                );
                return false;
            }
            setError(null);
            await reload(deckUuid);
            return true;
        } finally {
            setBusy(false);
        }
    }

    /**
     * Adds what is in the field
     */
    async function add() {
        const name = username.trim();
        if (name === "") return;
        if (await put(name, level)) {
            setUsername("");
            notify.success(t("toast.collaborator-added", { username: name }));
        }
    }

    /**
     * Takes an Account off the deck
     *
     * @param collaborator the Collaborator to remove
     */
    async function remove(collaborator: DeckCollaboratorResponse) {
        if (deckUuid === null) return;
        setBusy(true);
        try {
            await Api.decks.collaborators.remove(deckUuid, collaborator.account);
            await reload(deckUuid);
            notify.success(t("toast.collaborator-removed", { username: collaborator.username }));
        } finally {
            setBusy(false);
        }
    }

    return (
        <Dialog open={deckUuid !== null} onClose={onClose} size={"lg"}>
            <DialogTitle>{t("heading.collaborators")}</DialogTitle>
            <DialogDescription>{t("description.collaborators")}</DialogDescription>
            <DialogBody>
                <div className={"flex flex-col gap-6"}>
                    <Field>
                        <div className={"flex flex-col gap-2 sm:flex-row sm:items-center"}>
                            <Input
                                autoFocus={true}
                                value={username}
                                placeholder={t("label.collaborator-username")}
                                aria-label={t("label.collaborator-username")}
                                invalid={error !== null}
                                onChange={(event) => {
                                    setUsername(event.target.value);
                                    setError(null);
                                }}
                                onKeyDown={(event) => {
                                    if (event.key !== "Enter") return;
                                    event.preventDefault();
                                    void add();
                                }}
                            />
                            <div className={"flex items-center gap-2"}>
                                <Listbox
                                    value={level}
                                    onChange={setLevel}
                                    aria-label={t("label.collaborator-level")}
                                    className={"sm:w-36"}
                                >
                                    {LEVELS.map((option) => (
                                        <ListboxOption key={option} value={option}>
                                            <ListboxLabel>{labels.collaboratorLevel(option)}</ListboxLabel>
                                        </ListboxOption>
                                    ))}
                                </Listbox>
                                <Button
                                    disabled={busy || username.trim() === ""}
                                    onClick={() => void add()}
                                    className={"shrink-0"}
                                >
                                    <PlusIcon />
                                    {t("button.add-collaborator")}
                                </Button>
                            </div>
                        </div>
                        {error !== null && <ErrorMessage>{error}</ErrorMessage>}
                    </Field>

                    {collaborators.length === 0 ? (
                        <Text>{t("description.no-collaborators")}</Text>
                    ) : (
                        <ul className={"flex flex-col divide-y divide-zinc-950/5 dark:divide-white/10"}>
                            {collaborators.map((collaborator) => (
                                <li key={collaborator.account} className={"flex items-center gap-3 py-2"}>
                                    <span className={"min-w-0 flex-1 truncate text-sm/6 text-zinc-950 dark:text-white"}>
                                        {collaborator.username}
                                    </span>
                                    <Listbox
                                        value={collaborator.level}
                                        disabled={busy}
                                        onChange={(next) => void put(collaborator.username, next)}
                                        aria-label={t("label.collaborator-level")}
                                        className={"w-36 shrink-0"}
                                    >
                                        {LEVELS.map((option) => (
                                            <ListboxOption key={option} value={option}>
                                                <ListboxLabel>{labels.collaboratorLevel(option)}</ListboxLabel>
                                            </ListboxOption>
                                        ))}
                                    </Listbox>
                                    <button
                                        type={"button"}
                                        disabled={busy}
                                        aria-label={t("button.remove-collaborator")}
                                        title={t("button.remove-collaborator")}
                                        onClick={() => void remove(collaborator)}
                                        className={
                                            "rounded p-1 text-zinc-500 hover:bg-red-500/10 hover:text-red-600 dark:text-zinc-400 dark:hover:bg-red-500/15 dark:hover:text-red-400"
                                        }
                                    >
                                        <TrashIcon className={"size-4"} />
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
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
