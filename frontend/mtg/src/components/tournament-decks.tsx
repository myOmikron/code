import {
    Badge,
    Button,
    Description,
    Dialog,
    DialogActions,
    DialogBody,
    DialogTitle,
    ErrorMessage,
    Field,
    Label,
    Listbox,
    ListboxLabel,
    ListboxOption,
    Subheading,
    Text,
    notify,
} from "components";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api, type UUID } from "src/api/api";
import type {
    MyRegisteredDeckResponse,
    ParticipantResponse,
    RegisterDeckErrors,
    RegisteredDeckResponse,
    TournamentResponse,
} from "src/api/generated";
import { PrimaryButton } from "src/components/primary-button";
import { isFormError } from "src/utils/error";

/** A deck to choose from: its id and its name */
type DeckChoice = {
    /** The deck */
    uuid: UUID;
    /** Its name */
    name: string;
};

/**
 * The properties for {@link MyTournamentDeck}
 */
export type MyTournamentDeckProps = {
    /** The Tournament the reader plays in */
    tournament: TournamentResponse;
};

/**
 * The reader's own Registered deck: pick one of its decks, swap it or play
 * without one, until the first Round starts.
 *
 * @returns the section
 */
export function MyTournamentDeck({ tournament }: MyTournamentDeckProps) {
    const [t] = useTranslation("tournament");
    const [mine, setMine] = useState<MyRegisteredDeckResponse | null>(null);
    const [decks, setDecks] = useState<Array<DeckChoice>>([]);
    const [chosen, setChosen] = useState<UUID | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const reload = useCallback(async () => {
        const loaded = await Api.tournaments.decks.mine(tournament.uuid);
        setMine(loaded);
        setChosen(loaded.deck?.deck ?? null);
    }, [tournament.uuid]);

    useEffect(() => {
        reload().catch(() => undefined);
        Api.decks
            .list()
            .then((list) => setDecks(list.map((overview) => ({ uuid: overview.deck.uuid, name: overview.deck.name }))))
            .catch(() => undefined);
    }, [reload]);

    if (mine === null) return null;
    const registered = mine.deck ?? null;

    /**
     * Registers the chosen deck, or swaps the registered one for it
     */
    async function register() {
        if (chosen === null) return;
        setBusy(true);
        try {
            const result = await Api.tournaments.decks.register(tournament.uuid, chosen);
            if (isFormError<unknown, { result: "Err"; error: RegisterDeckErrors }>(result)) {
                setError(refusal(result.error));
                return;
            }
            setError(null);
            notify.success(t("toast.deck-registered"));
            await reload();
        } finally {
            setBusy(false);
        }
    }

    /**
     * Removes the registered deck, so the reader plays without one
     */
    async function remove() {
        setBusy(true);
        try {
            const result = await Api.tournaments.decks.remove(tournament.uuid);
            if (isFormError<unknown, { result: "Err"; error: RegisterDeckErrors }>(result)) {
                setError(refusal(result.error));
                return;
            }
            setError(null);
            notify.success(t("toast.deck-removed"));
            await reload();
        } finally {
            setBusy(false);
        }
    }

    /**
     * Says why a write was refused
     *
     * @param errors what the service refused
     * @returns the message
     */
    function refusal(errors: RegisterDeckErrors) {
        return errors.registration_over ? t("description.my-deck-closed") : t("error.not-their-deck");
    }

    return (
        <section className={"flex flex-col gap-3"}>
            <Subheading>{t("heading.my-deck")}</Subheading>
            <div className={"flex items-center gap-2"}>
                <Text>{registered?.name ?? t("label.no-deck")}</Text>
                {registered?.pinned && <Badge color={"zinc"}>{t("label.deck-pinned")}</Badge>}
            </div>
            {mine.changeable ? (
                decks.length === 0 ? (
                    <Text>{t("description.no-own-decks")}</Text>
                ) : (
                    <Field>
                        <Label>{t("label.deck")}</Label>
                        <div className={"flex flex-wrap items-start gap-2"}>
                            <div className={"min-w-0 flex-1"}>
                                <Listbox<UUID | null>
                                    value={chosen}
                                    placeholder={t("label.no-deck")}
                                    invalid={error !== null}
                                    onChange={(deck) => {
                                        setChosen(deck);
                                        setError(null);
                                    }}
                                >
                                    {decks.map((deck) => (
                                        <ListboxOption key={deck.uuid} value={deck.uuid}>
                                            <ListboxLabel>{deck.name}</ListboxLabel>
                                        </ListboxOption>
                                    ))}
                                </Listbox>
                            </div>
                            <PrimaryButton
                                disabled={busy || chosen === null || chosen === registered?.deck}
                                onClick={() => void register()}
                            >
                                {t("button.register-deck")}
                            </PrimaryButton>
                            {registered !== null && (
                                <Button outline disabled={busy} onClick={() => void remove()}>
                                    {t("button.remove-deck")}
                                </Button>
                            )}
                        </div>
                        {error !== null ? (
                            <ErrorMessage>{error}</ErrorMessage>
                        ) : (
                            <Description>{t("description.my-deck-follows")}</Description>
                        )}
                    </Field>
                )
            ) : (
                <Text>{registered?.pinned ? t("description.my-deck-pinned") : t("description.my-deck-closed")}</Text>
            )}
        </section>
    );
}

/**
 * The properties for {@link RegisteredDeckDialog}
 */
export type RegisteredDeckDialogProps = {
    /** The Tournament */
    tournament: TournamentResponse;
    /** The Participant whose deck is changed; the dialog is open while it is not `null` */
    participant: ParticipantResponse | null;
    /** Its Registered deck, `null` while it plays without one */
    current: RegisteredDeckResponse | null;
    /** Called when the dialog should close */
    onClose: () => void;
    /** Called after the Registered deck changed */
    onSaved: () => Promise<void>;
};

/**
 * Dialog for an Organizer to register, swap or remove a Participant's deck,
 * picked among the decks its Account owns.
 *
 * @returns the dialog
 */
export function RegisteredDeckDialog({
    tournament,
    participant,
    current,
    onClose,
    onSaved,
}: RegisteredDeckDialogProps) {
    const [t] = useTranslation("tournament");
    const [tg] = useTranslation();
    const [decks, setDecks] = useState<Array<DeckChoice> | null>(null);
    const [chosen, setChosen] = useState<UUID | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        setDecks(null);
        setError(null);
        setChosen(current?.deck ?? null);
        if (participant === null) return;
        let gone = false;
        Api.tournaments.decks
            .candidates(tournament.uuid, participant.uuid)
            .then((list) => {
                if (!gone) setDecks(list.decks.map((deck) => ({ uuid: deck.uuid, name: deck.name })));
            })
            .catch(() => undefined);
        return () => {
            gone = true;
        };
    }, [tournament.uuid, participant, current]);

    /**
     * Runs a write, closing on success and saying why on a refusal
     *
     * @param action the write
     * @param done the toast after it
     */
    async function act(action: () => Promise<unknown>, done: string) {
        setBusy(true);
        try {
            const result = await action();
            if (isFormError<unknown, { result: "Err"; error: RegisterDeckErrors }>(result)) {
                setError(result.error.not_their_deck ? t("error.not-their-deck") : t("error.registration-over"));
                return;
            }
            notify.success(done);
            await onSaved();
        } finally {
            setBusy(false);
        }
    }

    return (
        <Dialog open={participant !== null} onClose={onClose}>
            <DialogTitle>{t("heading.change-deck", { name: participant?.name ?? "" })}</DialogTitle>
            <DialogBody>
                {decks !== null && decks.length === 0 ? (
                    <Text>{t("description.no-player-decks")}</Text>
                ) : (
                    <Field>
                        <Label>{t("label.deck")}</Label>
                        <Listbox<UUID | null>
                            value={chosen}
                            placeholder={t("label.no-deck")}
                            invalid={error !== null}
                            onChange={(deck) => {
                                setChosen(deck);
                                setError(null);
                            }}
                        >
                            {(decks ?? []).map((deck) => (
                                <ListboxOption key={deck.uuid} value={deck.uuid}>
                                    <ListboxLabel>{deck.name}</ListboxLabel>
                                </ListboxOption>
                            ))}
                        </Listbox>
                        {error !== null ? (
                            <ErrorMessage>{error}</ErrorMessage>
                        ) : (
                            <Description>{t("description.change-deck")}</Description>
                        )}
                    </Field>
                )}
            </DialogBody>
            <DialogActions>
                <Button plain onClick={onClose}>
                    {tg("button.cancel")}
                </Button>
                {current !== null && participant !== null && (
                    <Button
                        outline
                        disabled={busy}
                        onClick={() =>
                            void act(
                                () => Api.tournaments.decks.removeFor(tournament.uuid, participant.uuid),
                                t("toast.deck-removed"),
                            )
                        }
                    >
                        {t("button.remove-deck")}
                    </Button>
                )}
                <PrimaryButton
                    disabled={busy || chosen === null || participant === null}
                    onClick={() => {
                        if (chosen === null || participant === null) return;
                        void act(
                            () => Api.tournaments.decks.registerFor(tournament.uuid, participant.uuid, chosen),
                            t("toast.deck-registered"),
                        );
                    }}
                >
                    {t("button.register-deck")}
                </PrimaryButton>
            </DialogActions>
        </Dialog>
    );
}
