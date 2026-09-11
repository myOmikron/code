import { CheckCircleIcon, MagnifyingGlassIcon } from "@heroicons/react/20/solid";
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
    InputGroup,
    Label,
    LocalTab,
    PrimaryButton,
    RequiredLabel,
    TabMenu,
    Text,
    Textarea,
} from "components";
import { useForm } from "@tanstack/react-form";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import type { PlayerSearchResultResponse, TournamentParticipantResponse, TournamentResponse } from "src/api/generated";
import { decklistMatters } from "src/components/tournament-roster";
import { handleFormError, isFormError } from "src/utils/error";

/**
 * What the dialog is open on: a fresh player, or an existing row being renamed/annotated
 */
export type ParticipantDialogMode = { kind: "add" } | { kind: "edit"; participant: TournamentParticipantResponse };

/** Which of the two doors an add is going through */
type AddMode = "guest" | "account";

/** How long the search field sits still before the lookup goes out, in milliseconds */
const SEARCH_DEBOUNCE = 250;

/** Shortest needle worth a round trip */
const SEARCH_MIN_LENGTH = 2;

/**
 * The properties for {@link ParticipantDialog}
 */
export type ParticipantDialogProps = {
    /** The tournament the participant belongs to */
    tournamentUuid: string;
    /** The tournament itself, for whether a decklist is worth asking about */
    tournament: TournamentResponse;
    /** What the dialog is open on, `null` to keep it closed */
    mode: ParticipantDialogMode | null;
    /** Called when the dialog should close without having saved anything */
    onClose: () => void;
    /** Called after the participant was added or updated */
    onSaved: () => void;
};

/**
 * Dialog for an organizer to put somebody on the roster, or to rename an existing row and
 * annotate it.
 *
 * Two doors into the roster. **Als Gast** types a name, which is the desk's usual move and leaves
 * a row the player can claim later by QR. **Mit Konto** looks an account up by username, for the
 * player whose phone is dead or who has no reception — that row belongs to their account from the
 * start, so it carries their history and needs no claiming.
 *
 * Notes are organizer-only and only ever exist on an existing row, so that field is edit-only. A
 * decklist is the opposite: it may be typed in when the row is created, and only where the event
 * asks for one at all — see {@link decklistMatters}.
 *
 * @returns the dialog
 */
export function ParticipantDialog({ tournamentUuid, tournament, mode, onClose, onSaved }: ParticipantDialogProps) {
    const [t] = useTranslation("tournament");
    const [tg] = useTranslation();

    const [addMode, setAddMode] = useState<AddMode>("guest");
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<Array<PlayerSearchResultResponse>>([]);
    const [selected, setSelected] = useState<PlayerSearchResultResponse | null>(null);

    const asksForDecklist = decklistMatters(tournament);

    const initial = () => ({
        displayName: mode?.kind === "edit" ? mode.participant.display_name : "",
        notes: mode?.kind === "edit" ? (mode.participant.notes ?? "") : "",
        decklistText: "",
    });

    const form = useForm({
        defaultValues: initial(),
        validators: {
            onSubmitAsync: async ({ value }) => {
                if (mode === null) return;

                const decklistText = value.decklistText.trim() === "" ? undefined : value.decklistText;

                if (mode.kind === "edit") {
                    await Api.tournaments.participants.update(tournamentUuid, mode.participant.uuid, {
                        display_name: value.displayName,
                        notes: value.notes.trim() === "" ? null : value.notes,
                    });
                    form.reset();
                    onSaved();
                    return;
                }

                const added = await Api.tournaments.participants.add(tournamentUuid, {
                    account: addMode === "account" ? (selected?.uuid ?? undefined) : undefined,
                    display_name: addMode === "account" ? undefined : value.displayName,
                    decklist_text: decklistText,
                });
                if (isFormError(added))
                    return handleFormError(added.error, {
                        empty_name: (errors) => (errors.fields.displayName = t("error.empty-name")),
                        unknown_account: (errors) => (errors.form = t("error.unknown-account")),
                        already_registered: (errors) => (errors.form = t("error.already-registered")),
                        registration_closed: (errors) => (errors.form = t("error.registration-closed")),
                        invalid_decklist: (errors) => (errors.fields.decklistText = t("error.invalid-decklist")),
                    });
                form.reset();
                onSaved();
            },
        },
    });

    // The dialog stays mounted, so the form has to be pointed at whatever it is opened on:
    // `defaultValues` is read once, at mount.
    useEffect(() => {
        form.reset(initial());
        setAddMode("guest");
        setQuery("");
        setResults([]);
        setSelected(null);
        // Deliberately not keyed on `form`, which is rebuilt on every render.
    }, [mode]);

    // Debounced so typing a username is one lookup rather than one per keystroke. The timer is
    // cleared on every change, so only the last pause actually asks.
    useEffect(() => {
        if (mode?.kind !== "add" || addMode !== "account") return;
        if (query.trim().length < SEARCH_MIN_LENGTH) {
            setResults([]);
            return;
        }
        const timer = setTimeout(() => {
            void Api.tournaments.participants
                .search(tournamentUuid, query.trim())
                .then((response) => setResults(response.accounts));
        }, SEARCH_DEBOUNCE);
        return () => clearTimeout(timer);
    }, [query, addMode, mode, tournamentUuid]);

    const decklistField = asksForDecklist && (
        <form.Field name={"decklistText"}>
            {(fieldApi) => (
                <Field>
                    <Label>{t("label.decklist-text")}</Label>
                    <Textarea
                        rows={6}
                        maxLength={16384}
                        className={"font-mono"}
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
    );

    return (
        <Dialog open={mode !== null} onClose={onClose}>
            <DialogTitle>{mode?.kind === "edit" ? t("heading.edit-player") : t("heading.add-player")}</DialogTitle>
            <Form onSubmit={form.handleSubmit}>
                <DialogBody>
                    {mode?.kind === "add" && (
                        <div className={"mb-4"}>
                            <TabMenu>
                                <LocalTab active={addMode === "guest"} onClick={() => setAddMode("guest")}>
                                    {t("label.as-guest")}
                                </LocalTab>
                                <LocalTab active={addMode === "account"} onClick={() => setAddMode("account")}>
                                    {t("label.with-account")}
                                </LocalTab>
                            </TabMenu>
                        </div>
                    )}

                    <FieldGroup>
                        {mode?.kind === "add" && addMode === "account" ? (
                            <Field>
                                <Label>{t("label.search-account")}</Label>
                                <InputGroup>
                                    <MagnifyingGlassIcon />
                                    <Input
                                        autoFocus={true}
                                        value={query}
                                        onChange={(event) => {
                                            setQuery(event.target.value);
                                            setSelected(null);
                                        }}
                                    />
                                </InputGroup>
                                {results.length > 0 ? (
                                    <ul
                                        className={
                                            "mt-2 max-h-52 overflow-y-auto rounded-(--radius-control) ring-1 ring-zinc-950/10 dark:ring-white/10"
                                        }
                                    >
                                        {results.map((result) => (
                                            <li key={result.uuid}>
                                                <button
                                                    type={"button"}
                                                    disabled={result.on_roster}
                                                    onClick={() => setSelected(result)}
                                                    className={
                                                        "flex w-full items-center gap-2 border-t border-zinc-950/[0.06] px-3 py-2 text-left text-sm text-zinc-950 first:border-t-0 hover:bg-zinc-950/[0.03] disabled:opacity-50 dark:border-white/[0.06] dark:text-white dark:hover:bg-white/[0.04]"
                                                    }
                                                >
                                                    <span className={"flex-1 truncate font-medium"}>
                                                        {result.username}
                                                    </span>
                                                    {result.on_roster && (
                                                        <span className={"text-xs text-zinc-500 dark:text-zinc-400"}>
                                                            {t("label.already-on-roster")}
                                                        </span>
                                                    )}
                                                    {selected?.uuid === result.uuid && (
                                                        <CheckCircleIcon
                                                            className={"size-4 text-(--color-accent)"}
                                                            aria-hidden={true}
                                                        />
                                                    )}
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    query.trim().length >= SEARCH_MIN_LENGTH && (
                                        <Text className={"mt-2 text-sm"}>{t("label.no-account-found")}</Text>
                                    )
                                )}
                            </Field>
                        ) : (
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
                        )}

                        {mode?.kind === "add" && decklistField}

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

                        <form.Subscribe selector={(state) => state.errorMap.onSubmit}>
                            {(error) => error != null && <ErrorMessage>{String(error)}</ErrorMessage>}
                        </form.Subscribe>
                    </FieldGroup>
                </DialogBody>
                <DialogActions>
                    <Button plain onClick={onClose}>
                        {tg("button.cancel")}
                    </Button>
                    <PrimaryButton
                        type={"submit"}
                        disabled={mode?.kind === "add" && addMode === "account" && selected === null}
                    >
                        {mode?.kind === "edit" ? t("button.save") : t("button.add-player")}
                    </PrimaryButton>
                </DialogActions>
            </Form>
        </Dialog>
    );
}
