import { ChevronRightIcon, GlobeAltIcon, LinkIcon, LockClosedIcon } from "@heroicons/react/20/solid";
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
import type { ValidationErrors } from "src/utils/error";
import { handleFormError, isFormError } from "src/utils/error";
import { DEFAULT_CONSTRUCTED_FORMAT, podSizeFor, pointsFor, recommendedRounds } from "src/utils/tournament-format";

/**
 * The format catalog, fetched once and shared by every dialog instance
 *
 * `Api.decks.formats()` is account-only and goes through `handleError` — safe here since only an
 * account can ever open this dialog — but nothing about the catalog changes between openings, so
 * the promise itself doubles as the cache instead of refetching each time.
 *
 * Deliberately not loaded from the `/tournaments` list route's loader: that page is reachable
 * logged out, and a 401 through `handleError` would send a guest into a login redirect they
 * cannot complete.
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
            // A failed fetch must not be the cached answer: the next opening retries. The error
            // itself was already reported through `handleError`, so it is rethrown and swallowed
            // by the effect below rather than surfacing twice.
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
    /**
     * How many people are on the roster, for the round recommendation
     *
     * Absent while building a new tournament — there is nobody to count yet, and the start
     * confirmation makes the same recommendation later, when there is.
     */
    participantCount?: number;
    /** Called when the dialog should close without having saved anything */
    onClose: () => void;
    /**
     * Called after the tournament was saved
     *
     * Carries the tournament when it was just created, `null` when an existing one was edited.
     */
    onSaved: (created: TournamentResponse | null) => void;
};

/** A pod of four's scoring — what {@link DEFAULT_CONSTRUCTED_FORMAT}, Commander, seats */
const DEFAULT_POINTS = pointsFor(4);

/**
 * What a fresh form starts on, before an existing tournament overrides it
 *
 * Several of these have no field any more and are sent as they stand: Swiss pairing, guest names
 * shown, and no self-service late entry — a player who turns up late is added by an organizer,
 * which the backend allows regardless of `allowLateEntry`. Whether such a player's missed rounds
 * count as losses is that organizer's call at the time, not a rule set up front, so
 * `lateEntryAsLosses` is off and unasked too. The four match points are asked again, but still
 * default from the table: {@link DEFAULT_CONSTRUCTED_FORMAT} is Commander, so a pod of four's
 * `pointsFor` is the starting point here, the same as `podSize` follows commander's own pod size.
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
 * Maps every field of {@link TournamentSettingsErrors} onto the form field or form-level message
 * that should carry it.
 *
 * `invalid_points` names no single field — the request carries four — so it lands on the form as
 * a whole; `settings_locked` is likewise a whole-request refusal, worded the same as the
 * standing banner shown while the event is running. `invalid_pod_size` has no field either: the
 * pod size follows from the format (see `podSizeFor`) and is never shown, so a refusal of it
 * can only mean the derivation and the backend disagree.
 *
 * The two refusals that name a value inside the advanced section also open it. Round length
 * carries a field message, and a message on a collapsed input is no message at all; the four
 * point values carry only a form-level one, which says what is wrong but not where to fix it.
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
 * Dialog for starting a tournament or changing its settings.
 *
 * Visibility is only offered while building a new one: an existing tournament's visibility has
 * its own standalone control on the settings tab, next to the status and join-code controls it
 * shares a page with.
 *
 * @returns the dialog
 */
export function TournamentDialog({ open, tournament, participantCount, onClose, onSaved }: TournamentDialogProps) {
    const [t] = useTranslation("tournament");
    const [advancedOpen, setAdvancedOpen] = useState(false);
    const [tg] = useTranslation();
    const [formats, setFormats] = useState<Array<FormatRulesResponse>>([]);
    const [venues, setVenues] = useState<Array<TournamentVenueResponse>>([]);

    // Fetched on open rather than up front: nothing else on this dialog needs the account-only
    // catalog, and a visitor who never opens it never has to ask for it.
    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        loadFormats().then(
            (loaded) => {
                if (!cancelled) setFormats(loaded);
            },
            () => {
                // Reported by `handleError` already; the picker simply stays disabled.
            },
        );
        return () => {
            cancelled = true;
        };
    }, [open]);

    // Not cached like `loadFormats` above: the format catalog never changes, but the account's own
    // venue book grows every time this very dialog saves a new place, so the same session opening
    // it twice must see its own first save.
    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        Api.tournaments.venues.list().then(
            (loaded) => {
                if (!cancelled) setVenues(loaded.venues);
            },
            () => {
                // Reported by `handleError` already; the picker simply stays empty.
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
                    description: value.description.trim() === "" ? null : value.description,
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
                    // An empty field is "no limit", not zero — the only way to say that.
                    max_participants: value.maxParticipants.trim() === "" ? null : Number(value.maxParticipants),
                    // An empty field means "not decided yet", not zero rounds.
                    planned_rounds: value.plannedRounds.trim() === "" ? null : Number(value.plannedRounds),
                    allow_late_entry: value.allowLateEntry,
                    late_entry_as_losses: value.lateEntryAsLosses,
                    venue: value.venue.trim() === "" ? null : value.venue,
                    venue_address: value.venueAddress.trim() === "" ? null : value.venueAddress,
                    venue_instructions: value.venueInstructions.trim() === "" ? null : value.venueInstructions,
                    starts_at: value.startsAt === "" ? null : new Date(value.startsAt).toISOString(),
                };

                if (tournament === null) {
                    const created = await Api.tournaments.create({ settings, visibility: value.visibility });
                    if (isFormError(created))
                        return handleFormError(
                            created.error,
                            settingsErrorHandlers(t, () => setAdvancedOpen(true)),
                        );
                    form.reset();
                    onSaved(created);
                    return;
                }

                const updated = await Api.tournaments.update(tournament.uuid, settings);
                if (isFormError(updated))
                    return handleFormError(
                        updated.error,
                        settingsErrorHandlers(t, () => setAdvancedOpen(true)),
                    );
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
                                                // Who sits at a table follows from the format
                                                // and is not asked for: a pod of four plays one
                                                // game, a table of two starts on best of three —
                                                // unless the event already exists, in which case
                                                // it keeps the best-of it had. Match points follow
                                                // the same table for the same reason, but only for
                                                // a new event: an existing one keeps whatever
                                                // scoring its organizer already set, even across a
                                                // format change.
                                                const podSize = podSizeFor(slug, formats);
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
                                            // A pod plays a single game, so best-of is only a
                                            // question at a table of two.
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
                                                        // A picker over the account's own book, not the bound
                                                        // control itself: it only ever fills the plain `Input`
                                                        // below on a pick and otherwise stays blank, so nothing
                                                        // it does can clobber whatever the organizer is typing.
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
                                            <form.Field name={"pointsWin"}>
                                                {(fieldApi) => (
                                                    <Field>
                                                        <Label>{t("label.points-win")}</Label>
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
                                            <form.Field name={"pointsDraw"}>
                                                {(fieldApi) => (
                                                    <Field>
                                                        <Label>{t("label.points-draw")}</Label>
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
                                            <form.Field name={"pointsLoss"}>
                                                {(fieldApi) => (
                                                    <Field>
                                                        <Label>{t("label.points-loss")}</Label>
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
                                            <form.Field name={"pointsBye"}>
                                                {(fieldApi) => (
                                                    <Field>
                                                        <Label>{t("label.points-bye")}</Label>
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
                                        </div>
                                    </Fieldset>
                                </div>
                            )}
                        </div>

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
