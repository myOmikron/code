import { useForm } from "@tanstack/react-form";
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
    PrimaryButton,
    RequiredLabel,
    Text,
    Textarea,
} from "components";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import type { WatchListResponse } from "src/api/generated";
import { CollectionMarker } from "src/components/collection-marker";
import { MarkerButton } from "src/components/marker-button";
import { COLLECTION_COLORS, COLLECTION_COLOR_FALLBACK, COLLECTION_ICONS } from "src/utils/collection-style";

/** The pictogram a new watch list is offered with */
const WATCH_LIST_ICON = "eye";

/**
 * The properties for {@link WatchListDialog}
 */
export type WatchListDialogProps = {
    /** Whether the dialog is on screen */
    open: boolean;
    /** The list to edit, or `null` to start a new one */
    list: WatchListResponse | null;
    /** Called when the dialog should close without having saved anything */
    onClose: () => void;
    /**
     * Called after the list was saved successfully
     *
     * Carries the list when it was just created, `null` when an existing one
     * was edited, so a caller that wants to open the new list has its id.
     */
    onSaved: (created: WatchListResponse | null) => void;
};

/**
 * Dialog for starting or renaming a watch list.
 *
 * The same marker a collection wears, for the same reason: a list is picked out
 * of a grid by its colour long before its name is read. Nothing here is shared
 * with anyone, so unlike a collection there is no visibility to choose.
 *
 * @returns the dialog
 */
export function WatchListDialog({ open, list, onClose, onSaved }: WatchListDialogProps) {
    const [t] = useTranslation("watch-list");
    const [tg] = useTranslation();

    const initial = () => ({
        name: list?.name ?? "",
        description: list?.description ?? "",
        color: list?.color ?? COLLECTION_COLOR_FALLBACK,
        icon: list?.icon ?? WATCH_LIST_ICON,
    });

    const form = useForm({
        defaultValues: initial(),
        validators: {
            onSubmitAsync: async ({ value }) => {
                if (list === null) {
                    const created = await Api.watchLists.create(value);
                    form.reset();
                    onSaved(created);
                    return;
                }

                await Api.watchLists.update(list.uuid, value);
                form.reset();
                onSaved(null);
            },
        },
    });

    // The dialog stays mounted, so the form has to be pointed at whatever it is
    // opened on: `defaultValues` is read once, at mount.
    useEffect(() => {
        form.reset(initial());
        // Deliberately not keyed on `form`, which is rebuilt on every render.
    }, [list, open]);

    return (
        <Dialog open={open} onClose={onClose}>
            <DialogTitle>{list === null ? t("heading.create-list") : t("heading.edit-list")}</DialogTitle>
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
                                        value={fieldApi.state.value}
                                        onChange={(e) => fieldApi.handleChange(e.target.value)}
                                    />
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
                                                <div className={"flex flex-wrap gap-2"} role={"group"}>
                                                    {COLLECTION_COLORS.map((option) => (
                                                        <MarkerButton
                                                            key={option}
                                                            label={t("accessibility.marker-color", { color: option })}
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
                                                <div className={"flex flex-wrap gap-2"} role={"group"}>
                                                    {COLLECTION_ICONS.map((option) => (
                                                        <MarkerButton
                                                            key={option}
                                                            label={t("accessibility.marker-icon", { icon: option })}
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
                    </FieldGroup>
                </DialogBody>
                <DialogActions>
                    <Button plain onClick={onClose}>
                        {tg("button.cancel")}
                    </Button>
                    <PrimaryButton type={"submit"}>
                        {list === null ? tg("button.create-watch-list") : t("button.save-list")}
                    </PrimaryButton>
                </DialogActions>
            </Form>
        </Dialog>
    );
}
