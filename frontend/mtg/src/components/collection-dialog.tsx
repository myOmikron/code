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
    Text,
    Textarea,
} from "components";
import { Input } from "components";
import { GlobeAltIcon, LinkIcon, LockClosedIcon } from "@heroicons/react/20/solid";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useForm } from "@tanstack/react-form";
import clsx from "clsx";
import { Api } from "src/api/api";
import { Visibility } from "src/api/generated";
import type { CollectionResponse } from "src/api/generated";
import { CollectionMarker } from "src/components/collection-marker";
import {
    COLLECTION_COLORS,
    COLLECTION_COLOR_FALLBACK,
    COLLECTION_ICONS,
    COLLECTION_ICON_FALLBACK,
} from "src/utils/collection-style";

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
     * one was edited — a caller that wants to send the user into a new collection
     * needs its id, and there is no second request to learn it from.
     */
    onSaved: (created: CollectionResponse | null) => void;
};

/**
 * Dialog for creating or editing a collection.
 *
 * A collection doubles as the physical container, so the name is what stands on
 * it — hence the free-text description rather than a fixed set of fields.
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
            color: collection?.color ?? COLLECTION_COLOR_FALLBACK,
            icon: collection?.icon ?? COLLECTION_ICON_FALLBACK,
            visibility: collection?.visibility ?? Visibility.Private,
        },
        validators: {
            onSubmitAsync: async ({ value: { name, description, color, icon, visibility } }) => {
                if (collection === null) {
                    const created = await Api.collections.create({ name, description, color, icon, visibility });
                    form.reset();
                    onSaved(created);
                    return;
                }

                await Api.collections.update(collection.uuid, { name, description, color, icon });
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

    // The dialog stays mounted, so the form has to be pointed at whatever it is
    // opened on: `defaultValues` is read once, at mount.
    useEffect(() => {
        form.reset({
            name: collection?.name ?? "",
            description: collection?.description ?? "",
            color: collection?.color ?? COLLECTION_COLOR_FALLBACK,
            icon: collection?.icon ?? COLLECTION_ICON_FALLBACK,
            visibility: collection?.visibility ?? Visibility.Private,
        });
        // Deliberately not keyed on `form`, which is rebuilt on every render.
    }, [collection, open]);

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

                        <form.Subscribe selector={(state) => [state.values.color, state.values.icon] as const}>
                            {([color, icon]) => (
                                <Field>
                                    <Label>{t("label.marker")}</Label>
                                    <Description>{t("description.marker")}</Description>
                                    <div className={"mt-3 flex flex-col gap-4"}>
                                        <div className={"flex items-center gap-3"}>
                                            <CollectionMarker color={color} icon={icon} size={"xl"} />
                                            <Text className={"text-sm"}>{t("description.marker-preview")}</Text>
                                        </div>
                                        <form.Field name={"color"}>
                                            {(fieldApi) => (
                                                <div
                                                    role={"group"}
                                                    aria-label={t("label.marker-color")}
                                                    className={"flex flex-wrap gap-2"}
                                                >
                                                    {COLLECTION_COLORS.map((option) => (
                                                        <MarkerButton
                                                            key={option}
                                                            label={t("accessibility.collection-color", {
                                                                color: option,
                                                            })}
                                                            selected={fieldApi.state.value === option}
                                                            onClick={() => fieldApi.handleChange(option)}
                                                        >
                                                            <CollectionMarker color={option} icon={icon} size={"lg"} />
                                                        </MarkerButton>
                                                    ))}
                                                </div>
                                            )}
                                        </form.Field>
                                        <form.Field name={"icon"}>
                                            {(fieldApi) => (
                                                <div
                                                    role={"group"}
                                                    aria-label={t("label.marker-icon")}
                                                    className={"flex flex-wrap gap-2"}
                                                >
                                                    {COLLECTION_ICONS.map((option) => (
                                                        <MarkerButton
                                                            key={option}
                                                            label={t("accessibility.collection-icon", {
                                                                icon: option,
                                                            })}
                                                            selected={fieldApi.state.value === option}
                                                            onClick={() => fieldApi.handleChange(option)}
                                                        >
                                                            <CollectionMarker color={color} icon={option} size={"lg"} />
                                                        </MarkerButton>
                                                    ))}
                                                </div>
                                            )}
                                        </form.Field>
                                    </div>
                                </Field>
                            )}
                        </form.Subscribe>

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

/**
 * The properties for {@link MarkerButton}
 */
type MarkerButtonProps = {
    /** What picking this does, for screen readers */
    label: string;
    /** Whether this is what the collection wears */
    selected: boolean;
    /** Picks it */
    onClick: () => void;
    /** The marker it shows */
    children: ReactNode;
};

/**
 * One swatch in the colour or icon row
 *
 * @returns the button
 */
function MarkerButton({ label, selected, onClick, children }: MarkerButtonProps) {
    return (
        <button
            type={"button"}
            aria-label={label}
            aria-pressed={selected}
            onClick={onClick}
            className={clsx(
                "rounded-full transition",
                selected
                    ? "ring-2 ring-zinc-950 ring-offset-2 ring-offset-white dark:ring-white dark:ring-offset-zinc-900"
                    : "hover:opacity-75",
            )}
        >
            {children}
        </button>
    );
}
