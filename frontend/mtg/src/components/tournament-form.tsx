import {
    Button,
    Combobox,
    ComboboxHeading,
    ComboboxLabel,
    ComboboxOption,
    Description,
    Divider,
    Heading,
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
    RequiredLabel,
    Switch,
    SwitchField,
    Textarea,
} from "components";
import { GlobeAltIcon, LinkIcon, LockClosedIcon } from "@heroicons/react/20/solid";
import { useForm } from "@tanstack/react-form";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { BestOf, CheckIn, Ruleset, TopCut, TournamentState, Visibility } from "src/api/generated";
import type { FormatRulesResponse, TournamentResponse } from "src/api/generated";
import { useDeckLabels } from "src/components/deck-labels";
import { PrimaryButton } from "src/components/primary-button";
import { useTournamentLabels } from "src/components/tournament-labels";
import { handleFormError, isFormError } from "src/utils/error";
import { CURRENCIES, fromMinorUnits, toMinorUnits } from "src/utils/entry-fee";
import { type FormatEntry, formatEntries } from "src/utils/format-groups";
import {
    TABLE_SIZES,
    withFormatDefaults,
    fromLocalInput,
    isLimited,
    rulesetFits,
    rulesetsFor,
    toLocalInput,
    topCutsFor,
    tournamentFormats,
} from "src/utils/tournament-settings";

/** The form's value for "no Top cut" */
const NO_TOP_CUT = "None";

/**
 * The properties for {@link TournamentForm}
 */
export type TournamentFormProps = {
    /** The Tournament to edit */
    tournament: TournamentResponse;
    /** The deck formats on offer; the Limited formats join them in the form */
    formats: Array<FormatRulesResponse>;
    /** Called when the Organizer cancels without saving */
    onClose: () => void;
    /** Called with the Tournament as it was saved */
    onSaved: (saved: TournamentResponse) => void;
};

/**
 * The form's values for a Tournament
 *
 * @param tournament the Tournament to edit
 *
 * @returns the values the form starts with
 */
function initialValues(tournament: TournamentResponse) {
    return {
        name: tournament.name,
        description: tournament.description ?? "",
        location: tournament.location ?? "",
        startsAt: toLocalInput(new Date(tournament.starts_at)),
        tableSize: tournament.table_size,
        ruleset: tournament.ruleset,
        format: tournament.format ?? null,
        visibility: tournament.visibility,
        participantLimit: tournament.participant_limit == null ? "" : String(tournament.participant_limit),
        selfSignUp: tournament.self_sign_up,
        bestOf: tournament.best_of ?? BestOf.Three,
        roundMinutes: tournament.round_minutes == null ? "" : String(tournament.round_minutes),
        topCut: (tournament.top_cut ?? NO_TOP_CUT) as TopCut | typeof NO_TOP_CUT,
        topCutBestOf: tournament.top_cut_best_of ?? BestOf.Three,
        enteredAfterwards: tournament.entered_afterwards,
        entryFee:
            tournament.entry_fee == null
                ? ""
                : fromMinorUnits(tournament.entry_fee.amount, tournament.entry_fee.currency),
        currency: tournament.entry_fee?.currency ?? CURRENCIES[0],
        checkIn: tournament.check_in,
    };
}

/** The settings page form of a Tournament. */
export function TournamentForm({ tournament, formats, onClose, onSaved }: TournamentFormProps) {
    const manual = useRef({ tableSize: true, ruleset: true });
    const [t] = useTranslation("tournament");
    const [tg] = useTranslation();
    const labels = useTournamentLabels();
    const deckLabels = useDeckLabels();
    const rulesLocked = tournament.state !== TournamentState.Registration;
    const [formatQuery, setFormatQuery] = useState("");
    const formatChoices = formatEntries(tournamentFormats(formats), deckLabels.format, formatQuery);
    const formatChoice = (slug: string | null): FormatEntry | null =>
        formatChoices.find((entry) => entry.kind === "format" && entry.slug === slug) ?? null;
    const topCutLocked =
        tournament.state !== TournamentState.Registration && tournament.state !== TournamentState.Swiss;
    const feeLocked = rulesLocked && tournament.entry_fee == null;

    const form = useForm({
        defaultValues: initialValues(tournament),
        validators: {
            onSubmitAsync: async ({ value }) => {
                const amount = value.entryFee.trim() === "" ? null : toMinorUnits(value.entryFee, value.currency);
                if (value.entryFee.trim() !== "" && (amount === null || amount <= 0)) {
                    return { fields: { entryFee: t("error.entry-fee-invalid") } };
                }
                if (rulesLocked && amount === null && tournament.entry_fee != null) {
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
                    check_in: value.checkIn,
                };
                const response = await Api.tournaments.update(tournament.uuid, request);
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
                        check_in_deck_for_limited: (errors) => {
                            errors.fields.checkIn = t("error.check-in-deck-for-limited");
                        },
                    });
                }
                onSaved(response);
            },
        },
    });

    return (
        <div className={"mx-auto flex w-full max-w-3xl flex-col gap-8 py-4"}>
            <Heading>{t("heading.edit-tournament")}</Heading>
            <Form onSubmit={form.handleSubmit}>
                <div className={"flex flex-col gap-10"}>
                    <Fieldset>
                        <Legend>{t("heading.form-general")}</Legend>
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
                        </FieldGroup>
                    </Fieldset>
                    <Divider soft={true} />
                    <Fieldset>
                        <Legend>{t("heading.form-game")}</Legend>
                        <FieldGroup>
                            <form.Field name={"format"}>
                                {(fieldApi) => (
                                    <Field>
                                        <Label>{t("label.format")}</Label>
                                        <Description>{t("description.format")}</Description>
                                        <Combobox<FormatEntry | null>
                                            options={formatChoices}
                                            by={"slug"}
                                            optionDisabled={(entry) => entry?.kind === "heading"}
                                            filter={() => true}
                                            onQueryChange={setFormatQuery}
                                            value={formatChoice(fieldApi.state.value)}
                                            displayValue={(entry) => (entry?.kind === "format" ? entry.name : "")}
                                            placeholder={t("label.format-any")}
                                            aria-label={t("label.format")}
                                            onChange={(entry) => {
                                                const slug = entry?.kind === "format" ? entry.slug : null;
                                                fieldApi.handleChange(slug);
                                                if (rulesLocked) return;
                                                if (
                                                    isLimited(slug) &&
                                                    form.getFieldValue("checkIn") === CheckIn.RequiredWithDeck
                                                ) {
                                                    form.setFieldValue("checkIn", CheckIn.Required);
                                                }
                                                const next = withFormatDefaults(
                                                    {
                                                        tableSize: form.getFieldValue("tableSize"),
                                                        ruleset: form.getFieldValue("ruleset"),
                                                    },
                                                    slug,
                                                    manual.current,
                                                );
                                                form.setFieldValue("tableSize", next.tableSize);
                                                form.setFieldValue("ruleset", next.ruleset);
                                                const topCut = form.getFieldValue("topCut");
                                                if (
                                                    topCut !== NO_TOP_CUT &&
                                                    !topCutsFor(next.tableSize).includes(topCut)
                                                ) {
                                                    form.setFieldValue("topCut", NO_TOP_CUT);
                                                }
                                            }}
                                        >
                                            {(entry) =>
                                                entry.kind === "heading" ? (
                                                    <ComboboxHeading value={entry}>
                                                        {entry.group === "popular"
                                                            ? t("label.formats-popular")
                                                            : t("label.formats-rare")}
                                                    </ComboboxHeading>
                                                ) : (
                                                    <ComboboxOption value={entry}>
                                                        <ComboboxLabel>{entry.name}</ComboboxLabel>
                                                    </ComboboxOption>
                                                )
                                            }
                                        </Combobox>
                                        {fieldApi.state.meta.errors.map((error) => (
                                            <ErrorMessage key={String(error)}>{String(error)}</ErrorMessage>
                                        ))}
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
                                        <Description>{t("description.format-defaults")}</Description>
                                        {rulesLocked && <Description>{t("description.rules-locked")}</Description>}
                                        <Listbox<number>
                                            disabled={rulesLocked}
                                            value={fieldApi.state.value}
                                            onChange={(value) => {
                                                manual.current.tableSize = true;
                                                fieldApi.handleChange(value);
                                            }}
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
                                                <Description>
                                                    {labels.rulesetDescription(fieldApi.state.value)}
                                                </Description>
                                                <Listbox<Ruleset>
                                                    disabled={rulesLocked}
                                                    value={fieldApi.state.value}
                                                    onChange={(value) => {
                                                        manual.current.ruleset = true;
                                                        fieldApi.handleChange(value);
                                                    }}
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
                        </FieldGroup>
                    </Fieldset>
                    <Divider soft={true} />
                    <Fieldset>
                        <Legend>{t("heading.top-cut")}</Legend>
                        <FieldGroup>
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
                        </FieldGroup>
                    </Fieldset>
                    <Divider soft={true} />
                    <Fieldset>
                        <Legend>{t("heading.form-registration")}</Legend>
                        <FieldGroup>
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
                                        <Listbox<Visibility>
                                            value={fieldApi.state.value}
                                            onChange={fieldApi.handleChange}
                                        >
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

                            <form.Subscribe selector={(state) => isLimited(state.values.format)}>
                                {(limited) => (
                                    <form.Field name={"checkIn"}>
                                        {(fieldApi) => (
                                            <Field>
                                                <Label>{t("label.check-in")}</Label>
                                                <Description>
                                                    {rulesLocked
                                                        ? t("description.rules-locked")
                                                        : t("description.check-in")}
                                                </Description>
                                                <Listbox<CheckIn>
                                                    disabled={rulesLocked}
                                                    value={fieldApi.state.value}
                                                    onChange={fieldApi.handleChange}
                                                    invalid={fieldApi.state.meta.errors.length > 0}
                                                >
                                                    {[CheckIn.Off, CheckIn.Required, CheckIn.RequiredWithDeck]
                                                        .filter((rule) => !limited || rule !== CheckIn.RequiredWithDeck)
                                                        .map((rule) => (
                                                            <ListboxOption key={rule} value={rule}>
                                                                <ListboxLabel>{labels.checkIn(rule)}</ListboxLabel>
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
                        </FieldGroup>
                    </Fieldset>
                </div>
                <div className={"mt-8 flex flex-wrap justify-end gap-3"}>
                    <Button plain onClick={onClose}>
                        {tg("button.cancel")}
                    </Button>
                    <form.Subscribe selector={(state) => state.isSubmitting}>
                        {(submitting) => (
                            <PrimaryButton type={"submit"} disabled={submitting}>
                                {t("button.save-tournament")}
                            </PrimaryButton>
                        )}
                    </form.Subscribe>
                </div>
            </Form>
        </div>
    );
}
