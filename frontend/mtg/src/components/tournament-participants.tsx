import {
    BanknotesIcon,
    PlusIcon,
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
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { TournamentState, Visibility } from "src/api/generated";
import type {
    FormErrorResponseForSignUpErrors,
    ListParticipantsResponse,
    ParticipantResponse,
    RegisteredDeckResponse,
    TournamentResponse,
} from "src/api/generated";
import { PrimaryButton } from "src/components/primary-button";
import { RegisteredListWarnings, MyTournamentDeck, RegisteredDeckDialog } from "src/components/tournament-decks";
import { useAccount } from "src/context/account";
import { useLiveVersion } from "src/context/tournament-live-context";
import { isFormError } from "src/utils/error";
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
export function TournamentParticipants({ tournament, load, signUp }: TournamentParticipantsProps) {
    const [t] = useTranslation("tournament");
    const { account } = useAccount();
    const [list, setList] = useState<ListParticipantsResponse | null>(null);
    const [busy, setBusy] = useState(false);
    const [dropping, setDropping] = useState<ParticipantResponse | null>(null);
    const [decks, setDecks] = useState<Map<string, RegisteredDeckResponse>>(new Map());
    const [deckOf, setDeckOf] = useState<ParticipantResponse | null>(null);
    const [warnings, setWarnings] = useState<Map<string, Array<RegisteredListWarning>>>(new Map());

    const organizer = tournament.organizer_role != null;
    const registration = tournament.state === TournamentState.Registration;
    const takesParticipants = registration || tournament.state === TournamentState.Swiss;
    const dropsOpen = tournament.state === TournamentState.Swiss || tournament.state === TournamentState.TopCut;
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
                if (result.error.full) notify.error(t("error.sign-up-full"));
                else if (result.error.already_participant) notify.error(t("error.sign-up-already"));
                else notify.error(t("error.sign-up-closed"));
            } else {
                notify.success(t("toast.signed-up"));
            }
            await reload();
        } finally {
            setBusy(false);
        }
    }

    /**
     * Withdraws the reader's own sign-up
     */
    async function leave() {
        setBusy(true);
        try {
            await Api.tournaments.participants.withdraw(tournament.uuid);
            notify.success(t("toast.sign-up-withdrawn"));
            await reload();
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
                notify.error(result.error.not_started ? t("error.drop-not-started") : t("error.tournament-over"));
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
                {signUpOpen &&
                    account !== null &&
                    list !== null &&
                    (list.me == null ? (
                        <PrimaryButton disabled={busy || full} onClick={() => void join()}>
                            <UserPlusIcon />
                            {full ? t("button.sign-up-full") : t("button.sign-up")}
                        </PrimaryButton>
                    ) : (
                        <Button outline disabled={busy} onClick={() => void leave()}>
                            {t("button.withdraw-sign-up")}
                        </Button>
                    ))}
                {signUpOpen && account === null && <Text>{t("description.sign-up-needs-account")}</Text>}
                {dropsOpen && mine !== null && mine.dropped_after_round == null && (
                    <Button outline disabled={busy} onClick={() => setDropping(mine)}>
                        <UserMinusIcon />
                        {t("button.drop")}
                    </Button>
                )}
            </div>

            {account !== null && list?.me != null && <MyTournamentDeck tournament={tournament} />}

            {collectsFees && (
                <Text>
                    {unpaidCount === 0
                        ? t("description.everybody-paid")
                        : t("description.unpaid-count", { count: unpaidCount })}
                </Text>
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
