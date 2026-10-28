import {
    BanknotesIcon,
    CheckCircleIcon,
    PlusIcon,
    QrCodeIcon,
    RectangleStackIcon,
    TrashIcon,
    UserMinusIcon,
    UserPlusIcon,
} from "@heroicons/react/20/solid";
import {
    Badge,
    Button,
    ConfirmDialog,
    Description,
    ErrorMessage,
    Field,
    Input,
    Label,
    Subheading,
    Text,
    notify,
} from "components";
import { useRouter } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { CheckIn, TournamentState, Visibility } from "src/api/generated";
import type {
    FormErrorResponseForSignUpErrors,
    GuestSignUpRequest,
    SignUpAsSharedTournamentGuest200Response,
    SetCheckedInErrors,
    ListParticipantsResponse,
    ParticipantResponse,
    RegisteredDeckResponse,
    TournamentResponse,
} from "src/api/generated";
import { TournamentGuestSignUp } from "src/components/tournament-guest-sign-up";
import { TournamentPushActivation } from "src/components/tournament-push-activation";
import { TournamentSeatLinkDialog } from "src/components/tournament-seat-link-dialog";
import { PrimaryButton } from "src/components/primary-button";
import { RegisteredListWarnings, MyTournamentDeck, RegisteredDeckDialog } from "src/components/tournament-decks";
import { useAccount } from "src/context/account";
import { useLiveVersion } from "src/context/tournament-live-context";
import { isFormError } from "src/utils/error";
import { forgetGuestSeat, guestSignUpOpen } from "src/utils/tournament-guest";
import { dropErrorKey, signUpErrorKey } from "src/utils/tournament-participants";
import { type RegisteredListWarning, registeredListWarnings } from "src/utils/tournament-registered-lists";

/**
 * The properties for {@link TournamentParticipants}
 */
export type TournamentParticipantsProps = {
    /** The Tournament as the reader sees it */
    tournament: TournamentResponse;
    /** Reads the Participants, by id or by share link */
    load: () => Promise<ListParticipantsResponse>;
    /** Signs the logged-in Account up, by id or by share link */
    signUp: () => Promise<ParticipantResponse | FormErrorResponseForSignUpErrors>;
    /** Signs a visitor without an Account up as a Guest, by id or by share link */
    guestSignUp: (request: GuestSignUpRequest) => Promise<SignUpAsSharedTournamentGuest200Response | null>;
};

/**
 * The Participants of a Tournament, with signing up and Dropping and, for its
 * Organizers, adding Accounts and Guests, removing and Dropping them.
 *
 * Removing and signing up work while the Tournament is in Registration; the
 * participant limit holds back self sign-up only, never an Organizer. Once the
 * first Round started, Organizers add late Participants until the Swiss Rounds
 * are over, and a Participant leaves by a Drop.
 *
 * @returns the participant list with its actions
 */
export function TournamentParticipants({ tournament, load, signUp, guestSignUp }: TournamentParticipantsProps) {
    const [t] = useTranslation("tournament");
    const { account } = useAccount();
    const router = useRouter();
    const [list, setList] = useState<ListParticipantsResponse | null>(null);
    const [busy, setBusy] = useState(false);
    const [signedUp, setSignedUp] = useState(false);
    const [dropping, setDropping] = useState<ParticipantResponse | null>(null);
    const [decks, setDecks] = useState<Map<string, RegisteredDeckResponse>>(new Map());
    const [deckOf, setDeckOf] = useState<ParticipantResponse | null>(null);
    const [seatLinkOf, setSeatLinkOf] = useState<ParticipantResponse | null>(null);
    const [warnings, setWarnings] = useState<Map<string, Array<RegisteredListWarning>>>(new Map());

    const organizer = tournament.organizer_role != null;
    const registration = tournament.state === TournamentState.Registration;
    const takesParticipants = registration || tournament.state === TournamentState.Swiss;
    const dropsOpen = tournament.state === TournamentState.Swiss || tournament.state === TournamentState.TopCut;
    const over = tournament.state === TournamentState.Finished || tournament.state === TournamentState.Cancelled;
    const participants = list?.participants ?? [];
    const mine = participants.find((participant) => participant.uuid === list?.me) ?? null;
    const limit = tournament.participant_limit ?? null;
    const full = limit !== null && participants.length >= limit;
    const collectsFees =
        organizer &&
        tournament.entry_fee != null &&
        tournament.state !== TournamentState.Finished &&
        tournament.state !== TournamentState.Cancelled;
    const version = useLiveVersion("participants");
    const unpaidCount = participants.filter((participant) => participant.unpaid === true).length;
    const deckRequired = tournament.check_in === CheckIn.RequiredWithDeck;
    const desk =
        organizer &&
        tournament.check_in !== CheckIn.Off &&
        tournament.state !== TournamentState.Finished &&
        tournament.state !== TournamentState.Cancelled;
    const waiting = participants.filter(
        (participant) => participant.checked_in === false && participant.dropped_after_round == null,
    );

    /**
     * Whether the desk may not check an Account in for want of a Registered deck
     *
     * @param participant the Participant
     * @returns whether its check-in is blocked
     */
    const lacksDeck = (participant: ParticipantResponse) =>
        deckRequired && !participant.guest && !participant.checked_in && !decks.has(participant.uuid);

    /**
     * Whether the desk may flip a Participant's check-in: only in, once the first Round started
     *
     * @param participant the Participant
     * @returns whether the toggle shows
     */
    const togglable = (participant: ParticipantResponse) =>
        desk &&
        participant.dropped_after_round == null &&
        participant.checked_in != null &&
        (registration || !participant.checked_in);
    const signUpOpen = tournament.self_sign_up && tournament.visibility !== Visibility.Private && registration;

    const reload = useCallback(async () => {
        setList(await load());
    }, [load]);

    const reloadDecks = useCallback(async () => {
        if (!organizer) return;
        const [registered, lists, rules] = await Promise.all([
            Api.tournaments.decks.list(tournament.uuid),
            Api.tournaments.decks.lists(tournament.uuid),
            Api.decks.formats(),
        ]);
        setDecks(new Map(registered.decks.map((deck) => [deck.participant, deck])));
        setWarnings(
            new Map(
                lists.decks.map((list) => [
                    list.participant,
                    registeredListWarnings(list, tournament.format, rules.formats, rules.brackets),
                ]),
            ),
        );
    }, [organizer, tournament.uuid, tournament.format, version]);

    useEffect(() => {
        reloadDecks().catch(() => undefined);
    }, [reloadDecks]);

    useEffect(() => {
        let gone = false;
        load()
            .then((loaded) => {
                if (!gone) setList(loaded);
            })
            .catch(() => undefined);
        return () => {
            gone = true;
        };
    }, [load]);

    /**
     * Signs the reader up, saying why when it was refused
     */
    async function join() {
        setBusy(true);
        try {
            const result = await signUp();
            if (isFormError(result)) {
                notify.error(t(signUpErrorKey(result.error)));
            } else {
                notify.success(t("toast.signed-up"));
                setSignedUp(true);
            }
            await reload();
        } finally {
            setBusy(false);
        }
    }

    /**
     * Withdraws the reader's own sign-up; a Guest's seat and Recovery code go with it
     */
    async function leave() {
        setBusy(true);
        try {
            await Api.tournaments.participants.withdraw(tournament.uuid);
            if (mine?.guest) forgetGuestSeat(tournament.uuid);
            notify.success(t("toast.sign-up-withdrawn"));
            setSignedUp(false);
            await reload();
            if (mine?.guest) await router.invalidate();
        } finally {
            setBusy(false);
        }
    }

    /**
     * Drops the Participant asked about, the reader itself or one an Organizer picked
     */
    async function confirmDrop() {
        const participant = dropping;
        if (participant === null) return;
        const self = participant.uuid === list?.me;
        setBusy(true);
        try {
            const result = self
                ? await Api.tournaments.participants.dropOut(tournament.uuid)
                : await Api.tournaments.participants.drop(tournament.uuid, participant.uuid);
            if (isFormError(result)) {
                notify.error(t(dropErrorKey(result.error)));
            } else {
                notify.success(
                    self ? t("toast.dropped-self") : t("toast.participant-dropped", { name: participant.name }),
                );
            }
            setDropping(null);
            await reload();
        } finally {
            setBusy(false);
        }
    }

    /**
     * Marks a Participant paid or, taking it back, unpaid, as an Organizer
     *
     * @param participant the Participant
     * @param paid whether it paid
     */
    async function markPaid(participant: ParticipantResponse, paid: boolean) {
        setBusy(true);
        try {
            const result = await Api.tournaments.participants.setPaid(tournament.uuid, participant.uuid, paid);
            if (isFormError(result)) {
                notify.error(result.error.no_entry_fee ? t("error.no-entry-fee") : t("error.tournament-over"));
            }
            await reload();
        } finally {
            setBusy(false);
        }
    }

    /**
     * Checks a Participant in or, taking it back, out, as an Organizer
     *
     * @param participant the Participant
     * @param checkedIn whether it is checked in
     */
    async function checkIn(participant: ParticipantResponse, checkedIn: boolean) {
        setBusy(true);
        try {
            const result = await Api.tournaments.participants.setCheckedIn(
                tournament.uuid,
                participant.uuid,
                checkedIn,
            );
            if (isFormError(result)) notify.error(checkInRefusal(result.error));
            await reload();
        } finally {
            setBusy(false);
        }
    }

    /**
     * Says why a check-in was refused
     *
     * @param errors what the service refused
     * @returns the message
     */
    function checkInRefusal(errors: SetCheckedInErrors) {
        if (errors.no_registered_deck) return t("error.check-in-needs-deck");
        if (errors.round_started) return t("error.check-out-started");
        if (errors.dropped) return t("error.check-in-dropped");
        if (errors.no_check_in) return t("error.no-check-in");
        return t("error.tournament-over");
    }

    /**
     * Checks in everybody who plays on, naming those left out for want of a deck
     */
    async function checkInEveryone() {
        setBusy(true);
        try {
            const result = await Api.tournaments.participants.checkInEveryone(tournament.uuid);
            if (isFormError(result)) {
                notify.error(result.error.no_check_in ? t("error.no-check-in") : t("error.tournament-over"));
            } else if (result.no_registered_deck.length > 0) {
                const names = participants
                    .filter((participant) => result.no_registered_deck.includes(participant.uuid))
                    .map((participant) => participant.name)
                    .join(", ");
                notify.error(t("toast.check-in-skipped", { names }));
            } else {
                notify.success(t("toast.checked-in-everyone"));
            }
            await reload();
        } finally {
            setBusy(false);
        }
    }

    /**
     * Takes a Participant out, as an Organizer
     *
     * @param participant the Participant to remove
     */
    async function remove(participant: ParticipantResponse) {
        setBusy(true);
        try {
            await Api.tournaments.participants.remove(tournament.uuid, participant.uuid);
            notify.success(t("toast.participant-removed", { name: participant.name }));
            await reload();
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className={"flex flex-col gap-6"}>
            <div className={"flex flex-wrap items-center justify-between gap-4"}>
                <Text>
                    {limit === null
                        ? t("label.participant-count", { count: participants.length })
                        : t("label.participant-count-of-limit", { count: participants.length, limit })}
                </Text>
                {signUpOpen && account !== null && list !== null && list.me == null && (
                    <PrimaryButton disabled={busy || full} onClick={() => void join()}>
                        <UserPlusIcon />
                        {full ? t("button.sign-up-full") : t("button.sign-up")}
                    </PrimaryButton>
                )}
                {registration && list !== null && list.me != null && (signUpOpen || mine?.guest === true) && (
                    <Button outline disabled={busy} onClick={() => void leave()}>
                        {t("button.withdraw-sign-up")}
                    </Button>
                )}
                {signUpOpen && account === null && list !== null && list.me == null && !guestSignUpOpen(tournament) && (
                    <Text>{t("description.sign-up-needs-account")}</Text>
                )}
                {dropsOpen && mine !== null && mine.dropped_after_round == null && (
                    <Button outline disabled={busy} onClick={() => setDropping(mine)}>
                        <UserMinusIcon />
                        {t("button.drop")}
                    </Button>
                )}
            </div>

            {account === null && list !== null && list.me == null && guestSignUpOpen(tournament) && (
                <TournamentGuestSignUp
                    tournament={tournament}
                    signUp={guestSignUp}
                    onSignedUp={() => {
                        void reload();
                        void router.invalidate();
                    }}
                />
            )}
            {account !== null && mine?.guest !== true && (signedUp || list?.me != null) && <TournamentPushActivation />}
            {account !== null && list?.me != null && mine?.guest !== true && (
                <MyTournamentDeck tournament={tournament} checkedIn={mine?.checked_in ?? null} />
            )}

            {collectsFees && (
                <Text>
                    {unpaidCount === 0
                        ? t("description.everybody-paid")
                        : t("description.unpaid-count", { count: unpaidCount })}
                </Text>
            )}

            {desk && (
                <div className={"flex flex-wrap items-center justify-between gap-4"}>
                    <Text>
                        {waiting.length === 0
                            ? t("description.everybody-checked-in")
                            : t("description.not-checked-in-count", { count: waiting.length })}
                    </Text>
                    {waiting.length > 0 && (
                        <Button outline disabled={busy} onClick={() => void checkInEveryone()}>
                            <CheckCircleIcon />
                            {t("button.check-in-everyone")}
                        </Button>
                    )}
                </div>
            )}

            {organizer && takesParticipants && (
                <ParticipantAdder tournament={tournament} late={!registration} onAdded={reload} />
            )}

            {list !== null && participants.length === 0 ? (
                <Text>{t("description.no-participants")}</Text>
            ) : (
                <ul className={"flex flex-col divide-y divide-zinc-950/5 dark:divide-white/10"}>
                    {participants.map((participant) => (
                        <li key={participant.uuid} className={"flex items-center gap-3 py-2"}>
                            <span className={"min-w-0 flex-1 truncate text-sm/6 text-zinc-950 dark:text-white"}>
                                {participant.name}
                            </span>
                            {participant.uuid === list?.me && <Badge color={"lime"}>{t("label.you")}</Badge>}
                            {participant.guest && <Badge color={"zinc"}>{t("label.guest")}</Badge>}
                            {participant.late_from_round != null && (
                                <Badge color={"sky"}>
                                    {t("label.late-from-round", { number: participant.late_from_round })}
                                </Badge>
                            )}
                            {participant.dropped_after_round != null && (
                                <Badge color={"amber"}>
                                    {t("label.dropped-after-round", { number: participant.dropped_after_round })}
                                </Badge>
                            )}
                            {participant.unpaid === true && tournament.entry_fee != null && (
                                <Badge color={"red"}>{t("label.unpaid")}</Badge>
                            )}
                            {participant.checked_in === false &&
                                tournament.check_in !== CheckIn.Off &&
                                participant.dropped_after_round == null && (
                                    <Badge color={"orange"}>{t("label.not-checked-in")}</Badge>
                                )}
                            {organizer &&
                                deckRequired &&
                                !participant.guest &&
                                participant.checked_in === true &&
                                !decks.has(participant.uuid) && (
                                    <Badge color={"orange"}>{t("label.check-in-needs-deck")}</Badge>
                                )}
                            {organizer && deckRequired && participant.guest && participant.checked_in === true && (
                                <span className={"text-sm/6 text-zinc-500 dark:text-zinc-400"}>
                                    {t("label.no-deck")}
                                </span>
                            )}
                            {collectsFees && participant.unpaid != null && (
                                <Button
                                    plain
                                    disabled={busy}
                                    aria-label={
                                        participant.unpaid
                                            ? t("accessibility.mark-paid", { name: participant.name })
                                            : t("accessibility.mark-unpaid", { name: participant.name })
                                    }
                                    title={participant.unpaid ? t("button.mark-paid") : t("button.mark-unpaid")}
                                    onClick={() => void markPaid(participant, participant.unpaid === true)}
                                >
                                    <BanknotesIcon />
                                </Button>
                            )}
                            {togglable(participant) && (
                                <Button
                                    plain
                                    disabled={busy || lacksDeck(participant)}
                                    aria-label={
                                        lacksDeck(participant)
                                            ? t("accessibility.check-in-needs-deck", { name: participant.name })
                                            : participant.checked_in
                                              ? t("accessibility.check-out", { name: participant.name })
                                              : t("accessibility.check-in", { name: participant.name })
                                    }
                                    title={
                                        lacksDeck(participant)
                                            ? t("label.check-in-needs-deck")
                                            : participant.checked_in
                                              ? t("button.check-out")
                                              : t("button.check-in")
                                    }
                                    onClick={() => void checkIn(participant, participant.checked_in !== true)}
                                >
                                    <CheckCircleIcon />
                                </Button>
                            )}
                            {organizer && participant.guest && !over && (
                                <Button
                                    plain
                                    disabled={busy}
                                    aria-label={t("accessibility.seat-link", { name: participant.name })}
                                    title={t("button.seat-link")}
                                    onClick={() => setSeatLinkOf(participant)}
                                >
                                    <QrCodeIcon />
                                </Button>
                            )}
                            {organizer && dropsOpen && participant.dropped_after_round == null && (
                                <Button
                                    plain
                                    disabled={busy}
                                    aria-label={t("accessibility.drop-participant", { name: participant.name })}
                                    onClick={() => setDropping(participant)}
                                >
                                    <UserMinusIcon />
                                </Button>
                            )}
                            {organizer && !participant.guest && (
                                <>
                                    <span
                                        className={
                                            "hidden truncate text-sm/6 text-zinc-500 sm:block dark:text-zinc-400"
                                        }
                                    >
                                        {decks.get(participant.uuid)?.name ?? t("label.no-deck")}
                                    </span>
                                    <RegisteredListWarnings warnings={warnings.get(participant.uuid) ?? []} />
                                    <Button
                                        plain
                                        disabled={busy}
                                        aria-label={t("accessibility.change-deck", { name: participant.name })}
                                        onClick={() => setDeckOf(participant)}
                                    >
                                        <RectangleStackIcon />
                                    </Button>
                                </>
                            )}
                            {organizer && registration && (
                                <Button
                                    plain
                                    disabled={busy}
                                    aria-label={t("accessibility.remove-participant", { name: participant.name })}
                                    onClick={() => void remove(participant)}
                                >
                                    <TrashIcon />
                                </Button>
                            )}
                        </li>
                    ))}
                </ul>
            )}

            <ConfirmDialog
                open={dropping !== null}
                onClose={() => setDropping(null)}
                onConfirm={confirmDrop}
                title={
                    dropping !== null && dropping.uuid === list?.me
                        ? t("heading.drop-self")
                        : t("heading.drop-participant", { name: dropping?.name ?? "" })
                }
                description={
                    dropping !== null && dropping.uuid === list?.me
                        ? t("description.drop-self")
                        : t("description.drop-participant", { name: dropping?.name ?? "" })
                }
                confirmLabel={t("button.drop")}
            />
            {organizer && (
                <TournamentSeatLinkDialog
                    tournament={tournament}
                    participant={seatLinkOf}
                    onClose={() => setSeatLinkOf(null)}
                />
            )}
            {organizer && (
                <RegisteredDeckDialog
                    tournament={tournament}
                    participant={deckOf}
                    current={deckOf === null ? null : (decks.get(deckOf.uuid) ?? null)}
                    onClose={() => setDeckOf(null)}
                    onSaved={async () => {
                        setDeckOf(null);
                        await reloadDecks();
                    }}
                />
            )}
        </div>
    );
}

/**
 * The properties for {@link ParticipantAdder}
 */
type ParticipantAdderProps = {
    /** The Tournament to add Participants to */
    tournament: TournamentResponse;
    /** Whether a Round started, so whoever is added plays from the next one */
    late: boolean;
    /** Called after a Participant was added */
    onAdded: () => Promise<void>;
};

/**
 * An Organizer's two ways to add a Participant: an Account by its exact
 * username, or a Guest by name.
 *
 * @returns the two fields with their buttons
 */
function ParticipantAdder({ tournament, late, onAdded }: ParticipantAdderProps) {
    const [t] = useTranslation("tournament");
    const [username, setUsername] = useState("");
    const [accountError, setAccountError] = useState<string | null>(null);
    const [guestName, setGuestName] = useState("");
    const [guestError, setGuestError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    /**
     * Adds the Account named in the field
     */
    async function addAccount() {
        const name = username.trim();
        if (name === "") return;
        setBusy(true);
        try {
            const result = await Api.tournaments.participants.addAccount(tournament.uuid, name);
            if (isFormError(result)) {
                if (result.error.already_participant) setAccountError(t("error.participant-already"));
                else if (result.error.too_many_unknown_usernames) setAccountError(t("error.too-many-unknown"));
                else if (result.error.roster_closed) setAccountError(t("error.roster-closed"));
                else setAccountError(t("error.unknown-username"));
                return;
            }
            setAccountError(null);
            setUsername("");
            notify.success(t("toast.participant-added", { name: result.name }));
            await onAdded();
        } finally {
            setBusy(false);
        }
    }

    /**
     * Adds a Guest by the name in the field
     */
    async function addGuest() {
        const name = guestName.trim();
        if (name === "") return;
        setBusy(true);
        try {
            const result = await Api.tournaments.participants.addGuest(tournament.uuid, name);
            if (isFormError(result)) {
                setGuestError(result.error.roster_closed ? t("error.roster-closed") : t("error.guest-name-empty"));
                return;
            }
            setGuestError(null);
            setGuestName("");
            notify.success(t("toast.participant-added", { name: result.name }));
            await onAdded();
        } finally {
            setBusy(false);
        }
    }

    return (
        <section className={"flex flex-col gap-4"}>
            <Subheading>{t("heading.add-participants")}</Subheading>
            {late && <Text>{t("description.late-participant")}</Text>}
            <div className={"grid gap-4 sm:grid-cols-2"}>
                <Field>
                    <Label>{t("label.add-account")}</Label>
                    <form
                        className={"flex items-start gap-2"}
                        onSubmit={(event) => {
                            event.preventDefault();
                            void addAccount();
                        }}
                    >
                        <Input
                            className={"min-w-0 flex-1"}
                            maxLength={32}
                            value={username}
                            invalid={accountError !== null}
                            placeholder={t("label.username")}
                            aria-label={t("label.add-account")}
                            onChange={(event) => {
                                setUsername(event.target.value);
                                setAccountError(null);
                            }}
                        />
                        <Button type={"submit"} disabled={busy || username.trim() === ""} className={"shrink-0"}>
                            <PlusIcon />
                            {t("button.add-participant")}
                        </Button>
                    </form>
                    {accountError !== null ? (
                        <ErrorMessage>{accountError}</ErrorMessage>
                    ) : (
                        <Description>{t("description.add-account")}</Description>
                    )}
                </Field>
                <Field>
                    <Label>{t("label.add-guest")}</Label>
                    <form
                        className={"flex items-start gap-2"}
                        onSubmit={(event) => {
                            event.preventDefault();
                            void addGuest();
                        }}
                    >
                        <Input
                            className={"min-w-0 flex-1"}
                            maxLength={64}
                            value={guestName}
                            invalid={guestError !== null}
                            placeholder={t("label.guest-name")}
                            aria-label={t("label.add-guest")}
                            onChange={(event) => {
                                setGuestName(event.target.value);
                                setGuestError(null);
                            }}
                        />
                        <Button type={"submit"} disabled={busy || guestName.trim() === ""} className={"shrink-0"}>
                            <PlusIcon />
                            {t("button.add-participant")}
                        </Button>
                    </form>
                    {guestError !== null ? (
                        <ErrorMessage>{guestError}</ErrorMessage>
                    ) : (
                        <Description>{t("description.add-guest")}</Description>
                    )}
                </Field>
            </div>
        </section>
    );
}
