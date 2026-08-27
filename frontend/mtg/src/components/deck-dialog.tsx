import {
    Button,
    Description,
    Dialog,
    DialogActions,
    DialogBody,
    DialogTitle,
    ErrorMessage,
    Field,
    FieldGroup,
    Form,
    Input,
    Label,
    Checkbox,
    CheckboxField,
    Listbox,
    ListboxDescription,
    ListboxLabel,
    ListboxOption,
    PrimaryButton,
    RequiredLabel,
    Textarea,
} from "components";
import { FolderIcon, FolderMinusIcon, GlobeAltIcon, LinkIcon, LockClosedIcon } from "@heroicons/react/20/solid";
import { useForm } from "@tanstack/react-form";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { notify } from "components";
import { Api } from "src/api/api";
import { importRows } from "src/utils/deck-import";
import { Visibility } from "src/api/generated";
import type { DeckFolderResponse, DeckResponse, FormatRulesResponse } from "src/api/generated";
import { useDeckLabels } from "src/components/deck-labels";
import { folderLabel } from "src/utils/deck-folders";

/** What the field holds while the deck is on no shelf */
const UNFILED = "";

/**
 * The properties for {@link DeckDialog}
 */
export type DeckDialogProps = {
    /** Whether the dialog is on screen */
    open: boolean;
    /** The deck to edit, or `null` to build a new one */
    deck: DeckResponse | null;
    /** The formats on offer */
    formats: Array<FormatRulesResponse>;
    /** The shelves the deck can be filed on */
    folders: Array<DeckFolderResponse>;
    /** Called when the dialog should close without having saved anything */
    onClose: () => void;
    /**
     * Called after the deck was saved
     *
     * Carries the deck when it was just created, `null` when an existing one
     * was edited.
     */
    onSaved: (created: DeckResponse | null) => void;
};

/**
 * Dialog for building a new deck or changing what an existing one is.
 *
 * @returns the dialog
 */
export function DeckDialog({ open, deck, formats, folders, onClose, onSaved }: DeckDialogProps) {
    const [t] = useTranslation("deck");
    const [tg] = useTranslation();
    const labels = useDeckLabels();

    const fallbackFormat = formats[0]?.slug ?? "commander";
    const form = useForm({
        defaultValues: {
            name: deck?.name ?? "",
            description: deck?.description ?? "",
            format: deck?.format ?? fallbackFormat,
            folder: deck?.folder ?? UNFILED,
            visibility: deck?.visibility ?? Visibility.Private,
            url: "",
            intoCollection: false,
        },
        validators: {
            onSubmitAsync: async ({
                value: { name, description, format, folder, visibility, url, intoCollection },
            }) => {
                const text = description === "" ? null : description;
                const shelf = folder === UNFILED ? null : folder;
                if (deck === null) {
                    const created = await Api.decks.create({ name, description: text, format, visibility });
                    if (shelf !== null) await Api.decks.setFolder(created.uuid, shelf);
                    await fill(created.uuid, url, intoCollection);
                    form.reset();
                    onSaved(created);
                    return;
                }

                await Api.decks.update(deck.uuid, { name, description: text, format });
                if (visibility !== deck.visibility) {
                    await Api.decks.setVisibility(deck.uuid, visibility);
                }
                if (shelf !== (deck.folder ?? null)) {
                    await Api.decks.setFolder(deck.uuid, shelf);
                }
                form.reset();
                onSaved(null);
            },
        },
    });

    /**
     * Puts a linked deck into the deck that was just built
     *
     * A failure here is reported and swallowed: the deck exists either way, and
     * losing it because a site was down would be the worse answer. Pasting a
     * list is the import dialog's job, which the new deck opens onto.
     *
     * @param uuid the new deck
     * @param url what was linked, empty when nothing was
     * @param intoCollection whether the deck should physically hold what was imported
     */
    async function fill(uuid: string, url: string, intoCollection: boolean) {
        // A deck built without a list can still be asked to keep one, and then
        // it gets its collection up front rather than on the first import.
        if (url.trim() === "") {
            if (intoCollection) await Api.decks.collection.attach(uuid);
            return;
        }

        try {
            const read = await Api.decks.readUrl(url.trim());
            const rows = read.cards.map((card) => ({
                quantity: card.quantity,
                name: card.name,
                ...(card.set_code == null ? {} : { setCode: card.set_code }),
                ...(card.collector_number == null ? {} : { collectorNumber: card.collector_number }),
                ...(card.foil ? { foil: true } : {}),
                zone: card.zone,
            }));
            if (rows.length === 0) {
                if (intoCollection) await Api.decks.collection.attach(uuid);
                return;
            }

            const outcome = await importRows(uuid, rows, { intoCollection });
            if (outcome.added > 0) notify.success(t("toast.import-done", { cards: outcome.copies }));
            if (outcome.filed > 0) notify.success(t("toast.import-filed", { cards: outcome.filed }));
            if (outcome.unmatched.length > 0) {
                notify.warning(t("description.import-unmatched", { count: outcome.unmatched.length }));
            }
        } catch {
            notify.error(t("toast.import-failed"));
        }
    }

    // The dialog stays mounted, so the form has to be pointed at whatever it is
    // opened on: `defaultValues` is read once, at mount.
    useEffect(() => {
        form.reset({
            name: deck?.name ?? "",
            description: deck?.description ?? "",
            format: deck?.format ?? fallbackFormat,
            folder: deck?.folder ?? UNFILED,
            visibility: deck?.visibility ?? Visibility.Private,
            url: "",
            intoCollection: false,
        });
        // Deliberately not keyed on `form`, which is rebuilt on every render.
    }, [deck, fallbackFormat, open]);

    return (
        <Dialog open={open} onClose={onClose}>
            <DialogTitle>{deck === null ? t("heading.create-deck") : t("heading.edit-deck")}</DialogTitle>
            <Form onSubmit={form.handleSubmit}>
                <DialogBody>
                    <FieldGroup>
                        <form.Field name={"name"}>
                            {(fieldApi) => (
                                <Field>
                                    <RequiredLabel>{t("label.name")}</RequiredLabel>
                                    <Input
                                        autoFocus={true}
                                        required={true}
                                        maxLength={255}
                                        invalid={fieldApi.state.meta.errors.length > 0}
                                        value={fieldApi.state.value}
                                        onChange={(event) => fieldApi.handleChange(event.target.value)}
                                    />
                                    {fieldApi.state.meta.errors.map((error) => (
                                        <ErrorMessage key={String(error)}>{String(error)}</ErrorMessage>
                                    ))}
                                </Field>
                            )}
                        </form.Field>

                        <form.Field name={"format"}>
                            {(fieldApi) => (
                                <Field>
                                    <Label>{t("label.format")}</Label>
                                    <Description>{t("description.format")}</Description>
                                    <Listbox value={fieldApi.state.value} onChange={fieldApi.handleChange}>
                                        {formats.map((format) => (
                                            <ListboxOption key={format.slug} value={format.slug}>
                                                <ListboxLabel>{labels.format(format.slug)}</ListboxLabel>
                                                <ListboxDescription>{labels.shape(format)}</ListboxDescription>
                                            </ListboxOption>
                                        ))}
                                    </Listbox>
                                </Field>
                            )}
                        </form.Field>

                        {folders.length > 0 && (
                            <form.Field name={"folder"}>
                                {(fieldApi) => (
                                    <Field>
                                        <Label>{t("label.folder")}</Label>
                                        <Listbox value={fieldApi.state.value} onChange={fieldApi.handleChange}>
                                            <ListboxOption value={UNFILED}>
                                                <FolderMinusIcon />
                                                <ListboxLabel>{t("label.folder-none")}</ListboxLabel>
                                            </ListboxOption>
                                            {folders.map((folder) => (
                                                <ListboxOption key={folder.uuid} value={folder.uuid}>
                                                    <FolderIcon />
                                                    <ListboxLabel>
                                                        {folderLabel(folder, t("label.folder-archive"))}
                                                    </ListboxLabel>
                                                </ListboxOption>
                                            ))}
                                        </Listbox>
                                    </Field>
                                )}
                            </form.Field>
                        )}

                        <form.Field name={"description"}>
                            {(fieldApi) => (
                                <Field>
                                    <Label>{t("label.description")}</Label>
                                    <Description>{t("description.description")}</Description>
                                    <Textarea
                                        rows={3}
                                        maxLength={1024}
                                        value={fieldApi.state.value}
                                        onChange={(event) => fieldApi.handleChange(event.target.value)}
                                    />
                                </Field>
                            )}
                        </form.Field>

                        {deck === null && (
                            <form.Field name={"url"}>
                                {(fieldApi) => (
                                    <Field>
                                        <Label>{t("label.import-url")}</Label>
                                        <Description>{t("description.create-url")}</Description>
                                        <Input
                                            type={"url"}
                                            placeholder={"https://moxfield.com/decks/…"}
                                            value={fieldApi.state.value}
                                            onChange={(event) => fieldApi.handleChange(event.target.value)}
                                        />
                                    </Field>
                                )}
                            </form.Field>
                        )}

                        {deck === null && (
                            <form.Field name={"intoCollection"}>
                                {(fieldApi) => (
                                    <CheckboxField>
                                        <Checkbox
                                            checked={fieldApi.state.value}
                                            onChange={(checked) => fieldApi.handleChange(checked)}
                                        />
                                        <Label>{t("label.create-collection")}</Label>
                                        <Description>{t("description.create-collection")}</Description>
                                    </CheckboxField>
                                )}
                            </form.Field>
                        )}

                        <form.Field name={"visibility"}>
                            {(fieldApi) => (
                                <Field>
                                    <Label>{t("label.visibility")}</Label>
                                    <Listbox value={fieldApi.state.value} onChange={fieldApi.handleChange}>
                                        <ListboxOption value={Visibility.Private}>
                                            <LockClosedIcon />
                                            <ListboxLabel>{t("label.visibility-private")}</ListboxLabel>
                                            <ListboxDescription>
                                                {t("description.visibility-private")}
                                            </ListboxDescription>
                                        </ListboxOption>
                                        <ListboxOption value={Visibility.Unlisted}>
                                            <LinkIcon />
                                            <ListboxLabel>{t("label.visibility-unlisted")}</ListboxLabel>
                                            <ListboxDescription>
                                                {t("description.visibility-unlisted")}
                                            </ListboxDescription>
                                        </ListboxOption>
                                        <ListboxOption value={Visibility.Public}>
                                            <GlobeAltIcon />
                                            <ListboxLabel>{t("label.visibility-public")}</ListboxLabel>
                                            <ListboxDescription>
                                                {t("description.visibility-public")}
                                            </ListboxDescription>
                                        </ListboxOption>
                                    </Listbox>
                                </Field>
                            )}
                        </form.Field>
                    </FieldGroup>
                </DialogBody>
                <DialogActions>
                    <Button plain onClick={onClose}>
                        {tg("button.cancel")}
                    </Button>
                    <PrimaryButton type={"submit"}>
                        {deck === null ? t("button.create-deck") : t("button.save-deck")}
                    </PrimaryButton>
                </DialogActions>
            </Form>
        </Dialog>
    );
}
