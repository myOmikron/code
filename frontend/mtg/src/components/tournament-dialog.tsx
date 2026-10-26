import {
    Button,
    Combobox,
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
    Form,
    Input,
    Label,
    Listbox,
    ListboxDescription,
    ListboxLabel,
    ListboxOption,
    RequiredLabel,
    Switch,
    SwitchField,
    Textarea,
} from "components";
import { GlobeAltIcon, LinkIcon, LockClosedIcon } from "@heroicons/react/20/solid";
import { useForm } from "@tanstack/react-form";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { BestOf, Ruleset, TopCut, TournamentState, Visibility } from "src/api/generated";
import type { FormatRulesResponse, TournamentResponse } from "src/api/generated";
import { useDeckLabels } from "src/components/deck-labels";
import { PrimaryButton } from "src/components/primary-button";
import { useTournamentLabels } from "src/components/tournament-labels";
import { handleFormError, isFormError } from "src/utils/error";
import { CURRENCIES, fromMinorUnits, toMinorUnits } from "src/utils/entry-fee";
import {
    TABLE_SIZES,
    fromLocalInput,
    rulesetFits,
    rulesetsFor,
    toLocalInput,
    topCutsFor,
} from "src/utils/tournament-settings";

/** The Table size a new Tournament starts out with: a Commander table */
const DEFAULT_TABLE_SIZE = 4;

/** The form's value for "no Top cut" */
const NO_TOP_CUT = "None";

/**
 * The properties for {@link TournamentDialog}
 */
export type TournamentDialogProps = {
    /** Whether the dialog is on screen */
    open: boolean;
    /** The Tournament to edit, or `null` to create a new one */
    tournament: TournamentResponse | null;
    /** The formats on offer */
    formats: Array<FormatRulesResponse>;
    /** Called when the dialog should close without having saved anything */
    onClose: () => void;
    /** Called with the Tournament as it was saved */
    onSaved: (saved: TournamentResponse) => void;
};

/**
 * The form's values for a Tournament, or for a new one
 *
 * @param tournament the Tournament to edit, `null` for a new one
 *
 * @returns the values the form starts with
 */
function initialValues(tournament: TournamentResponse | null) {
    return {
        name: tournament?.name ?? "",
        description: tournament?.description ?? "",
        location: tournament?.location ?? "",
        startsAt: toLocalInput(tournament === null ? nextEvening() : new Date(tournament.starts_at)),
        tableSize: tournament?.table_size ?? DEFAULT_TABLE_SIZE,
        ruleset: tournament?.ruleset ?? Ruleset.TopDeck,
        format: tournament?.format ?? null,
        visibility: tournament?.visibility ?? Visibility.Public,
        participantLimit: tournament?.participant_limit == null ? "" : String(tournament.participant_limit),
        selfSignUp: tournament?.self_sign_up ?? false,
        bestOf: tournament?.best_of ?? BestOf.Three,
        roundMinutes: tournament?.round_minutes == null ? "" : String(tournament.round_minutes),
        topCut: (tournament?.top_cut ?? NO_TOP_CUT) as TopCut | typeof NO_TOP_CUT,
        topCutBestOf: tournament?.top_cut_best_of ?? BestOf.Three,
        enteredAfterwards: tournament?.entered_afterwards ?? false,
        entryFee:
            tournament?.entry_fee == null
                ? ""
                : fromMinorUnits(tournament.entry_fee.amount, tournament.entry_fee.currency),
        currency: tournament?.entry_fee?.currency ?? CURRENCIES[0],
    };
}

/**
 * Seven in the evening, a week from today: a start a new Tournament can begin with
 *
 * @returns the instant
 */
function nextEvening(): Date {
    const start = new Date();
    start.setDate(start.getDate() + 7);
    start.setHours(19, 0, 0, 0);
    return start;
}

/**
 * Dialog for creating a Tournament or changing its settings.
 *
 * Only offers the Rulesets fitting the chosen Table size; changing the Table
 * size moves the Ruleset along when the old one no longer fits.
 *
 * @returns the dialog
 */
export function TournamentDialog({ open, tournament, formats, onClose, onSaved }: TournamentDialogProps) {
    const [t] = useTranslation("tournament");
    const [tg] = useTranslation();
    const labels = useTournamentLabels();
    const deckLabels = useDeckLabels();
    // Table size, Ruleset, best-of and entering afterwards are fixed once the first Round started.
    const rulesLocked = tournament !== null && tournament.state !== TournamentState.Registration;
    // The Top cut stays open until the Swiss Rounds are over.
    const topCutLocked =
        tournament !== null &&
        tournament.state !== TournamentState.Registration &&
        tournament.state !== TournamentState.Swiss;
    // So is whether there is an entry fee; its amount and currency stay editable.
    const feeLocked = rulesLocked && tournament?.entry_fee == null;

    const form = useForm({
        defaultValues: initialValues(tournament),
        validators: {
            onSubmitAsync: async ({ value }) => {
                const amount = value.entryFee.trim() === "" ? null : toMinorUnits(value.entryFee, value.currency);
                if (value.entryFee.trim() !== "" && (amount === null || amount <= 0)) {
                    return { fields: { entryFee: t("error.entry-fee-invalid") } };
                }
                if (rulesLocked && amount === null && tournament?.entry_fee != null) {
                    return { fields: { entryFee: t("error.entry-fee-locked") } };
                }
                const request = {
                    name: value.name,
                    description: value.description === "" ? null : value.description,
                    location: value.location === "" ? null : value.location,
                    starts_at: fromLocalInput(value.startsAt).toISOString(),
                    table_size: value.tableSize,
                    ruleset: value.ruleset,
                    format: value.format,
                    visibility: value.visibility,
                    participant_limit: value.participantLimit === "" ? null : Number(value.participantLimit),
                    self_sign_up: value.selfSignUp,
                    best_of: value.tableSize === 2 ? value.bestOf : null,
                    round_minutes: value.roundMinutes === "" ? null : Number(value.roundMinutes),
                    top_cut: value.topCut !== NO_TOP_CUT ? value.topCut : null,
                    top_cut_best_of: value.tableSize === 2 && value.topCut !== NO_TOP_CUT ? value.topCutBestOf : null,
                    entered_afterwards: value.enteredAfterwards,
                    entry_fee: amount === null ? null : { amount, currency: value.currency },
                };
                const response =
                    tournament === null
                        ? await Api.tournaments.create(request)
                        : await Api.tournaments.update(tournament.uuid, request);
                if (isFormError(response)) {
                    return handleFormError(response.error, {
                        table_size_out_of_range: (errors) => {
                            errors.fields.tableSize = t("error.table-size-out-of-range");
                        },
                        ruleset_mismatch: (errors) => {
                            errors.fields.ruleset = t("error.ruleset-mismatch");
                        },
                        unknown_format: (errors) => {
                            errors.fields.format = t("error.unknown-format");
                        },
                        participant_limit_too_small: (errors) => {
                            errors.fields.participantLimit = t("error.participant-limit-too-small");
                        },
                        self_sign_up_needs_visibility: (errors) => {
                            errors.fields.selfSignUp = t("error.self-sign-up-needs-visibility");
                        },
                        best_of_mismatch: (errors) => {
                            errors.fields.bestOf = t("error.best-of-mismatch");
                        },
                        entry_fee_not_positive: (errors) => {
                            errors.fields.entryFee = t("error.entry-fee-invalid");
                        },
                        unknown_currency: (errors) => {
                            errors.fields.entryFee = t("error.entry-fee-invalid");
                        },
                        round_minutes_out_of_range: (errors) => {
                            errors.fields.roundMinutes = t("error.round-minutes-out-of-range");
                        },
                        rules_locked: (errors) => {
                            errors.fields.tableSize = t("error.rules-locked");
                        },
                        top_cut_mismatch: (errors) => {
                            errors.fields.topCut = t("error.top-cut-mismatch");
                        },
                        top_cut_best_of_mismatch: (errors) => {
                            errors.fields.topCutBestOf = t("error.top-cut-best-of-mismatch");
                        },
                        top_cut_locked: (errors) => {
                            errors.fields.topCut = t("error.top-cut-locked");
                        },
                    });
                }
                onSaved(response);
            },
        },
    });

    // The dialog stays mounted, so the form has to be pointed at whatever it is
    // opened on: `defaultValues` is read once, at mount.
    useEffect(() => {
        form.reset(initialValues(tournament));
        // Deliberately not keyed on `form`, which is rebuilt on every render.
    }, [tournament, open]);

    return (
        <Dialog open={open} onClose={onClose}>
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
                                        value={fieldApi.state.value}
                                        onChange={(event) => fieldApi.handleChange(event.target.value)}
                                    />
                                </Field>
                            )}
                        </form.Field>

                        <form.Field name={"startsAt"}>
                            {(fieldApi) => (
                                <Field>
                                    <RequiredLabel>{t("label.starts-at")}</RequiredLabel>
                                    <Input
                                        type={"datetime-local"}
                                        required={true}
                                        value={fieldApi.state.value}
                                        onChange={(event) => fieldApi.handleChange(event.target.value)}
                                    />
                                </Field>
                            )}
                        </form.Field>

                        <form.Field name={"enteredAfterwards"}>
                            {(fieldApi) => (
                                <SwitchField disabled={rulesLocked}>
                                    <Label>{t("label.entered-afterwards")}</Label>
                                    <Description>
                                        {rulesLocked
                                            ? t("description.entered-afterwards-locked")
                                            : t("description.entered-afterwards")}
                                    </Description>
                                    <Switch
                                        color={"lime"}
                                        checked={fieldApi.state.value}
                                        onChange={fieldApi.handleChange}
                                    />
                                </SwitchField>
                            )}
                        </form.Field>

                        <form.Field name={"location"}>
                            {(fieldApi) => (
                                <Field>
                                    <Label>{t("label.location")}</Label>
                                    <Input
                                        maxLength={255}
                                        value={fieldApi.state.value}
                                        onChange={(event) => fieldApi.handleChange(event.target.value)}
                                    />
                                </Field>
                            )}
                        </form.Field>

                        <form.Field
                            name={"tableSize"}
                            listeners={{
                                onChange: ({ value }) => {
                                    const ruleset = form.getFieldValue("ruleset");
                                    if (!rulesetFits(ruleset, value)) {
                                        form.setFieldValue("ruleset", rulesetsFor(value)[0] ?? Ruleset.Mtr);
                                    }
                                    const topCut = form.getFieldValue("topCut");
                                    if (topCut !== NO_TOP_CUT && !topCutsFor(value).includes(topCut)) {
                                        form.setFieldValue("topCut", NO_TOP_CUT);
                                    }
                                },
                            }}
                        >
                            {(fieldApi) => (
                                <Field>
                                    <Label>{t("label.table-size")}</Label>
                                    {rulesLocked && <Description>{t("description.rules-locked")}</Description>}
                                    <Listbox<number>
                                        disabled={rulesLocked}
                                        value={fieldApi.state.value}
                                        onChange={fieldApi.handleChange}
                                        invalid={fieldApi.state.meta.errors.length > 0}
                                    >
                                        {TABLE_SIZES.map((size) => (
                                            <ListboxOption key={size} value={size}>
                                                <ListboxLabel>{labels.tableSize(size)}</ListboxLabel>
                                            </ListboxOption>
                                        ))}
                                    </Listbox>
                                    {fieldApi.state.meta.errors.map((error) => (
                                        <ErrorMessage key={String(error)}>{String(error)}</ErrorMessage>
                                    ))}
                                </Field>
                            )}
                        </form.Field>

                        <form.Subscribe selector={(state) => state.values.tableSize}>
                            {(tableSize) => (
                                <form.Field name={"ruleset"}>
                                    {(fieldApi) => (
                                        <Field>
                                            <Label>{t("label.ruleset")}</Label>
                                            <Listbox<Ruleset>
                                                disabled={rulesLocked}
                                                value={fieldApi.state.value}
                                                onChange={fieldApi.handleChange}
                                                invalid={fieldApi.state.meta.errors.length > 0}
                                            >
                                                {rulesetsFor(tableSize).map((ruleset) => (
                                                    <ListboxOption key={ruleset} value={ruleset}>
                                                        <ListboxLabel>{labels.ruleset(ruleset)}</ListboxLabel>
                                                        <ListboxDescription>
                                                            {labels.rulesetDescription(ruleset)}
                                                        </ListboxDescription>
                                                    </ListboxOption>
                                                ))}
                                            </Listbox>
                                            {fieldApi.state.meta.errors.map((error) => (
                                                <ErrorMessage key={String(error)}>{String(error)}</ErrorMessage>
                                            ))}
                                        </Field>
                                    )}
                                </form.Field>
                            )}
                        </form.Subscribe>

                        <form.Subscribe selector={(state) => state.values.tableSize}>
                            {(tableSize) =>
                                tableSize === 2 && (
                                    <form.Field name={"bestOf"}>
                                        {(fieldApi) => (
                                            <Field>
                                                <Label>{t("label.best-of")}</Label>
                                                <Listbox<BestOf>
                                                    disabled={rulesLocked}
                                                    value={fieldApi.state.value}
                                                    onChange={fieldApi.handleChange}
                                                    invalid={fieldApi.state.meta.errors.length > 0}
                                                >
                                                    {[BestOf.One, BestOf.Three].map((bestOf) => (
                                                        <ListboxOption key={bestOf} value={bestOf}>
                                                            <ListboxLabel>{labels.bestOf(bestOf)}</ListboxLabel>
                                                        </ListboxOption>
                                                    ))}
                                                </Listbox>
                                                {fieldApi.state.meta.errors.map((error) => (
                                                    <ErrorMessage key={String(error)}>{String(error)}</ErrorMessage>
                                                ))}
                                            </Field>
                                        )}
                                    </form.Field>
                                )
                            }
                        </form.Subscribe>

                        <form.Subscribe selector={(state) => state.values.tableSize}>
                            {(tableSize) => (
                                <form.Field name={"topCut"}>
                                    {(fieldApi) => (
                                        <Field>
                                            <Label>{t("label.top-cut")}</Label>
                                            <Description>
                                                {topCutLocked
                                                    ? t("description.top-cut-locked")
                                                    : tableSize === 2
                                                      ? t("description.top-cut")
                                                      : t("description.top-cut-final")}
                                            </Description>
                                            <Listbox<TopCut | typeof NO_TOP_CUT>
                                                disabled={topCutLocked}
                                                value={fieldApi.state.value}
                                                onChange={fieldApi.handleChange}
                                                invalid={fieldApi.state.meta.errors.length > 0}
                                            >
                                                <ListboxOption value={NO_TOP_CUT}>
                                                    <ListboxLabel>{labels.topCut(null)}</ListboxLabel>
                                                </ListboxOption>
                                                {topCutsFor(tableSize).map((topCut) => (
                                                    <ListboxOption key={topCut} value={topCut}>
                                                        <ListboxLabel>{labels.topCut(topCut)}</ListboxLabel>
                                                    </ListboxOption>
                                                ))}
                                            </Listbox>
                                            {fieldApi.state.meta.errors.map((error) => (
                                                <ErrorMessage key={String(error)}>{String(error)}</ErrorMessage>
                                            ))}
                                        </Field>
                                    )}
                                </form.Field>
                            )}
                        </form.Subscribe>

                        <form.Subscribe
                            selector={(state) => state.values.tableSize === 2 && state.values.topCut !== NO_TOP_CUT}
                        >
                            {(withTopCut) =>
                                withTopCut && (
                                    <form.Field name={"topCutBestOf"}>
                                        {(fieldApi) => (
                                            <Field>
                                                <Label>{t("label.top-cut-best-of")}</Label>
                                                <Listbox<BestOf>
                                                    disabled={topCutLocked}
                                                    value={fieldApi.state.value}
                                                    onChange={fieldApi.handleChange}
                                                    invalid={fieldApi.state.meta.errors.length > 0}
                                                >
                                                    {[BestOf.One, BestOf.Three].map((bestOf) => (
                                                        <ListboxOption key={bestOf} value={bestOf}>
                                                            <ListboxLabel>{labels.bestOf(bestOf)}</ListboxLabel>
                                                        </ListboxOption>
                                                    ))}
                                                </Listbox>
                                                {fieldApi.state.meta.errors.map((error) => (
                                                    <ErrorMessage key={String(error)}>{String(error)}</ErrorMessage>
                                                ))}
                                            </Field>
                                        )}
                                    </form.Field>
                                )
                            }
                        </form.Subscribe>

                        <form.Field name={"format"}>
                            {(fieldApi) => (
                                <Field>
                                    <Label>{t("label.format")}</Label>
                                    <Description>{t("description.format")}</Description>
                                    <Combobox<FormatRulesResponse | null>
                                        options={formats}
                                        by={"slug"}
                                        value={formats.find((format) => format.slug === fieldApi.state.value) ?? null}
                                        displayValue={(format) =>
                                            format == null ? "" : deckLabels.format(format.slug)
                                        }
                                        placeholder={t("label.format-any")}
                                        aria-label={t("label.format")}
                                        onChange={(format) => fieldApi.handleChange(format?.slug ?? null)}
                                    >
                                        {(format) => (
                                            <ComboboxOption value={format}>
                                                <ComboboxLabel>{deckLabels.format(format.slug)}</ComboboxLabel>
                                            </ComboboxOption>
                                        )}
                                    </Combobox>
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
                                        rows={4}
                                        maxLength={4096}
                                        value={fieldApi.state.value}
                                        onChange={(event) => fieldApi.handleChange(event.target.value)}
                                    />
                                </Field>
                            )}
                        </form.Field>

                        <form.Field
                            name={"visibility"}
                            listeners={{
                                onChange: ({ value }) => {
                                    if (value === Visibility.Private) form.setFieldValue("selfSignUp", false);
                                },
                            }}
                        >
                            {(fieldApi) => (
                                <Field>
                                    <Label>{t("label.visibility")}</Label>
                                    <Listbox<Visibility> value={fieldApi.state.value} onChange={fieldApi.handleChange}>
                                        <ListboxOption value={Visibility.Private}>
                                            <LockClosedIcon />
                                            <ListboxLabel>{labels.visibility(Visibility.Private)}</ListboxLabel>
                                            <ListboxDescription>
                                                {t("description.visibility-private")}
                                            </ListboxDescription>
                                        </ListboxOption>
                                        <ListboxOption value={Visibility.Unlisted}>
                                            <LinkIcon />
                                            <ListboxLabel>{labels.visibility(Visibility.Unlisted)}</ListboxLabel>
                                            <ListboxDescription>
                                                {t("description.visibility-unlisted")}
                                            </ListboxDescription>
                                        </ListboxOption>
                                        <ListboxOption value={Visibility.Public}>
                                            <GlobeAltIcon />
                                            <ListboxLabel>{labels.visibility(Visibility.Public)}</ListboxLabel>
                                            <ListboxDescription>
                                                {t("description.visibility-public")}
                                            </ListboxDescription>
                                        </ListboxOption>
                                    </Listbox>
                                </Field>
                            )}
                        </form.Field>

                        <form.Subscribe selector={(state) => state.values.visibility}>
                            {(visibility) => (
                                <form.Field name={"selfSignUp"}>
                                    {(fieldApi) => (
                                        <SwitchField disabled={visibility === Visibility.Private}>
                                            <Label>{t("label.self-sign-up")}</Label>
                                            <Description>
                                                {visibility === Visibility.Private
                                                    ? t("description.self-sign-up-private")
                                                    : t("description.self-sign-up")}
                                            </Description>
                                            <Switch
                                                color={"lime"}
                                                checked={fieldApi.state.value}
                                                onChange={fieldApi.handleChange}
                                            />
                                            {fieldApi.state.meta.errors.map((error) => (
                                                <ErrorMessage key={String(error)}>{String(error)}</ErrorMessage>
                                            ))}
                                        </SwitchField>
                                    )}
                                </form.Field>
                            )}
                        </form.Subscribe>

                        <form.Field name={"participantLimit"}>
                            {(fieldApi) => (
                                <Field>
                                    <Label>{t("label.participant-limit")}</Label>
                                    <Description>{t("description.participant-limit")}</Description>
                                    <Input
                                        type={"number"}
                                        min={2}
                                        step={1}
                                        inputMode={"numeric"}
                                        value={fieldApi.state.value}
                                        invalid={fieldApi.state.meta.errors.length > 0}
                                        onChange={(event) => fieldApi.handleChange(event.target.value)}
                                    />
                                    {fieldApi.state.meta.errors.map((error) => (
                                        <ErrorMessage key={String(error)}>{String(error)}</ErrorMessage>
                                    ))}
                                </Field>
                            )}
                        </form.Field>

                        <Field>
                            <Label>{t("label.entry-fee")}</Label>
                            <Description>
                                {feeLocked ? t("description.entry-fee-locked") : t("description.entry-fee")}
                            </Description>
                            <div className={"flex items-start gap-2"}>
                                <form.Field name={"entryFee"}>
                                    {(fieldApi) => (
                                        <Input
                                            className={"min-w-0 flex-1"}
                                            inputMode={"decimal"}
                                            placeholder={t("label.entry-fee-none")}
                                            aria-label={t("label.entry-fee")}
                                            disabled={feeLocked}
                                            value={fieldApi.state.value}
                                            invalid={fieldApi.state.meta.errors.length > 0}
                                            onChange={(event) => fieldApi.handleChange(event.target.value)}
                                        />
                                    )}
                                </form.Field>
                                <form.Field name={"currency"}>
                                    {(fieldApi) => (
                                        <div className={"w-28 shrink-0"}>
                                            <Listbox<string>
                                                aria-label={t("label.currency")}
                                                disabled={feeLocked}
                                                value={fieldApi.state.value}
                                                onChange={fieldApi.handleChange}
                                            >
                                                {CURRENCIES.map((currency) => (
                                                    <ListboxOption key={currency} value={currency}>
                                                        <ListboxLabel>{currency}</ListboxLabel>
                                                    </ListboxOption>
                                                ))}
                                            </Listbox>
                                        </div>
                                    )}
                                </form.Field>
                            </div>
                            <form.Subscribe selector={(state) => state.fieldMeta.entryFee?.errors ?? []}>
                                {(errors) =>
                                    errors.map((error) => (
                                        <ErrorMessage key={String(error)}>{String(error)}</ErrorMessage>
                                    ))
                                }
                            </form.Subscribe>
                        </Field>
                        <form.Field name={"roundMinutes"}>
                            {(fieldApi) => (
                                <Field>
                                    <Label>{t("label.round-minutes")}</Label>
                                    <Description>{t("description.round-minutes")}</Description>
                                    <Input
                                        type={"number"}
                                        min={1}
                                        max={240}
                                        step={1}
                                        inputMode={"numeric"}
                                        value={fieldApi.state.value}
                                        invalid={fieldApi.state.meta.errors.length > 0}
                                        onChange={(event) => fieldApi.handleChange(event.target.value)}
                                    />
                                    {fieldApi.state.meta.errors.map((error) => (
                                        <ErrorMessage key={String(error)}>{String(error)}</ErrorMessage>
                                    ))}
                                </Field>
                            )}
                        </form.Field>
                    </FieldGroup>
                </DialogBody>
                <DialogActions>
                    <Button plain onClick={onClose}>
                        {tg("button.cancel")}
                    </Button>
                    <form.Subscribe selector={(state) => state.isSubmitting}>
                        {(submitting) => (
                            <PrimaryButton type={"submit"} disabled={submitting}>
                                {tournament === null ? t("button.create-tournament") : t("button.save-tournament")}
                            </PrimaryButton>
                        )}
                    </form.Subscribe>
                </DialogActions>
            </Form>
        </Dialog>
    );
}
