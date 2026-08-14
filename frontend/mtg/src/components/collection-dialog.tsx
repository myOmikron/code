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
    Label,
    Listbox,
    ListboxDescription,
    ListboxLabel,
    ListboxOption,
    PrimaryButton,
    RequiredLabel,
    Textarea,
} from "components";
import { Input } from "components";
import { GlobeAltIcon, LinkIcon, LockClosedIcon } from "@heroicons/react/20/solid";
import { useTranslation } from "react-i18next";
import { useForm } from "@tanstack/react-form";
import { Api } from "src/api/api";
import { Visibility } from "src/api/generated";
import type { CollectionResponse } from "src/api/generated";

/**
 * The properties for {@link CollectionDialog}
 */
export type CollectionDialogProps = {
    /** Whether the dialog is on screen */
    open: boolean;
    /** The collection to edit, or `null` to create a new one */
    collection: CollectionResponse | null;
    /** Called when the dialog should close without having saved anything */
    onClose: () => void;
    /**
     * Called after the collection was saved successfully
     *
     * Carries the collection when it was just created, `null` when an existing
     * one was edited — a caller that wants to send the user into a new box
     * needs its id, and there is no second request to learn it from.
     */
    onSaved: (created: CollectionResponse | null) => void;
};

/**
 * Dialog for creating or editing a collection.
 *
 * A collection doubles as the physical container, so the name is what stands on
 * the box — hence the free-text description rather than a fixed set of fields.
 *
 * @returns the dialog
 */
export function CollectionDialog({ open, collection, onClose, onSaved }: CollectionDialogProps) {
    const [t] = useTranslation("collection");
    const [tg] = useTranslation();

    const form = useForm({
        defaultValues: {
            name: collection?.name ?? "",
            description: collection?.description ?? "",
            visibility: collection?.visibility ?? Visibility.Private,
        },
        validators: {
            onSubmitAsync: async ({ value: { name, description, visibility } }) => {
                if (collection === null) {
                    const created = await Api.collections.create({ name, description, visibility });
                    form.reset();
                    onSaved(created);
                    return;
                }

                await Api.collections.update(collection.uuid, { name, description });
                // Its own endpoint, and only worth calling when it actually
                // changed: switching away from `Unlisted` revokes the share link.
                if (visibility !== collection.visibility) {
                    await Api.collections.setVisibility(collection.uuid, visibility);
                }
                form.reset();
                onSaved(null);
            },
        },
    });

    return (
        <Dialog open={open} onClose={onClose}>
            <DialogTitle>
                {collection === null ? t("heading.create-collection") : t("heading.edit-collection")}
            </DialogTitle>
            <Form onSubmit={form.handleSubmit}>
                <DialogBody>
                    <FieldGroup>
                        <form.Field name={"name"}>
                            {(fieldApi) => (
                                <Field>
                                    <RequiredLabel>{t("label.name")}</RequiredLabel>
                                    <Description>{t("description.name")}</Description>
                                    <Input
                                        autoFocus={true}
                                        required={true}
                                        maxLength={255}
                                        invalid={fieldApi.state.meta.errors.length > 0}
                                        value={fieldApi.state.value}
                                        onChange={(e) => fieldApi.handleChange(e.target.value)}
                                    />
                                    {fieldApi.state.meta.errors.map((error) => (
                                        <ErrorMessage key={String(error)}>{String(error)}</ErrorMessage>
                                    ))}
                                </Field>
                            )}
                        </form.Field>

                        <form.Field name={"description"}>
                            {(fieldApi) => (
                                <Field>
                                    <Label>{t("label.description")}</Label>
                                    <Description>{t("description.description")}</Description>
                                    <Textarea
                                        rows={3}
                                        maxLength={1024}
                                        invalid={fieldApi.state.meta.errors.length > 0}
                                        value={fieldApi.state.value}
                                        onChange={(e) => fieldApi.handleChange(e.target.value)}
                                    />
                                    {fieldApi.state.meta.errors.map((error) => (
                                        <ErrorMessage key={String(error)}>{String(error)}</ErrorMessage>
                                    ))}
                                </Field>
                            )}
                        </form.Field>

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
                        {collection === null ? t("button.create-collection") : t("button.save-collection")}
                    </PrimaryButton>
                </DialogActions>
            </Form>
        </Dialog>
    );
}
