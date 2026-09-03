import {
    Button,
    Checkbox,
    CheckboxField,
    ConfirmDialog,
    Description,
    Dialog,
    DialogActions,
    DialogBody,
    DialogTitle,
    Field,
    Label,
    Listbox,
    ListboxLabel,
    ListboxOption,
    Text,
    Textarea,
    notify,
} from "components";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import type { DecklistErrors, DeckOverviewResponse, GetDecklistResponse } from "src/api/generated";
import { InlineError } from "src/components/inline-error";
import type { ValidationErrors } from "src/utils/error";
import { handleFormError, isFormError } from "src/utils/error";

/**
 * Which participant a {@link DecklistDialog} is open on
 */
export type DecklistDialogParticipant = {
    /** The participant row the list belongs to */
    uuid: string;
    /** Shown in the dialog title */
    display_name: string;
};

/**
 * The properties for {@link DecklistDialog}
 */
export type DecklistDialogProps = {
    /** Whether the dialog is on screen */
    open: boolean;
    /** The tournament the participant belongs to */
    tournamentUuid: string;
    /** The tournament's format — pre-filters the deck picker, same as the join dialog's */
    tournamentFormat: string;
    /** Whose decklist this is */
    participant: DecklistDialogParticipant;
    /**
     * Whether the viewer may link one of their own Planarium decks here — true only for an
     * account editing its own row. Staff paste text for somebody else's row; they never link
     * their own deck onto it (see `AddTournamentParticipantRequest`'s doc comment for the same
     * rule at registration time).
     */
    canPickDeck: boolean;
    /** Called when the dialog should close without any further action */
    onClose: () => void;
    /** Called after the decklist was saved or removed, so the caller can refresh `has_decklist` */
    onChanged: () => void;
};

/**
 * How a {@link DecklistErrors} field turns into the one inline message this dialog shows.
 *
 * @param t the `tournament` namespace translator
 *
 * @returns the handler map {@link handleFormError} wants
 */
function decklistErrorHandlers(t: (key: string) => string): {
    [Key in keyof DecklistErrors]: (errors: ValidationErrors) => void;
} {
    return {
        invalid_decklist: (errors) => {
            errors.form = t("error.invalid-decklist");
        },
        locked: (errors) => {
            errors.form = t("error.decklist-locked");
        },
        unknown_deck: (errors) => {
            errors.form = t("error.unknown-deck");
        },
    };
}

/**
 * View, edit or clear one participant's decklist.
 *
 * Opened both by staff (any row) and by a participant on their own row — from the roster's
 * "Decklist…" action and from the overview tab's "Your decklist" card respectively. Read and
 * write both bypass `handleError` (see `api.tsx`): a lock or a stale guest session both need to
 * render inline here, never the app's error screen. `get` only ever throws (no typed refusal on
 * the read side, see `GetDecklistResponse`); `set` may additionally come back `isFormError` —
 * both are handled locally, never left to escape to a global handler.
 *
 * @returns the dialog
 */
export function DecklistDialog({
    open,
    tournamentUuid,
    tournamentFormat,
    participant,
    canPickDeck,
    onClose,
    onChanged,
}: DecklistDialogProps) {
    const [t] = useTranslation("tournament");
    const [tg] = useTranslation();

    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState<string | undefined>();
    const [response, setResponse] = useState<GetDecklistResponse | null>(null);

    // How the edit controls are shown when `canPickDeck` — link one of the account's own decks,
    // or paste text like everybody else does. Seeded from whatever is already on file once the
    // load resolves.
    const [mode, setMode] = useState<"link" | "paste">("paste");
    const [text, setText] = useState("");
    const [deckUuid, setDeckUuid] = useState("");
    const [showAllFormats, setShowAllFormats] = useState(false);
    const [decks, setDecks] = useState<Array<DeckOverviewResponse>>([]);

    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | undefined>();
    const [removing, setRemoving] = useState(false);

    // The dialog stays mounted; every field starts fresh each time it opens, then the load below
    // fills in whatever is actually on file for this participant.
    useEffect(() => {
        if (!open) return;
        setLoading(true);
        setLoadError(undefined);
        setResponse(null);
        setMode("paste");
        setText("");
        setDeckUuid("");
        setShowAllFormats(false);
        setSaveError(undefined);
        setRemoving(false);

        let cancelled = false;
        Api.tournaments.participants.decklist
            .get(tournamentUuid, participant.uuid)
            .then(
                (result) => {
                    if (cancelled) return;
                    setResponse(result);
                    setText(result.decklist?.text ?? "");
                    if (canPickDeck && result.decklist?.deck != null) {
                        setDeckUuid(result.decklist.deck);
                        setMode("link");
                    }
                },
                (error) => {
                    if (cancelled) return;
                    console.error(error);
                    setLoadError(t("error.action-failed"));
                },
            )
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [open, tournamentUuid, participant.uuid, canPickDeck]);

    // Only once linking is even possible — TRAP 2: `Api.decks.list()` 401s for a guest, and a
    // staff member editing somebody else's row never gets to link their own deck onto it either
    // (`canPickDeck` is already false there).
    useEffect(() => {
        if (!open || !canPickDeck) {
            setDecks([]);
            return;
        }
        let cancelled = false;
        Api.decks.list().then(
            (loaded) => {
                if (!cancelled) setDecks(loaded);
            },
            () => {
                // Reported by `handleError` already; the picker simply stays empty.
            },
        );
        return () => {
            cancelled = true;
        };
    }, [open, canPickDeck]);

    // Format-matched by default, same reasoning as the join dialog's picker.
    const filteredDecks = showAllFormats
        ? decks
        : decks.filter((overview) => overview.deck.format === tournamentFormat);

    /** Writes the currently edited text or linked deck as this participant's decklist */
    async function save() {
        setSaving(true);
        setSaveError(undefined);
        try {
            const result = await Api.tournaments.participants.decklist.set(
                tournamentUuid,
                participant.uuid,
                canPickDeck && mode === "link"
                    ? { deck: deckUuid === "" ? undefined : deckUuid }
                    : { text: text.trim() === "" ? undefined : text.trim() },
            );
            if (isFormError(result)) {
                setSaveError(handleFormError(result.error, decklistErrorHandlers(t)).form);
                return;
            }
            setResponse(result);
            setText(result.decklist?.text ?? "");
            notify.success(t("toast.decklist-saved"));
            onChanged();
        } catch (error) {
            console.error(error);
            setSaveError(t("error.action-failed"));
        } finally {
            setSaving(false);
        }
    }

    /** Clears the decklist outright, after the confirmation dialog was accepted */
    async function remove() {
        setSaveError(undefined);
        try {
            const result = await Api.tournaments.participants.decklist.set(tournamentUuid, participant.uuid, {});
            if (isFormError(result)) {
                setSaveError(handleFormError(result.error, decklistErrorHandlers(t)).form);
                return;
            }
            setResponse(result);
            setText("");
            setDeckUuid("");
            setMode("paste");
            notify.success(t("toast.decklist-removed"));
            onChanged();
        } catch (error) {
            console.error(error);
            setSaveError(t("error.action-failed"));
        } finally {
            setRemoving(false);
        }
    }

    const mayEdit = response?.may_edit ?? false;

    return (
        <Dialog open={open} onClose={onClose}>
            <DialogTitle>{t("heading.decklist", { name: participant.display_name })}</DialogTitle>
            <DialogBody>
                {loading ? (
                    <Text>{t("label.loading")}</Text>
                ) : loadError !== undefined ? (
                    <InlineError>{loadError}</InlineError>
                ) : (
                    <div className={"flex flex-col gap-4"}>
                        {response?.locked === true && !mayEdit && (
                            <Description>{t("error.decklist-locked")}</Description>
                        )}

                        {response?.decklist == null ? (
                            <Text>{t("label.no-decklist")}</Text>
                        ) : (
                            <div className={"flex flex-col gap-2"}>
                                {response.decklist.deck != null && (
                                    <Description>{t("label.decklist-from-deck")}</Description>
                                )}
                                <pre
                                    className={
                                        "max-h-64 overflow-y-auto rounded-(--radius-control) bg-zinc-950/5 p-3 font-mono text-sm whitespace-pre-wrap text-zinc-950 dark:bg-white/10 dark:text-white"
                                    }
                                >
                                    {response.decklist.text}
                                </pre>
                            </div>
                        )}

                        {mayEdit && (
                            <div
                                className={"flex flex-col gap-3 border-t border-zinc-950/10 pt-4 dark:border-white/10"}
                            >
                                {canPickDeck && (
                                    <div className={"flex gap-2"}>
                                        <Button
                                            color={"blue"}
                                            outline={mode !== "link"}
                                            onClick={() => setMode("link")}
                                        >
                                            {t("button.link-deck")}
                                        </Button>
                                        <Button
                                            color={"blue"}
                                            outline={mode !== "paste"}
                                            onClick={() => setMode("paste")}
                                        >
                                            {t("button.paste-decklist")}
                                        </Button>
                                    </div>
                                )}
                                {canPickDeck && mode === "link" ? (
                                    <Field>
                                        <Label>{t("label.deck")}</Label>
                                        <Listbox value={deckUuid} onChange={setDeckUuid}>
                                            <ListboxOption value={""}>
                                                <ListboxLabel>{t("label.no-deck")}</ListboxLabel>
                                            </ListboxOption>
                                            {filteredDecks.map((overview) => (
                                                <ListboxOption key={overview.deck.uuid} value={overview.deck.uuid}>
                                                    <ListboxLabel>{overview.deck.name}</ListboxLabel>
                                                </ListboxOption>
                                            ))}
                                        </Listbox>
                                        <CheckboxField>
                                            <Checkbox checked={showAllFormats} onChange={setShowAllFormats} />
                                            <Label>{t("label.show-all-formats")}</Label>
                                        </CheckboxField>
                                    </Field>
                                ) : (
                                    <Field>
                                        <Label>{t("label.decklist-text")}</Label>
                                        <Textarea
                                            rows={8}
                                            maxLength={16384}
                                            className={"font-mono"}
                                            value={text}
                                            onChange={(event) => setText(event.target.value)}
                                        />
                                    </Field>
                                )}
                                {saveError !== undefined && <InlineError>{saveError}</InlineError>}
                            </div>
                        )}
                    </div>
                )}
            </DialogBody>
            <DialogActions>
                <Button plain onClick={onClose}>
                    {tg("button.cancel")}
                </Button>
                {mayEdit && (
                    <Button
                        outline
                        color={"red"}
                        disabled={response?.decklist == null}
                        onClick={() => setRemoving(true)}
                    >
                        {t("button.remove-decklist")}
                    </Button>
                )}
                {mayEdit && (
                    <Button color={"blue"} loading={saving} onClick={() => void save()}>
                        {t("button.save")}
                    </Button>
                )}
            </DialogActions>

            <ConfirmDialog
                open={removing}
                onClose={() => setRemoving(false)}
                onConfirm={() => remove()}
                title={t("button.remove-decklist")}
                description={t("description.confirm-remove-decklist", { name: participant.display_name })}
                confirmLabel={t("button.remove-decklist")}
            />
        </Dialog>
    );
}
