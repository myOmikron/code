import {
    Badge,
    Button,
    Checkbox,
    CheckboxField,
    Description,
    Field,
    Input,
    Label,
    Listbox,
    ListboxLabel,
    ListboxOption,
    RequiredLabel,
    Text,
    Textarea,
    notify,
} from "components";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { DecklistPolicy } from "src/api/generated";
import type { DeckOverviewResponse, JoinErrors, JoinLookupResponse } from "src/api/generated";
import { InlineError } from "src/components/inline-error";
import { tournamentStatusColor, tournamentStatusLabelKey } from "src/components/tournament-join-code";
import { TournamentVenue } from "src/components/tournament-venue";
import { useAccount } from "src/context/account";
import type { ValidationErrors } from "src/utils/error";
import { handleFormError, isFormError } from "src/utils/error";
import { formatDateTime } from "src/utils/format";
import { addTournamentGuest } from "src/utils/tournament-guest";

/**
 * Every field {@link JoinErrors} can carry, mapped onto the one inline message the card shows.
 *
 * The lookup and both join calls share this exact error shape, so one map serves all three —
 * `handleFormError` requires every field to have a handler regardless of which call actually set
 * it, since a shared backend type carries fields no single endpoint can trigger. Exported
 * because the code lookup on the `/join` pages shares the same error shape.
 *
 * @param t the `tournament` namespace translator
 *
 * @returns the handler map {@link handleFormError} wants
 */
export function joinErrorHandlers(t: (key: string) => string): {
    [Key in keyof JoinErrors]: (errors: ValidationErrors) => void;
} {
    return {
        unknown_code: (errors) => {
            errors.form = t("error.unknown-code");
        },
        registration_closed: (errors) => {
            errors.form = t("error.registration-closed");
        },
        already_registered: (errors) => {
            errors.form = t("error.already-registered");
        },
        empty_name: (errors) => {
            errors.form = t("error.empty-name");
        },
        decklist_missing: (errors) => {
            errors.form = t("error.decklist-missing");
        },
        unknown_deck: (errors) => {
            errors.form = t("error.unknown-deck");
        },
        invalid_decklist: (errors) => {
            errors.form = t("error.invalid-decklist");
        },
    };
}

/**
 * The reminder shown under the preview card once a lookup resolves, `null` when the policy asks
 * nothing extra of a joining player.
 *
 * @param policy the tournament's decklist policy
 * @param t the `tournament` namespace translator
 *
 * @returns the hint text, or `null` for {@link DecklistPolicy.Optional}
 */
function decklistPolicyHint(policy: DecklistPolicy, t: (key: string) => string): string | null {
    switch (policy) {
        case DecklistPolicy.RequiredToCheckIn:
            return t("description.decklist-required-check-in");
        case DecklistPolicy.RequiredToRegister:
            return t("description.decklist-required-register");
        case DecklistPolicy.Optional:
            return null;
    }
}

/**
 * The properties for {@link JoinCard}
 */
export type JoinCardProps = {
    /** The code as typed or scanned, already trimmed — what the join calls send */
    code: string;
    /** What the code resolved to */
    lookup: JoinLookupResponse;
    /** Called with the tournament uuid once the viewer has a row in it */
    onJoined: (tournamentUuid: string) => void;
};

/**
 * Everything that happens once a join code has resolved: the preview of what it names, whether
 * the viewer already has a seat, and — if not — the form that gets them one.
 *
 * Split out of the former join-code dialog so the same card can back the `/join/$code` deep-link
 * page (see the tournament-play plan's Q4): every door into a tournament ends up rendering this
 * once a code resolves, so it owns the whole decision tree from here on — guest vs. account,
 * decklist required or not, and the two doors a logged-out visitor gets to sign in or sign up
 * without losing the code they came in on.
 *
 * @returns the card
 */
export function JoinCard({ code, lookup, onJoined }: JoinCardProps) {
    const [t] = useTranslation("tournament");
    const me = useAccount();

    const [displayName, setDisplayName] = useState("");
    const [joinError, setJoinError] = useState<string | undefined>();
    const [joining, setJoining] = useState(false);

    // How an account hands in its list: link one of its own decks, or paste text like a guest
    // does. Guests only ever paste — there is no toggle on their side.
    const [decklistMode, setDecklistMode] = useState<"link" | "paste">("link");
    const [decks, setDecks] = useState<Array<DeckOverviewResponse>>([]);
    const [deckUuid, setDeckUuid] = useState("");
    const [showAllFormats, setShowAllFormats] = useState(false);
    const [decklistText, setDecklistText] = useState("");

    // Whether the viewer already has a row on this roster, checked quietly against the real
    // tournament (not the anonymous lookup, which never carries a viewer). Starts `true` so the
    // form never flashes on screen before the answer is in.
    const [checkingMembership, setCheckingMembership] = useState(true);
    const [alreadyIn, setAlreadyIn] = useState(false);

    // Prefills the account's own username once the session check resolves.
    useEffect(() => {
        setDisplayName(me.account?.username ?? "");
    }, [me.account]);

    // Only once there is an account to ask for — TRAP 2: `Api.decks.list()` 401s for a guest,
    // and that 401 would run through `handleError` into a login redirect a guest cannot
    // complete. A visitor never sees this request at all.
    useEffect(() => {
        if (me.account === null) {
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
    }, [me.account]);

    // `Api.tournaments.get` bypasses `handleError` on purpose (see its comment in `api.tsx`): a
    // stranger gets a 401, a private event a 400, and both are the ordinary way for most people
    // reaching this card to fail the check, not something worth the app's error screen. Either
    // one, like `participant` coming back `null`, just means "show the form".
    useEffect(() => {
        let cancelled = false;
        setCheckingMembership(true);
        setAlreadyIn(false);
        void (async () => {
            try {
                const response = await Api.tournaments.get(lookup.tournament);
                if (!cancelled) setAlreadyIn(response.viewer.participant != null);
            } catch {
                // Stranger (401) or private event (400) — not an error, just "not a member yet".
            } finally {
                if (!cancelled) setCheckingMembership(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [lookup.tournament]);

    // Format-matched by default — a Legacy deck offered for a Modern event is a mistake far more
    // often than it is deliberate, but nothing stops the account from picking one anyway.
    const filteredDecks = showAllFormats ? decks : decks.filter((overview) => overview.deck.format === lookup.format);

    const decklistProvided =
        me.account === null
            ? decklistText.trim() !== ""
            : decklistMode === "link"
              ? deckUuid !== ""
              : decklistText.trim() !== "";
    const decklistRequired = lookup.decklist_policy === DecklistPolicy.RequiredToRegister;

    /** Joins under the signed-in account */
    async function joinAsAccount() {
        setJoining(true);
        setJoinError(undefined);
        try {
            const response = await Api.join.asAccount(
                code,
                displayName.trim() === "" ? undefined : displayName.trim(),
                decklistMode === "link"
                    ? deckUuid === ""
                        ? undefined
                        : { deck: deckUuid }
                    : decklistText.trim() === ""
                      ? undefined
                      : { text: decklistText.trim() },
            );
            if (isFormError(response)) {
                // The up-front membership check above missed it — a row appeared between that
                // check and this click. Either way the viewer is in; there is nothing to show
                // but the way to the tournament they already have.
                if (response.error.already_registered) {
                    onJoined(lookup.tournament);
                    return;
                }
                setJoinError(handleFormError(response.error, joinErrorHandlers(t)).form);
                return;
            }
            notify.success(t("toast.joined"));
            onJoined(response.tournament);
        } catch (error) {
            console.error(error);
            setJoinError(t("error.join-failed"));
        } finally {
            setJoining(false);
        }
    }

    /** Joins as a guest, remembering the claim token on this device */
    async function joinAsGuest() {
        if (displayName.trim() === "") {
            setJoinError(t("error.empty-name"));
            return;
        }
        setJoining(true);
        setJoinError(undefined);
        try {
            const response = await Api.join.asGuest(
                code,
                displayName.trim(),
                decklistText.trim() === "" ? undefined : decklistText.trim(),
            );
            if (isFormError(response)) {
                if (response.error.already_registered) {
                    onJoined(lookup.tournament);
                    return;
                }
                setJoinError(handleFormError(response.error, joinErrorHandlers(t)).form);
                return;
            }
            addTournamentGuest({
                tournamentUuid: response.tournament,
                participantUuid: response.participant,
                claimToken: response.claim_token,
            });
            notify.success(t("toast.joined"));
            onJoined(response.tournament);
        } catch (error) {
            console.error(error);
            setJoinError(t("error.join-failed"));
        } finally {
            setJoining(false);
        }
    }

    return (
        <div
            className={"flex flex-col gap-3 rounded-(--radius-card) border border-zinc-950/10 p-4 dark:border-white/10"}
        >
            <Text className={"text-base font-semibold text-zinc-950 dark:text-white"}>{lookup.name}</Text>
            <div className={"flex flex-wrap items-center gap-2"}>
                <Badge color={tournamentStatusColor(lookup.status)}>{t(tournamentStatusLabelKey(lookup.status))}</Badge>
                <Badge color={"zinc"}>{lookup.format}</Badge>
                <Badge color={"zinc"}>{t("label.players", { count: lookup.participant_count })}</Badge>
            </div>
            {lookup.venue != null && lookup.venue !== "" && (
                <TournamentVenue
                    name={lookup.venue}
                    address={lookup.venue_address}
                    instructions={lookup.venue_instructions}
                />
            )}
            {lookup.starts_at != null && <Text>{formatDateTime(lookup.starts_at)}</Text>}

            {checkingMembership ? (
                // `label.loading` rather than a new key — this is the same "still asking the
                // server" moment as the account wait below, just for a different question.
                <Text>{t("label.loading")}</Text>
            ) : alreadyIn ? (
                <div className={"flex flex-col gap-3"}>
                    <Text className={"text-base font-semibold text-zinc-950 dark:text-white"}>
                        {t("heading.already-joined")}
                    </Text>
                    <Text>{t("description.already-joined")}</Text>
                    <Button
                        color={"blue"}
                        href={"/tournaments/$tournamentUuid/overview"}
                        params={{ tournamentUuid: lookup.tournament }}
                    >
                        {t("button.open-tournament")}
                    </Button>
                </div>
            ) : !lookup.registration_open ? (
                <InlineError>{t("error.registration-closed")}</InlineError>
            ) : (
                <div className={"flex flex-col gap-3"}>
                    {decklistPolicyHint(lookup.decklist_policy, t) !== null && (
                        // `Text`, not `Description` — this card is not always inside a `Field` or
                        // a `Dialog` (the `/join/$code` page renders it directly on the page), and
                        // Headless UI's `Description` throws outside both. `Text`'s default
                        // styling is identical, so nothing changes on screen.
                        <Text>{decklistPolicyHint(lookup.decklist_policy, t)}</Text>
                    )}
                    {me.loading ? (
                        // Never flash the guest form at an account still being resolved — a
                        // logged-in account joins under its own name, not as a fresh guest.
                        <Text>{t("label.loading")}</Text>
                    ) : (
                        <>
                            {me.account === null ? (
                                <>
                                    <Field>
                                        <RequiredLabel>{t("label.your-name")}</RequiredLabel>
                                        <Description>{t("description.join-as-guest")}</Description>
                                        <Input
                                            required={true}
                                            maxLength={64}
                                            value={displayName}
                                            onChange={(event) => setDisplayName(event.target.value)}
                                        />
                                    </Field>
                                    <Field>
                                        {decklistRequired ? (
                                            <RequiredLabel>{t("label.decklist-text")}</RequiredLabel>
                                        ) : (
                                            <Label>{t("label.decklist-text")}</Label>
                                        )}
                                        <Textarea
                                            rows={8}
                                            maxLength={16384}
                                            className={"font-mono"}
                                            value={decklistText}
                                            onChange={(event) => setDecklistText(event.target.value)}
                                        />
                                    </Field>
                                </>
                            ) : (
                                <div className={"flex flex-col gap-2"}>
                                    <div className={"flex gap-2"}>
                                        <Button
                                            color={"blue"}
                                            outline={decklistMode !== "link"}
                                            onClick={() => setDecklistMode("link")}
                                        >
                                            {t("button.link-deck")}
                                        </Button>
                                        <Button
                                            color={"blue"}
                                            outline={decklistMode !== "paste"}
                                            onClick={() => setDecklistMode("paste")}
                                        >
                                            {t("button.paste-decklist")}
                                        </Button>
                                    </div>
                                    {decklistMode === "link" ? (
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
                                                value={decklistText}
                                                onChange={(event) => setDecklistText(event.target.value)}
                                            />
                                        </Field>
                                    )}
                                </div>
                            )}
                            <Button
                                color={"blue"}
                                loading={joining}
                                disabled={decklistRequired && !decklistProvided}
                                onClick={() => void (me.account === null ? joinAsGuest() : joinAsAccount())}
                            >
                                {me.account === null ? t("button.join-as-guest") : t("button.join")}
                            </Button>
                            {joinError !== undefined && <InlineError>{joinError}</InlineError>}
                            {me.account === null && (
                                <div className={"flex flex-wrap gap-2"}>
                                    <Button outline={true} href={"/auth/login"} search={{ redirect: `/join/${code}` }}>
                                        {t("button.join-login")}
                                    </Button>
                                    <Button outline={true} href={"/auth/signup"} search={{ redirect: `/join/${code}` }}>
                                        {t("button.join-signup")}
                                    </Button>
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
