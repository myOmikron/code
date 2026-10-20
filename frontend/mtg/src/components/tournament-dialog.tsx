import { ChevronRightIcon } from "@heroicons/react/20/solid";
import {
    Button,
    Combobox,
    ComboboxDescription,
    ComboboxLabel,
    ComboboxOption,
    Description,
    Dialog,
    DialogActions,
    DialogBody,
    DialogTitle,
    ErrorMessage,
    Field,
    FieldGroup,
    Fieldset,
    Form,
    Input,
    Label,
    Legend,
    Listbox,
    ListboxDescription,
    ListboxLabel,
    ListboxOption,
    PrimaryButton,
    RequiredLabel,
    Text,
    Textarea,
} from "components";
import { useForm } from "@tanstack/react-form";
import clsx from "clsx";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { DecklistPolicy, PairingSystem, ParticipantAudience, Visibility } from "src/api/generated";
import type {
    FormatRulesResponse,
    TournamentResponse,
    TournamentSettingsErrors,
    TournamentSettingsRequest,
    TournamentVenueResponse,
} from "src/api/generated";
import { InlineError } from "src/components/inline-error";
import { TournamentFormatPicker } from "src/components/tournament-format-picker";
import { TournamentVisibilityOptions } from "src/components/tournament-visibility-options";
import type { ValidationErrors } from "src/utils/error";
import { handleFormError, isFormError } from "src/utils/error";
import { DEFAULT_CONSTRUCTED_FORMAT, podSizeFor, pointsFor, recommendedRounds } from "src/utils/tournament-format";

/**
 * The format catalog, fetched once and shared by every dialog instance
 *
 * Not loaded in the `/tournaments` route loader: that page is reachable logged out, and this
 * account-only call's 401 would send a guest into a login redirect.
 */
let formatsPromise: Promise<Array<FormatRulesResponse>> | null = null;

/**
 * Loads the format catalog, reusing the first request's promise on every later call
 *
 * @returns the formats on offer
 */
function loadFormats(): Promise<Array<FormatRulesResponse>> {
    formatsPromise ??= Api.decks.formats().then(
        (response) => response.formats,
        (error: unknown) => {
            // Not cached, so the next opening retries; `handleError` already reported it.
            formatsPromise = null;
            throw error;
        },
    );
    return formatsPromise;
}

/**
 * The properties for {@link TournamentDialog}
 */
export type TournamentDialogProps = {
    /** Whether the dialog is on screen */
    open: boolean;
    /** The tournament to edit, or `null` to build a new one */
    tournament: TournamentResponse | null;
    /** How many people are on the roster, for the round recommendation; absent for a new one */
    participantCount?: number;
    /** Called when the dialog should close without having saved anything */
    onClose: () => void;
    /** Called after saving, with the created tournament or `null` after an edit */
    onSaved: (created: TournamentResponse | null) => void;
};

/** Scoring for a pod of four, the pod size of {@link DEFAULT_CONSTRUCTED_FORMAT} (Commander) */
const DEFAULT_POINTS = pointsFor(4);

/**
 * What a fresh form starts on
 *
 * `pairingSystem`, `guestNamesPublic`, `allowLateEntry` and `lateEntryAsLosses` have no field and
 * are always sent as they stand here.
 */
const DEFAULTS = {
    name: "",
    description: "",
    format: DEFAULT_CONSTRUCTED_FORMAT,
    podSize: 4,
    gamesPerMatch: 1,
    pairingSystem: PairingSystem.Swiss,
    decklistPolicy: DecklistPolicy.Optional,
    participantAudience: ParticipantAudience.Organizers,
    guestNamesPublic: true,
    pointsWin: DEFAULT_POINTS.win,
    pointsDraw: DEFAULT_POINTS.draw,
    pointsLoss: DEFAULT_POINTS.loss,
    pointsBye: DEFAULT_POINTS.bye,
    roundMinutes: 50,
    maxParticipants: "",
    plannedRounds: "",
    allowLateEntry: false,
    lateEntryAsLosses: false,
    venue: "",
    venueAddress: "",
    venueInstructions: "",
    startsAt: "",
    visibility: Visibility.Public,
};

/** The best-of lengths a one on one match may have — odd, so a match always has a winner */
const GAMES_PER_MATCH = [1, 3, 5];

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
 * Sends a blank text field as `null`
 *
 * @param value the field's value
 *
 * @returns the value, or `null` when it is blank
 */
function nullIfBlank(value: string): string | null {
    return value.trim() === "" ? null : value;
}

/**
 * Sends a blank number field as `null` ("no limit", "undecided") rather than zero
 *
 * @param value the field's value
 *
 * @returns the number, or `null` when it is blank
 */
function numberOrNull(value: string): number | null {
    return value.trim() === "" ? null : Number(value);
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
        decklistPolicy: tournament.decklist_policy,
        participantAudience: tournament.participant_audience,
        guestNamesPublic: tournament.guest_names_public,
        pointsWin: tournament.points_win,
        pointsDraw: tournament.points_draw,
        pointsLoss: tournament.points_loss,
        pointsBye: tournament.points_bye,
        roundMinutes: tournament.round_minutes,
        maxParticipants: tournament.max_participants?.toString() ?? "",
        plannedRounds: tournament.planned_rounds?.toString() ?? "",
        allowLateEntry: tournament.allow_late_entry,
        lateEntryAsLosses: tournament.late_entry_as_losses,
        venue: tournament.venue ?? "",
        venueAddress: tournament.venue_address ?? "",
        venueInstructions: tournament.venue_instructions ?? "",
        startsAt: tournament.starts_at == null ? "" : toLocalInputValue(tournament.starts_at),
        visibility: tournament.visibility,
    };
}

/**
 * Maps {@link TournamentSettingsErrors} onto form fields or the form-level message
 *
 * Refusals that name a value inside the advanced section also open it, so the message is visible.
 *
 * @param t the `tournament` namespace translator
 * @param revealAdvanced opens the advanced section, for refusals that name a value inside it
 *
 * @returns the handler map {@link handleFormError} wants
 */
function settingsErrorHandlers(
    t: (key: string) => string,
    revealAdvanced: () => void,
): {
    [Key in keyof TournamentSettingsErrors]: (errors: ValidationErrors) => void;
} {
    return {
        invalid_format: (errors) => {
            errors.fields.format = t("error.invalid-format");
        },
        invalid_pod_size: (errors) => {
            errors.form = t("error.invalid-pod-size");
        },
        invalid_games_per_match: (errors) => {
            errors.fields.gamesPerMatch = t("error.invalid-games-per-match");
        },
        invalid_points: (errors) => {
            errors.form = t("error.invalid-points");
            revealAdvanced();
        },
        invalid_round_length: (errors) => {
            errors.fields.roundMinutes = t("error.invalid-round-length");
            revealAdvanced();
        },
        invalid_max_participants: (errors) => {
            errors.fields.maxParticipants = t("error.invalid-max-participants");
            revealAdvanced();
        },
        invalid_planned_rounds: (errors) => {
            errors.fields.plannedRounds = t("error.invalid-planned-rounds");
            revealAdvanced();
        },
        settings_locked: (errors) => {
            errors.form = t("description.settings-locked");
        },
    };
}

/**
 * Dialog for creating a tournament or changing its settings
 *
 * Visibility is only asked on create; an existing tournament changes it on the settings tab.
 *
 * @returns the dialog
 */
export function TournamentDialog({ open, tournament, participantCount, onClose, onSaved }: TournamentDialogProps) {
    const [t] = useTranslation("tournament");
    const [tg] = useTranslation();
    const [advancedOpen, setAdvancedOpen] = useState(false);
    const [formats, setFormats] = useState<Array<FormatRulesResponse>>([]);
    const [venues, setVenues] = useState<Array<TournamentVenueResponse>>([]);

    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        loadFormats().then(
            (loaded) => {
                if (!cancelled) setFormats(loaded);
            },
            () => {
                // Reported by `handleError`; the picker stays disabled.
            },
        );
        return () => {
            cancelled = true;
        };
    }, [open]);

    // Not cached: saving this dialog can add a venue.
    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        Api.tournaments.venues.list().then(
            (loaded) => {
                if (!cancelled) setVenues(loaded.venues);
            },
            () => {
                // Reported by `handleError`; the picker stays empty.
            },
        );
        return () => {
            cancelled = true;
        };
    }, [open]);

    const form = useForm({
        defaultValues: initialValues(tournament),
        validators: {
            onSubmitAsync: async ({ value }) => {
                const settings: TournamentSettingsRequest = {
                    name: value.name,
                    description: nullIfBlank(value.description),
                    format: value.format,
                    pod_size: value.podSize,
                    games_per_match: value.gamesPerMatch,
                    pairing_system: value.pairingSystem,
                    decklist_policy: value.decklistPolicy,
                    participant_audience: value.participantAudience,
                    guest_names_public: value.guestNamesPublic,
                    points_win: value.pointsWin,
                    points_draw: value.pointsDraw,
                    points_loss: value.pointsLoss,
                    points_bye: value.pointsBye,
                    round_minutes: value.roundMinutes,
                    max_participants: numberOrNull(value.maxParticipants),
                    planned_rounds: numberOrNull(value.plannedRounds),
                    allow_late_entry: value.allowLateEntry,
                    late_entry_as_losses: value.lateEntryAsLosses,
                    venue: nullIfBlank(value.venue),
                    venue_address: nullIfBlank(value.venueAddress),
                    venue_instructions: nullIfBlank(value.venueInstructions),
                    starts_at: value.startsAt === "" ? null : new Date(value.startsAt).toISOString(),
                };

                const errorHandlers = settingsErrorHandlers(t, () => setAdvancedOpen(true));

                if (tournament === null) {
                    const created = await Api.tournaments.create({ settings, visibility: value.visibility });
                    if (isFormError(created)) return handleFormError(created.error, errorHandlers);
                    form.reset();
                    onSaved(created);
                    return;
                }

                const updated = await Api.tournaments.update(tournament.uuid, settings);
                if (isFormError(updated)) return handleFormError(updated.error, errorHandlers);
                form.reset();
                onSaved(null);
            },
        },
    });

    // The dialog stays mounted and `defaultValues` is only read at mount.
    useEffect(() => {
        form.reset(initialValues(tournament));
        // `form` is rebuilt on every render, so it stays out of the deps.
    }, [tournament, open]);

    const pointFields = [
        ["pointsWin", t("label.points-win")],
        ["pointsDraw", t("label.points-draw")],
        ["pointsLoss", t("label.points-loss")],
        ["pointsBye", t("label.points-bye")],
    ] as const;

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

                        <form.Subscribe selector={(state) => state.values.podSize <= 2}>
                            {(oneOnOne) => (
                                <form.Field name={"format"}>
                                    {(fieldApi) => (
                                        <TournamentFormatPicker
                                            value={fieldApi.state.value}
                                            formats={formats}
                                            disabled={formats.length === 0}
                                            errors={fieldApi.state.meta.errors.map(String)}
                                            onChange={(slug) => {
                                                fieldApi.handleChange(slug);
                                                // Only a new event takes the default best-of and points.
                                                const podSize = podSizeFor(slug);
                                                form.setFieldValue("podSize", podSize);
                                                if (podSize > 2) form.setFieldValue("gamesPerMatch", 1);
                                                else if (tournament === null) form.setFieldValue("gamesPerMatch", 3);
                                                if (tournament === null) {
                                                    const points = pointsFor(podSize);
                                                    form.setFieldValue("pointsWin", points.win);
                                                    form.setFieldValue("pointsDraw", points.draw);
                                                    form.setFieldValue("pointsLoss", points.loss);
                                                    form.setFieldValue("pointsBye", points.bye);
                                                }
                                            }}
                                            aside={
                                                oneOnOne && (
                                                    <form.Field name={"gamesPerMatch"}>
                                                        {(gamesApi) => (
                                                            <Field>
                                                                <Label>{t("label.games-per-match")}</Label>
                                                                <Listbox
                                                                    value={gamesApi.state.value}
                                                                    invalid={gamesApi.state.meta.errors.length > 0}
                                                                    onChange={gamesApi.handleChange}
                                                                >
                                                                    {GAMES_PER_MATCH.map((games) => (
                                                                        <ListboxOption key={games} value={games}>
                                                                            <ListboxLabel>
                                                                                {t("label.best-of", { games })}
                                                                            </ListboxLabel>
                                                                        </ListboxOption>
                                                                    ))}
                                                                </Listbox>
                                                                {gamesApi.state.meta.errors.map((error) => (
                                                                    <ErrorMessage key={String(error)}>
                                                                        {String(error)}
                                                                    </ErrorMessage>
                                                                ))}
                                                            </Field>
                                                        )}
                                                    </form.Field>
                                                )
                                            }
                                        />
                                    )}
                                </form.Field>
                            )}
                        </form.Subscribe>

                        {tournament === null && (
                            <form.Field name={"visibility"}>
                                {(fieldApi) => (
                                    <Field>
                                        <Label>{t("label.visibility")}</Label>
                                        <Listbox value={fieldApi.state.value} onChange={fieldApi.handleChange}>
                                            <TournamentVisibilityOptions />
                                        </Listbox>
                                    </Field>
                                )}
                            </form.Field>
                        )}

                        <div>
                            <button
                                type={"button"}
                                aria-expanded={advancedOpen}
                                onClick={() => setAdvancedOpen((held) => !held)}
                                className={
                                    "flex items-center gap-1 text-base/6 font-medium text-zinc-950 sm:text-sm/6 dark:text-white"
                                }
                            >
                                {t("button.advanced-settings")}
                                <ChevronRightIcon
                                    className={clsx(
                                        "size-4 shrink-0 transition-transform",
                                        advancedOpen && "rotate-90",
                                    )}
                                    aria-hidden={true}
                                />
                            </button>
                            {!advancedOpen && <Text>{t("description.advanced-settings")}</Text>}
                            {advancedOpen && (
                                <div className={"mt-4 space-y-6"}>
                                    <form.Field name={"decklistPolicy"}>
                                        {(fieldApi) => (
                                            <Field>
                                                <Label>{t("label.decklist-policy")}</Label>
                                                <Listbox value={fieldApi.state.value} onChange={fieldApi.handleChange}>
                                                    <ListboxOption value={DecklistPolicy.Optional}>
                                                        <ListboxLabel>
                                                            {t("label.decklist-policy-optional")}
                                                        </ListboxLabel>
                                                        <ListboxDescription>
                                                            {t("description.decklist-policy-optional")}
                                                        </ListboxDescription>
                                                    </ListboxOption>
                                                    <ListboxOption value={DecklistPolicy.RequiredToCheckIn}>
                                                        <ListboxLabel>
                                                            {t("label.decklist-policy-required-check-in")}
                                                        </ListboxLabel>
                                                        <ListboxDescription>
                                                            {t("description.decklist-policy-required-check-in")}
                                                        </ListboxDescription>
                                                    </ListboxOption>
                                                    <ListboxOption value={DecklistPolicy.RequiredToRegister}>
                                                        <ListboxLabel>
                                                            {t("label.decklist-policy-required-register")}
                                                        </ListboxLabel>
                                                        <ListboxDescription>
                                                            {t("description.decklist-policy-required-register")}
                                                        </ListboxDescription>
                                                    </ListboxOption>
                                                </Listbox>
                                            </Field>
                                        )}
                                    </form.Field>

                                    <form.Field name={"participantAudience"}>
                                        {(fieldApi) => (
                                            <Field>
                                                <Label>{t("label.participant-audience")}</Label>
                                                <Listbox value={fieldApi.state.value} onChange={fieldApi.handleChange}>
                                                    <ListboxOption value={ParticipantAudience.Organizers}>
                                                        <ListboxLabel>
                                                            {t("label.participant-audience-organizers")}
                                                        </ListboxLabel>
                                                        <ListboxDescription>
                                                            {t("description.participant-audience-organizers")}
                                                        </ListboxDescription>
                                                    </ListboxOption>
                                                    <ListboxOption value={ParticipantAudience.Participants}>
                                                        <ListboxLabel>
                                                            {t("label.participant-audience-participants")}
                                                        </ListboxLabel>
                                                        <ListboxDescription>
                                                            {t("description.participant-audience-participants")}
                                                        </ListboxDescription>
                                                    </ListboxOption>
                                                    <ListboxOption value={ParticipantAudience.Anyone}>
                                                        <ListboxLabel>
                                                            {t("label.participant-audience-anyone")}
                                                        </ListboxLabel>
                                                        <ListboxDescription>
                                                            {t("description.participant-audience-anyone")}
                                                        </ListboxDescription>
                                                    </ListboxOption>
                                                </Listbox>
                                            </Field>
                                        )}
                                    </form.Field>

                                    <div className={"grid grid-cols-1 gap-4 sm:grid-cols-2"}>
                                        <form.Field name={"venue"}>
                                            {(fieldApi) => (
                                                <Field>
                                                    <Label>{t("label.venue")}</Label>
                                                    {venues.length > 0 && (
                                                        // Unbound and always blank: a pick only fills the inputs.
                                                        <Combobox<TournamentVenueResponse | null>
                                                            options={venues}
                                                            by={"uuid"}
                                                            value={null}
                                                            displayValue={() => ""}
                                                            placeholder={t("label.venue-saved")}
                                                            aria-label={t("label.venue-saved")}
                                                            onChange={(picked) => {
                                                                if (picked === null) return;
                                                                fieldApi.handleChange(picked.name);
                                                                form.setFieldValue(
                                                                    "venueAddress",
                                                                    picked.address ?? "",
                                                                );
                                                                form.setFieldValue(
                                                                    "venueInstructions",
                                                                    picked.instructions ?? "",
                                                                );
                                                            }}
                                                        >
                                                            {(picked) => (
                                                                <ComboboxOption value={picked}>
                                                                    <ComboboxLabel>{picked.name}</ComboboxLabel>
                                                                    {picked.address != null &&
                                                                        picked.address !== "" && (
                                                                            <ComboboxDescription>
                                                                                {picked.address}
                                                                            </ComboboxDescription>
                                                                        )}
                                                                </ComboboxOption>
                                                            )}
                                                        </Combobox>
                                                    )}
                                                    <Input
                                                        className={venues.length > 0 ? "mt-2" : undefined}
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

                                    <form.Field name={"venueAddress"}>
                                        {(fieldApi) => (
                                            <Field>
                                                <Label>{t("label.venue-address")}</Label>
                                                <Input
                                                    maxLength={512}
                                                    value={fieldApi.state.value}
                                                    onChange={(event) => fieldApi.handleChange(event.target.value)}
                                                />
                                            </Field>
                                        )}
                                    </form.Field>

                                    <form.Field name={"venueInstructions"}>
                                        {(fieldApi) => (
                                            <Field>
                                                <Label>{t("label.venue-instructions")}</Label>
                                                <Description>{t("description.venue-instructions")}</Description>
                                                <Textarea
                                                    rows={2}
                                                    maxLength={1024}
                                                    value={fieldApi.state.value}
                                                    onChange={(event) => fieldApi.handleChange(event.target.value)}
                                                />
                                            </Field>
                                        )}
                                    </form.Field>

                                    <form.Field name={"maxParticipants"}>
                                        {(fieldApi) => (
                                            <Field>
                                                <Label>{t("label.max-participants")}</Label>
                                                <Input
                                                    type={"number"}
                                                    min={1}
                                                    placeholder={t("label.unlimited")}
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

                                    <form.Field name={"roundMinutes"}>
                                        {(fieldApi) => (
                                            <Field>
                                                <Label>{t("label.round-minutes")}</Label>
                                                <Description>{t("description.round-minutes")}</Description>
                                                <Input
                                                    type={"number"}
                                                    min={10}
                                                    max={600}
                                                    invalid={fieldApi.state.meta.errors.length > 0}
                                                    value={fieldApi.state.value}
                                                    onChange={(event) =>
                                                        fieldApi.handleChange(Number(event.target.value))
                                                    }
                                                />
                                                {fieldApi.state.meta.errors.map((error) => (
                                                    <ErrorMessage key={String(error)}>{String(error)}</ErrorMessage>
                                                ))}
                                            </Field>
                                        )}
                                    </form.Field>

                                    <form.Subscribe selector={(state) => state.values.podSize}>
                                        {(podSize) => (
                                            <form.Field name={"plannedRounds"}>
                                                {(fieldApi) => (
                                                    <Field>
                                                        <Label>{t("label.planned-rounds")}</Label>
                                                        <Input
                                                            type={"number"}
                                                            min={1}
                                                            placeholder={
                                                                participantCount === undefined
                                                                    ? t("label.undecided")
                                                                    : t("label.rounds-recommended", {
                                                                          count: recommendedRounds(
                                                                              participantCount,
                                                                              podSize,
                                                                          ),
                                                                      })
                                                            }
                                                            invalid={fieldApi.state.meta.errors.length > 0}
                                                            value={fieldApi.state.value}
                                                            onChange={(event) =>
                                                                fieldApi.handleChange(event.target.value)
                                                            }
                                                        />
                                                        {fieldApi.state.meta.errors.map((error) => (
                                                            <ErrorMessage key={String(error)}>
                                                                {String(error)}
                                                            </ErrorMessage>
                                                        ))}
                                                    </Field>
                                                )}
                                            </form.Field>
                                        )}
                                    </form.Subscribe>

                                    <Fieldset>
                                        <Legend>{t("label.scoring")}</Legend>
                                        <Description>{t("description.scoring")}</Description>
                                        <div className={"mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4"}>
                                            {pointFields.map(([name, label]) => (
                                                <form.Field key={name} name={name}>
                                                    {(fieldApi) => (
                                                        <Field>
                                                            <Label>{label}</Label>
                                                            <Input
                                                                type={"number"}
                                                                min={0}
                                                                value={fieldApi.state.value}
                                                                onChange={(event) =>
                                                                    fieldApi.handleChange(Number(event.target.value))
                                                                }
                                                            />
                                                        </Field>
                                                    )}
                                                </form.Field>
                                            ))}
                                        </div>
                                    </Fieldset>
                                </div>
                            )}
                        </div>

                        {/* For `{ form, fields }`, TanStack Form stores the `form` value itself here. */}
                        <form.Subscribe selector={(state) => state.errorMap.onSubmit}>
                            {(error) => error != null && <InlineError>{String(error)}</InlineError>}
                        </form.Subscribe>
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
