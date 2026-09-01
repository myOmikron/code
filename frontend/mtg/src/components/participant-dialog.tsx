import {
    Button,
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
    Textarea,
} from "components";
import { useForm } from "@tanstack/react-form";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import type { TournamentParticipantResponse } from "src/api/generated";

/**
 * What the dialog is open on: a fresh walk-in, or an existing row being renamed/annotated
 */
export type ParticipantDialogMode = { kind: "add" } | { kind: "edit"; participant: TournamentParticipantResponse };

/**
 * The properties for {@link ParticipantDialog}
 */
export type ParticipantDialogProps = {
    /** The tournament the participant belongs to */
    tournamentUuid: string;
    /** What the dialog is open on, `null` to keep it closed */
    mode: ParticipantDialogMode | null;
    /** Called when the dialog should close without having saved anything */
    onClose: () => void;
    /** Called after the participant was added or updated */
    onSaved: () => void;
};

/**
 * Dialog for an organizer to walk a guest into the roster by name, or to rename an existing row
 * and annotate it.
 *
 * Notes are organizer-only and only ever exist on an existing row: a walk-in cannot be added with
 * notes already attached, so the field only appears in edit mode.
 *
 * @returns the dialog
 */
export function ParticipantDialog({ tournamentUuid, mode, onClose, onSaved }: ParticipantDialogProps) {
    const [t] = useTranslation("tournament");
    const [tg] = useTranslation();

    const initial = () => ({
        displayName: mode?.kind === "edit" ? mode.participant.display_name : "",
        notes: mode?.kind === "edit" ? (mode.participant.notes ?? "") : "",
    });

    const form = useForm({
        defaultValues: initial(),
        validators: {
            onSubmitAsync: async ({ value }) => {
                if (mode === null) return;

                if (mode.kind === "add") {
                    await Api.tournaments.participants.add(tournamentUuid, value.displayName);
                } else {
                    await Api.tournaments.participants.update(tournamentUuid, mode.participant.uuid, {
                        display_name: value.displayName,
                        notes: value.notes.trim() === "" ? null : value.notes,
                    });
                }
                form.reset();
                onSaved();
            },
        },
    });

    // The dialog stays mounted, so the form has to be pointed at whatever it is opened on:
    // `defaultValues` is read once, at mount.
    useEffect(() => {
        form.reset(initial());
        // Deliberately not keyed on `form`, which is rebuilt on every render.
    }, [mode]);

    return (
        <Dialog open={mode !== null} onClose={onClose}>
            <DialogTitle>{mode?.kind === "edit" ? t("heading.edit-player") : t("heading.add-player")}</DialogTitle>
            <Form onSubmit={form.handleSubmit}>
                <DialogBody>
                    <FieldGroup>
                        <form.Field name={"displayName"}>
                            {(fieldApi) => (
                                <Field>
                                    <RequiredLabel>{t("label.name")}</RequiredLabel>
                                    <Input
                                        autoFocus={true}
                                        required={true}
                                        maxLength={64}
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

                        {mode?.kind === "edit" && (
                            <form.Field name={"notes"}>
                                {(fieldApi) => (
                                    <Field>
                                        <Label>{t("label.notes")}</Label>
                                        <Textarea
                                            rows={3}
                                            maxLength={512}
                                            value={fieldApi.state.value}
                                            onChange={(event) => fieldApi.handleChange(event.target.value)}
                                        />
                                    </Field>
                                )}
                            </form.Field>
                        )}
                    </FieldGroup>
                </DialogBody>
                <DialogActions>
                    <Button plain onClick={onClose}>
                        {tg("button.cancel")}
                    </Button>
                    <PrimaryButton type={"submit"}>
                        {mode?.kind === "edit" ? t("button.save") : t("button.add-player")}
                    </PrimaryButton>
                </DialogActions>
            </Form>
        </Dialog>
    );
}
