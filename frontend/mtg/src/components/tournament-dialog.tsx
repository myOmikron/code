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
    Textarea,
} from "components";
import { GlobeAltIcon, LinkIcon, LockClosedIcon } from "@heroicons/react/20/solid";
import { useForm } from "@tanstack/react-form";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { Ruleset, Visibility } from "src/api/generated";
import type { FormatRulesResponse, TournamentResponse } from "src/api/generated";
import { useDeckLabels } from "src/components/deck-labels";
import { PrimaryButton } from "src/components/primary-button";
import { useTournamentLabels } from "src/components/tournament-labels";
import { handleFormError, isFormError } from "src/utils/error";
import { TABLE_SIZES, fromLocalInput, rulesetFits, rulesetsFor, toLocalInput } from "src/utils/tournament-settings";

/** The Table size a new Tournament starts out with: a Commander table */
const DEFAULT_TABLE_SIZE = 4;

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

    const form = useForm({
        defaultValues: initialValues(tournament),
        validators: {
            onSubmitAsync: async ({ value }) => {
                const request = {
                    name: value.name,
                    description: value.description === "" ? null : value.description,
                    location: value.location === "" ? null : value.location,
                    starts_at: fromLocalInput(value.startsAt).toISOString(),
                    table_size: value.tableSize,
                    ruleset: value.ruleset,
                    format: value.format,
                    visibility: value.visibility,
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
                                },
                            }}
                        >
                            {(fieldApi) => (
                                <Field>
                                    <Label>{t("label.table-size")}</Label>
                                    <Listbox<number>
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

                        <form.Field name={"visibility"}>
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
