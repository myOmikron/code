import { TrashIcon } from "@heroicons/react/20/solid";
import {
    Button,
    Description,
    Dialog,
    DialogActions,
    DialogBody,
    DialogTitle,
    Field,
    Fieldset,
    Input,
    Label,
    Legend,
    Listbox,
    ListboxLabel,
    ListboxOption,
    PrimaryButton,
    Text,
} from "components";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import type { CollectionOverviewResponse, ScannerSessionResponse } from "src/api/generated";
import { CollectionMarker } from "src/components/collection-marker";
import { DialogCloseButton } from "src/components/dialog-close-button";
import { COLLECTION_COLORS, COLLECTION_ICONS, collectionColor, collectionIcon } from "src/utils/collection-style";

/**
 * The properties for {@link SessionDialog}
 */
export type SessionDialogProps = {
    /** The session being edited, `null` to start a new one, `undefined` while closed */
    session?: ScannerSessionResponse | null;
    /** Closes the dialog */
    onClose: () => void;
    /** Saves the session under this name, marker and destination */
    onSave: (draft: { name: string; color: string; icon: string; collection: string | null }) => Promise<void>;
    /** Throws the session away, absent for one that does not exist yet */
    onDelete?: () => Promise<void>;
};

/** The colours a session may wear; lime is gone from the app's palette. */
const COLORS = COLLECTION_COLORS.filter((color) => color !== "lime");

/**
 * What a staging area is called, what it looks like, and where it empties into.
 *
 * A session is a box on a table: it earns a name and a colour the moment there is more than one
 * of them, and until then this dialog is never opened. The destination lives here as well rather
 * than only on the filing button, because "these go in the trade binder" is a decision made when
 * the box is opened, not when it is finished.
 *
 * @returns the dialog
 */
export function SessionDialog({ session, onClose, onSave, onDelete }: SessionDialogProps) {
    const [t] = useTranslation("session");
    const [tg] = useTranslation();
    const open = session !== undefined;
    const [name, setName] = useState("");
    const [color, setColor] = useState<string>("blue");
    const [icon, setIcon] = useState<string>("cards");
    const [collection, setCollection] = useState<string>("");
    const [collections, setCollections] = useState<CollectionOverviewResponse[]>([]);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!open) return;
        setName(session?.name ?? t("label.session-new"));
        setColor(session?.color ?? "blue");
        setIcon(session?.icon ?? "cards");
        setCollection(session?.collection ?? "");
        let dropped = false;
        void Api.collections.list().then((found) => {
            if (!dropped) setCollections(found);
        });
        return () => {
            dropped = true;
        };
    }, [open, session, t]);

    /**
     * Writes the session and closes
     */
    async function save() {
        if (saving || name.trim() === "") return;
        setSaving(true);
        try {
            await onSave({ name: name.trim(), color, icon, collection: collection === "" ? null : collection });
            onClose();
        } finally {
            setSaving(false);
        }
    }

    return (
        <Dialog open={open} onClose={onClose} size={"lg"} tall>
            <DialogTitle className={"flex items-center gap-3"}>
                <span className={"min-w-0 flex-1 truncate"}>
                    {session ? t("heading.edit-session") : t("heading.new-session")}
                </span>
                <DialogCloseButton onClose={onClose} />
            </DialogTitle>
            <DialogBody className={"flex flex-col gap-5"}>
                <Field>
                    <Label>{t("label.name")}</Label>
                    <Input value={name} autoFocus onChange={(event) => setName(event.target.value)} />
                </Field>

                <Field>
                    <Label>{t("label.destination")}</Label>
                    {/* A listbox rather than a dropdown, because a collection is recognised by
                        its lid: the marker rides along in the closed button and in every option,
                        which a native `<option>` cannot draw. */}
                    <Listbox value={collection} onChange={setCollection}>
                        <ListboxOption value={""}>
                            <ListboxLabel>{t("label.no-destination")}</ListboxLabel>
                        </ListboxOption>
                        {collections.map((overview) => (
                            <ListboxOption key={overview.collection.uuid} value={overview.collection.uuid}>
                                <CollectionMarker
                                    color={overview.collection.color}
                                    icon={overview.collection.icon}
                                    size={"sm"}
                                />
                                <ListboxLabel>{overview.collection.name}</ListboxLabel>
                            </ListboxOption>
                        ))}
                    </Listbox>
                    <Description>{t("description.destination")}</Description>
                </Field>

                {/* A fieldset rather than a bare label: `Label` belongs to one control and
                    throws when it cannot find it, and these two rows of buttons are a group with
                    a heading, not a field. */}
                <Fieldset className={"flex flex-col gap-2"}>
                    <Legend>{t("label.marker")}</Legend>
                    <div className={"flex items-center gap-3"}>
                        <CollectionMarker color={color} icon={icon} size={"lg"} />
                        <Text className={"truncate"}>{name}</Text>
                    </div>
                    <ul className={"flex flex-wrap gap-1.5"}>
                        {COLORS.map((choice) => (
                            <li key={choice}>
                                <button
                                    type={"button"}
                                    aria-label={choice}
                                    aria-pressed={collectionColor(color) === choice}
                                    onClick={() => setColor(choice)}
                                    className={`size-7 rounded-full ring-2 ${
                                        collectionColor(color) === choice
                                            ? "ring-zinc-950 dark:ring-white"
                                            : "ring-transparent"
                                    }`}
                                >
                                    <CollectionMarker color={choice} icon={icon} size={"md"} />
                                </button>
                            </li>
                        ))}
                    </ul>
                    <ul className={"flex flex-wrap gap-1.5"}>
                        {COLLECTION_ICONS.map((choice) => (
                            <li key={choice}>
                                <button
                                    type={"button"}
                                    aria-label={choice}
                                    aria-pressed={collectionIcon(icon) === choice}
                                    onClick={() => setIcon(choice)}
                                    className={`rounded-full ring-2 ${
                                        collectionIcon(icon) === choice
                                            ? "ring-zinc-950 dark:ring-white"
                                            : "ring-transparent"
                                    }`}
                                >
                                    <CollectionMarker color={color} icon={choice} size={"md"} />
                                </button>
                            </li>
                        ))}
                    </ul>
                </Fieldset>
            </DialogBody>
            <DialogActions>
                {onDelete !== undefined && (
                    <Button
                        plain
                        className={"mr-auto"}
                        onClick={() => {
                            void onDelete().then(onClose);
                        }}
                    >
                        <TrashIcon className={"size-5"} />
                        {tg("button.delete-session")}
                    </Button>
                )}
                <Button plain onClick={onClose}>
                    {tg("button.cancel")}
                </Button>
                <PrimaryButton disabled={saving || name.trim() === ""} onClick={() => void save()}>
                    {t("button.save-session")}
                </PrimaryButton>
            </DialogActions>
        </Dialog>
    );
}
