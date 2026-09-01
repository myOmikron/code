import { GlobeAltIcon, LinkIcon, LockClosedIcon } from "@heroicons/react/20/solid";
import {
    Button,
    Checkbox,
    CheckboxField,
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
    Listbox,
    ListboxDescription,
    ListboxLabel,
    ListboxOption,
    PrimaryButton,
    RequiredLabel,
    Textarea,
} from "components";
import { useForm } from "@tanstack/react-form";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { PairingSystem, SeatPolicy, Visibility } from "src/api/generated";
import type { TournamentResponse, TournamentSettingsErrors, TournamentSettingsRequest } from "src/api/generated";
import { InlineError } from "src/components/inline-error";
import type { ValidationErrors } from "src/utils/error";
import { handleFormError, isFormError } from "src/utils/error";

/**
 * The properties for {@link TournamentDialog}
 */
export type TournamentDialogProps = {
    /** Whether the dialog is on screen */
    open: boolean;
    /** The tournament to edit, or `null` to build a new one */
    tournament: TournamentResponse | null;
    /** Called when the dialog should close without having saved anything */
    onClose: () => void;
    /**
     * Called after the tournament was saved
     *
     * Carries the tournament when it was just created, `null` when an existing one was edited.
     */
    onSaved: (created: TournamentResponse | null) => void;
};

/** What a fresh form starts on, before an existing tournament overrides it */
const DEFAULTS = {
    name: "",
    description: "",
    format: "commander",
    podSize: 4,
    gamesPerMatch: 1,
    pairingSystem: PairingSystem.Swiss,
    seatPolicy: SeatPolicy.Random,
    pointsWin: 3,
    pointsDraw: 1,
    pointsLoss: 0,
    pointsBye: 3,
    roundMinutes: 50,
    requireCheckIn: true,
    allowLateEntry: false,
    lateEntryAsLosses: false,
    venue: "",
    startsAt: "",
    visibility: Visibility.Public,
};

/**
 * Converts an ISO timestamp to the local `YYYY-MM-DDTHH:mm` a `datetime-local` input wants
 *
 * @param iso the stored timestamp
 *
 * @returns the value for the input
 */
function toLocalInputValue(iso: string): string {
    const date = new Date(iso);
    const localMs = date.getTime() - date.getTimezoneOffset() * 60_000;
    return new Date(localMs).toISOString().slice(0, 16);
}

/**
 * What the dialog's fields start on for a given tournament, or the blank defaults for a new one
 *
 * @param tournament the tournament to edit, `null` to build a new one
 *
 * @returns the form's default values
 */
function initialValues(tournament: TournamentResponse | null) {
    if (tournament === null) return DEFAULTS;
    return {
        name: tournament.name,
        description: tournament.description ?? "",
        format: tournament.format,
        podSize: tournament.pod_size,
        gamesPerMatch: tournament.games_per_match,
        pairingSystem: tournament.pairing_system,
        seatPolicy: tournament.seat_policy,
        pointsWin: tournament.points_win,
        pointsDraw: tournament.points_draw,
        pointsLoss: tournament.points_loss,
        pointsBye: tournament.points_bye,
        roundMinutes: tournament.round_minutes,
        requireCheckIn: tournament.require_check_in,
        allowLateEntry: tournament.allow_late_entry,
        lateEntryAsLosses: tournament.late_entry_as_losses,
        venue: tournament.venue ?? "",
        startsAt: tournament.starts_at == null ? "" : toLocalInputValue(tournament.starts_at),
        visibility: tournament.visibility,
    };
}

/**
 * Maps every field of {@link TournamentSettingsErrors} onto the form field or form-level message
 * that should carry it.
 *
 * `invalid_points` names no single field — the request carries four — so it lands on the form as
 * a whole; `settings_locked` is likewise a whole-request refusal, worded the same as the
 * standing banner shown while the event is running.
 *
 * @param t the `tournament` namespace translator
 *
 * @returns the handler map {@link handleFormError} wants
 */
function settingsErrorHandlers(t: (key: string) => string): {
    [Key in keyof TournamentSettingsErrors]: (errors: ValidationErrors) => void;
} {
    return {
        invalid_pod_size: (errors) => {
            errors.fields.podSize = t("error.invalid-pod-size");
        },
        invalid_games_per_match: (errors) => {
            errors.fields.gamesPerMatch = t("error.invalid-games-per-match");
        },
        invalid_points: (errors) => {
            errors.form = t("error.invalid-points");
        },
        invalid_round_length: (errors) => {
            errors.fields.roundMinutes = t("error.invalid-round-length");
        },
        settings_locked: (errors) => {
            errors.form = t("description.settings-locked");
        },
    };
}

/**
 * Dialog for starting a tournament or changing its settings.
 *
 * Visibility is only offered while building a new one: an existing tournament's visibility has
 * its own standalone control on the settings tab, next to the status and join-code controls it
 * shares a page with.
 *
 * @returns the dialog
 */
export function TournamentDialog({ open, tournament, onClose, onSaved }: TournamentDialogProps) {
    const [t] = useTranslation("tournament");
    const [tg] = useTranslation();

    const form = useForm({
        defaultValues: initialValues(tournament),
        validators: {
            onSubmitAsync: async ({ value }) => {
                const settings: TournamentSettingsRequest = {
                    name: value.name,
                    description: value.description.trim() === "" ? null : value.description,
                    format: value.format,
                    pod_size: value.podSize,
                    games_per_match: value.gamesPerMatch,
                    pairing_system: value.pairingSystem,
                    seat_policy: value.seatPolicy,
                    points_win: value.pointsWin,
                    points_draw: value.pointsDraw,
                    points_loss: value.pointsLoss,
                    points_bye: value.pointsBye,
                    round_minutes: value.roundMinutes,
                    require_check_in: value.requireCheckIn,
                    allow_late_entry: value.allowLateEntry,
                    late_entry_as_losses: value.lateEntryAsLosses,
                    venue: value.venue.trim() === "" ? null : value.venue,
                    starts_at: value.startsAt === "" ? null : new Date(value.startsAt).toISOString(),
                };

                if (tournament === null) {
                    const created = await Api.tournaments.create({ settings, visibility: value.visibility });
                    if (isFormError(created)) return handleFormError(created.error, settingsErrorHandlers(t));
                    form.reset();
                    onSaved(created);
                    return;
                }

                const updated = await Api.tournaments.update(tournament.uuid, settings);
                if (isFormError(updated)) return handleFormError(updated.error, settingsErrorHandlers(t));
                form.reset();
                onSaved(null);
            },
        },
    });

    // The dialog stays mounted, so the form has to be pointed at whatever it is opened on:
    // `defaultValues` is read once, at mount.
    useEffect(() => {
        form.reset(initialValues(tournament));
        // Deliberately not keyed on `form`, which is rebuilt on every render.
    }, [tournament, open]);

    // `handleFormError` is the only writer of `errorMap.onSubmit` here, so its `ValidationErrors`
    // shape is known even where the form library's own inference does not carry it through.
    const formError = (form.state.errorMap.onSubmit as ValidationErrors | undefined)?.form;

    return (
        <Dialog open={open} onClose={onClose} size={"xl"}>
            <DialogTitle>
                {tournament === null ? t("heading.create-tournament") : t("heading.edit-tournament")}
            </DialogTitle>
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
                                        maxLength={128}
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

                        <form.Field name={"description"}>
                            {(fieldApi) => (
                                <Field>
                                    <Label>{t("label.description")}</Label>
                                    <Textarea
                                        rows={2}
                                        maxLength={1024}
                                        value={fieldApi.state.value}
                                        onChange={(event) => fieldApi.handleChange(event.target.value)}
                                    />
                                </Field>
                            )}
                        </form.Field>

                        <div className={"grid grid-cols-1 gap-4 sm:grid-cols-3"}>
                            <form.Field name={"format"}>
                                {(fieldApi) => (
                                    <Field>
                                        <RequiredLabel>{t("label.format")}</RequiredLabel>
                                        <Input
                                            required={true}
                                            maxLength={32}
                                            value={fieldApi.state.value}
                                            onChange={(event) => fieldApi.handleChange(event.target.value)}
                                        />
                                    </Field>
                                )}
                            </form.Field>

                            <form.Field name={"podSize"}>
                                {(fieldApi) => (
                                    <Field>
                                        <Label>{t("label.pod-size")}</Label>
                                        <Input
                                            type={"number"}
                                            min={2}
                                            max={5}
                                            invalid={fieldApi.state.meta.errors.length > 0}
                                            value={fieldApi.state.value}
                                            onChange={(event) => fieldApi.handleChange(Number(event.target.value))}
                                        />
                                        {fieldApi.state.meta.errors.map((error) => (
                                            <ErrorMessage key={String(error)}>{String(error)}</ErrorMessage>
                                        ))}
                                    </Field>
                                )}
                            </form.Field>

                            <form.Field name={"gamesPerMatch"}>
                                {(fieldApi) => (
                                    <Field>
                                        <Label>{t("label.games-per-match")}</Label>
                                        <Input
                                            type={"number"}
                                            min={1}
                                            max={5}
                                            invalid={fieldApi.state.meta.errors.length > 0}
                                            value={fieldApi.state.value}
                                            onChange={(event) => fieldApi.handleChange(Number(event.target.value))}
                                        />
                                        {fieldApi.state.meta.errors.map((error) => (
                                            <ErrorMessage key={String(error)}>{String(error)}</ErrorMessage>
                                        ))}
                                    </Field>
                                )}
                            </form.Field>
                        </div>

                        <div className={"grid grid-cols-1 gap-4 sm:grid-cols-2"}>
                            <form.Field name={"pairingSystem"}>
                                {(fieldApi) => (
                                    <Field>
                                        <Label>{t("label.pairing-system")}</Label>
                                        <Listbox value={fieldApi.state.value} onChange={fieldApi.handleChange}>
                                            <ListboxOption value={PairingSystem.Swiss}>
                                                <ListboxLabel>{t("label.pairing-swiss")}</ListboxLabel>
                                            </ListboxOption>
                                            <ListboxOption value={PairingSystem.Manual}>
                                                <ListboxLabel>{t("label.pairing-manual")}</ListboxLabel>
                                            </ListboxOption>
                                        </Listbox>
                                    </Field>
                                )}
                            </form.Field>

                            <form.Field name={"seatPolicy"}>
                                {(fieldApi) => (
                                    <Field>
                                        <Label>{t("label.seat-policy")}</Label>
                                        <Listbox value={fieldApi.state.value} onChange={fieldApi.handleChange}>
                                            <ListboxOption value={SeatPolicy.Random}>
                                                <ListboxLabel>{t("label.seat-random")}</ListboxLabel>
                                            </ListboxOption>
                                            <ListboxOption value={SeatPolicy.Balanced}>
                                                <ListboxLabel>{t("label.seat-balanced")}</ListboxLabel>
                                            </ListboxOption>
                                            <ListboxOption value={SeatPolicy.Organizer}>
                                                <ListboxLabel>{t("label.seat-organizer")}</ListboxLabel>
                                            </ListboxOption>
                                        </Listbox>
                                    </Field>
                                )}
                            </form.Field>
                        </div>

                        <div className={"grid grid-cols-2 gap-4 sm:grid-cols-4"}>
                            <form.Field name={"pointsWin"}>
                                {(fieldApi) => (
                                    <Field>
                                        <Label>{t("label.points-win")}</Label>
                                        <Input
                                            type={"number"}
                                            min={0}
                                            value={fieldApi.state.value}
                                            onChange={(event) => fieldApi.handleChange(Number(event.target.value))}
                                        />
                                    </Field>
                                )}
                            </form.Field>
                            <form.Field name={"pointsDraw"}>
                                {(fieldApi) => (
                                    <Field>
                                        <Label>{t("label.points-draw")}</Label>
                                        <Input
                                            type={"number"}
                                            min={0}
                                            value={fieldApi.state.value}
                                            onChange={(event) => fieldApi.handleChange(Number(event.target.value))}
                                        />
                                    </Field>
                                )}
                            </form.Field>
                            <form.Field name={"pointsLoss"}>
                                {(fieldApi) => (
                                    <Field>
                                        <Label>{t("label.points-loss")}</Label>
                                        <Input
                                            type={"number"}
                                            min={0}
                                            value={fieldApi.state.value}
                                            onChange={(event) => fieldApi.handleChange(Number(event.target.value))}
                                        />
                                    </Field>
                                )}
                            </form.Field>
                            <form.Field name={"pointsBye"}>
                                {(fieldApi) => (
                                    <Field>
                                        <Label>{t("label.points-bye")}</Label>
                                        <Input
                                            type={"number"}
                                            min={0}
                                            value={fieldApi.state.value}
                                            onChange={(event) => fieldApi.handleChange(Number(event.target.value))}
                                        />
                                    </Field>
                                )}
                            </form.Field>
                        </div>

                        <form.Field name={"roundMinutes"}>
                            {(fieldApi) => (
                                <Field>
                                    <Label>{t("label.round-minutes")}</Label>
                                    <Input
                                        type={"number"}
                                        min={10}
                                        max={600}
                                        invalid={fieldApi.state.meta.errors.length > 0}
                                        value={fieldApi.state.value}
                                        onChange={(event) => fieldApi.handleChange(Number(event.target.value))}
                                    />
                                    {fieldApi.state.meta.errors.map((error) => (
                                        <ErrorMessage key={String(error)}>{String(error)}</ErrorMessage>
                                    ))}
                                </Field>
                            )}
                        </form.Field>

                        <form.Field name={"requireCheckIn"}>
                            {(fieldApi) => (
                                <CheckboxField>
                                    <Checkbox
                                        checked={fieldApi.state.value}
                                        onChange={(checked) => fieldApi.handleChange(checked)}
                                    />
                                    <Label>{t("label.require-check-in")}</Label>
                                </CheckboxField>
                            )}
                        </form.Field>

                        <form.Field name={"allowLateEntry"}>
                            {(fieldApi) => (
                                <CheckboxField>
                                    <Checkbox
                                        checked={fieldApi.state.value}
                                        onChange={(checked) => fieldApi.handleChange(checked)}
                                    />
                                    <Label>{t("label.allow-late-entry")}</Label>
                                </CheckboxField>
                            )}
                        </form.Field>

                        <form.Field name={"lateEntryAsLosses"}>
                            {(fieldApi) => (
                                <CheckboxField>
                                    <Checkbox
                                        checked={fieldApi.state.value}
                                        onChange={(checked) => fieldApi.handleChange(checked)}
                                    />
                                    <Label>{t("label.late-entry-as-losses")}</Label>
                                </CheckboxField>
                            )}
                        </form.Field>

                        <div className={"grid grid-cols-1 gap-4 sm:grid-cols-2"}>
                            <form.Field name={"venue"}>
                                {(fieldApi) => (
                                    <Field>
                                        <Label>{t("label.venue")}</Label>
                                        <Input
                                            maxLength={255}
                                            value={fieldApi.state.value}
                                            onChange={(event) => fieldApi.handleChange(event.target.value)}
                                        />
                                    </Field>
                                )}
                            </form.Field>

                            <form.Field name={"startsAt"}>
                                {(fieldApi) => (
                                    <Field>
                                        <Label>{t("label.starts-at")}</Label>
                                        <Input
                                            type={"datetime-local"}
                                            value={fieldApi.state.value}
                                            onChange={(event) => fieldApi.handleChange(event.target.value)}
                                        />
                                    </Field>
                                )}
                            </form.Field>
                        </div>

                        {tournament === null && (
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
                        )}

                        {formError !== undefined && <InlineError>{formError}</InlineError>}
                    </FieldGroup>
                </DialogBody>
                <DialogActions>
                    <Button plain onClick={onClose}>
                        {tg("button.cancel")}
                    </Button>
                    <PrimaryButton type={"submit"}>
                        {tournament === null ? t("button.create-tournament") : t("button.save")}
                    </PrimaryButton>
                </DialogActions>
            </Form>
        </Dialog>
    );
}
