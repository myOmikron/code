import { PhotoIcon, TrashIcon } from "@heroicons/react/24/outline";
import { useForm } from "@tanstack/react-form";
import React from "react";
import { useTranslation } from "react-i18next";
import {
    Button,
    Dialog,
    DialogActions,
    DialogBody,
    DialogTitle,
    Description,
    Field,
    FieldGroup,
    Fieldset,
    FileInput,
    Form,
    Input,
    Label,
    Listbox,
    ListboxLabel,
    ListboxOption,
    PrimaryButton,
    RequiredLabel,
    Switch,
    SwitchField,
    Textarea,
} from "components";
import { Api, UUID, itemImageUrl } from "src/api/api";
import { AdminItem, PublicCategory } from "src/api/generated";
import { fileToBase64 } from "src/utils/file";

/**
 * Parse a german or english decimal price into euro cents
 *
 * @param input e.g. "1,20" or "1.20"
 *
 * @returns cents or undefined if invalid
 */
export function parsePriceCents(input: string): number | undefined {
    const normalized = input.trim().replace(",", ".");
    if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return undefined;
    return Math.round(parseFloat(normalized) * 100);
}

/**
 * The properties for {@link ItemFormDialog}
 */
export type ItemFormDialogProps = {
    /** Whether the dialog is shown */
    open: boolean;
    /** The item to edit; create mode when unset */
    editing?: AdminItem;
    /** All categories to pick from */
    categories: PublicCategory[];
    /** Close without saving */
    onClose: () => void;
    /** Called after the item was saved */
    onSaved: () => void;
};

/**
 * Create/edit dialog for an item, including product photo upload
 *
 * @param props {@link ItemFormDialogProps}
 *
 * @returns the dialog
 */
export function ItemFormDialog(props: ItemFormDialogProps) {
    const [t] = useTranslation("admin");
    const [tg] = useTranslation();

    // Image state, kept outside the form: a freshly picked file, or an
    // explicit "remove the existing image" flag.
    const [file, setFile] = React.useState<File | null>(null);
    const [removeImage, setRemoveImage] = React.useState(false);

    /**
     * Build the form's default values from the edited item
     *
     * @returns default values
     */
    const defaults = () => ({
        name: props.editing?.name ?? "",
        price: props.editing ? (props.editing.price_cents / 100).toFixed(2).replace(".", ",") : "",
        additionalInfo: props.editing?.additional_info ?? "",
        category: props.editing?.category ?? ("" as UUID | ""),
        active: props.editing?.active ?? true,
    });

    const form = useForm({
        defaultValues: defaults(),
        validators: {
            onSubmit: ({ value }) => {
                const fields: Record<string, string> = {};
                if (!value.name.trim()) fields.name = t("error.name-required");
                if (parsePriceCents(value.price) === undefined) fields.price = t("error.price-invalid");
                return Object.keys(fields).length > 0 ? { fields } : undefined;
            },
        },
        onSubmit: async ({ value }) => {
            const request = {
                name: value.name.trim(),
                price_cents: parsePriceCents(value.price)!,
                additional_info: value.additionalInfo.trim() || null,
                category: value.category === "" ? null : value.category,
                active: value.active,
            };
            const uuid = props.editing
                ? (await Api.admin.items.update(props.editing.uuid, request), props.editing.uuid)
                : await Api.admin.items.create(request);

            if (file) {
                await Api.admin.items.setImage(uuid, await fileToBase64(file));
            } else if (removeImage && props.editing?.image_version != null) {
                await Api.admin.items.deleteImage(uuid);
            }

            form.reset();
            props.onSaved();
        },
    });

    React.useEffect(() => {
        form.reset(defaults());
        setFile(null);
        setRemoveImage(false);
    }, [props.editing, props.open]);

    // What to show in the preview: the freshly picked file, the existing
    // stored image (unless the user removed it), or a placeholder.
    const previewUrl = file
        ? URL.createObjectURL(file)
        : !removeImage && props.editing?.image_version != null
          ? itemImageUrl(props.editing.uuid, props.editing.image_version)
          : undefined;
    const hasImage = previewUrl !== undefined;

    return (
        <Dialog open={props.open} onClose={props.onClose} size={"md"}>
            <DialogTitle>{props.editing ? t("heading.edit-item") : t("heading.create-item")}</DialogTitle>
            <DialogBody>
                <Form onSubmit={form.handleSubmit}>
                    <Fieldset>
                        <FieldGroup>
                            <form.Field name={"name"}>
                                {(fieldApi) => (
                                    <Field>
                                        <RequiredLabel>{t("label.name")}</RequiredLabel>
                                        <Input
                                            autoFocus
                                            value={fieldApi.state.value}
                                            onChange={(e) => fieldApi.handleChange(e.target.value)}
                                            invalid={fieldApi.state.meta.errors.length > 0}
                                        />
                                    </Field>
                                )}
                            </form.Field>
                            <form.Field name={"price"}>
                                {(fieldApi) => (
                                    <Field>
                                        <RequiredLabel>{t("label.price-euro")}</RequiredLabel>
                                        <Input
                                            inputMode={"decimal"}
                                            placeholder={"1,20"}
                                            value={fieldApi.state.value}
                                            onChange={(e) => fieldApi.handleChange(e.target.value)}
                                            invalid={fieldApi.state.meta.errors.length > 0}
                                        />
                                    </Field>
                                )}
                            </form.Field>
                            <form.Field name={"additionalInfo"}>
                                {(fieldApi) => (
                                    <Field>
                                        <Label>{t("label.additional-info")}</Label>
                                        <Textarea
                                            rows={4}
                                            maxLength={2048}
                                            value={fieldApi.state.value}
                                            onChange={(e) => fieldApi.handleChange(e.target.value)}
                                        />
                                        <Description>{t("description.additional-info")}</Description>
                                    </Field>
                                )}
                            </form.Field>
                            <form.Field name={"category"}>
                                {(fieldApi) => (
                                    <Field>
                                        <Label>{t("label.category")}</Label>
                                        <Listbox<UUID | "">
                                            value={fieldApi.state.value}
                                            onChange={(value) => fieldApi.handleChange(value)}
                                        >
                                            <ListboxOption value={""}>
                                                <ListboxLabel>{t("label.no-category")}</ListboxLabel>
                                            </ListboxOption>
                                            {props.categories.map((category) => (
                                                <ListboxOption key={category.uuid} value={category.uuid}>
                                                    <ListboxLabel>{category.name}</ListboxLabel>
                                                </ListboxOption>
                                            ))}
                                        </Listbox>
                                    </Field>
                                )}
                            </form.Field>
                            <Field>
                                <Label>{t("label.image")}</Label>
                                <div className={"flex items-center gap-4"}>
                                    <div
                                        className={
                                            "size-20 shrink-0 overflow-hidden rounded-[var(--radius-control)] border border-zinc-950/10 bg-[var(--surface-muted)] dark:border-white/10"
                                        }
                                    >
                                        {hasImage ? (
                                            <img src={previewUrl} alt={""} className={"size-full object-cover"} />
                                        ) : (
                                            <div
                                                className={
                                                    "flex size-full items-center justify-center text-zinc-300 dark:text-zinc-700"
                                                }
                                            >
                                                <PhotoIcon className={"size-8"} />
                                            </div>
                                        )}
                                    </div>
                                    <div className={"flex flex-1 flex-col gap-2"}>
                                        <FileInput
                                            accept={"image/jpeg,image/png,image/webp"}
                                            onChange={(e) => {
                                                setFile(e.target.files?.[0] ?? null);
                                                setRemoveImage(false);
                                            }}
                                        />
                                        {hasImage && (
                                            <Button
                                                plain
                                                onClick={() => {
                                                    setFile(null);
                                                    setRemoveImage(true);
                                                }}
                                            >
                                                <TrashIcon />
                                                {t("button.remove-image")}
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            </Field>
                            <form.Field name={"active"}>
                                {(fieldApi) => (
                                    <SwitchField>
                                        <Label>{t("label.active")}</Label>
                                        <Switch
                                            color={"blue"}
                                            checked={fieldApi.state.value}
                                            onChange={(checked) => fieldApi.handleChange(checked)}
                                        />
                                    </SwitchField>
                                )}
                            </form.Field>
                            <DialogActions>
                                <Button plain onClick={props.onClose}>
                                    {tg("button.cancel")}
                                </Button>
                                <form.Subscribe selector={(state) => state.isSubmitting}>
                                    {(isSubmitting) => (
                                        <PrimaryButton type={"submit"} loading={isSubmitting}>
                                            {tg("button.save")}
                                        </PrimaryButton>
                                    )}
                                </form.Subscribe>
                            </DialogActions>
                        </FieldGroup>
                    </Fieldset>
                </Form>
            </DialogBody>
        </Dialog>
    );
}
