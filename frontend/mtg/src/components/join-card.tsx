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
import { formatName } from "src/utils/format-label";
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
 * Maps {@link JoinErrors} onto the card's inline message
 *
 * @param t the `tournament` namespace translator
 *
 * @returns the handler map {@link handleFormError} wants
 */
function joinErrorHandlers(t: (key: string) => string): {
    [Key in keyof JoinErrors]: (errors: ValidationErrors) => void;
} {
    return {
        unknown_code: (errors) => {
            errors.form = t("error.unknown-code");
        },
        tournament_full: (errors) => {
            errors.form = t("error.tournament-full");
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
        deck_too_long: (errors) => {
            errors.form = t("error.deck-too-long");
        },
        invalid_decklist: (errors) => {
            errors.form = t("error.invalid-decklist");
        },
    };
}

/**
 * The decklist reminder for a joining player, `null` when the policy asks for nothing
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
 * A resolved join code: the tournament preview, and the join form unless the viewer is already in
 *
 * @returns the card
 */
export function JoinCard({ code, lookup, onJoined }: JoinCardProps) {
    const [t] = useTranslation("tournament");
    const [tg] = useTranslation();
    const me = useAccount();

    const [displayName, setDisplayName] = useState("");
    const [joinError, setJoinError] = useState<string | undefined>();
    const [joining, setJoining] = useState(false);

    // Only accounts can link a deck; guests always paste.
    const [decklistMode, setDecklistMode] = useState<"link" | "paste">("link");
    const [decks, setDecks] = useState<Array<DeckOverviewResponse>>([]);
    const [deckUuid, setDeckUuid] = useState("");
    const [showAllFormats, setShowAllFormats] = useState(false);
    const [decklistText, setDecklistText] = useState("");

    // Starts `true` so the form does not flash before the membership check answers.
    const [checkingMembership, setCheckingMembership] = useState(true);
    const [alreadyIn, setAlreadyIn] = useState(false);

    useEffect(() => {
        setDisplayName(me.account?.username ?? "");
    }, [me.account]);

    // Account-only: for a guest, the 401 would go through `handleError` into a login redirect.
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
                // Reported by `handleError`; the picker stays empty.
            },
        );
        return () => {
            cancelled = true;
        };
    }, [me.account]);

    // The lookup carries no viewer, so membership is checked against the tournament itself.
    useEffect(() => {
        let cancelled = false;
        setCheckingMembership(true);
        setAlreadyIn(false);
        void (async () => {
            try {
                const response = await Api.tournaments.get(lookup.tournament);
                if (!cancelled) setAlreadyIn(response.viewer.participant != null);
            } catch {
                // A 401 (stranger) or 400 (private event) just means "not a member yet".
            } finally {
                if (!cancelled) setCheckingMembership(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [lookup.tournament]);

    const filteredDecks = showAllFormats ? decks : decks.filter((overview) => overview.deck.format === lookup.format);

    const linksDeck = me.account !== null && decklistMode === "link";
    const decklistProvided = linksDeck ? deckUuid !== "" : decklistText.trim() !== "";
    const decklistRequired = lookup.decklist_policy === DecklistPolicy.RequiredToRegister;
    const decklistHint = decklistPolicyHint(lookup.decklist_policy, t);

    /**
     * Shows a join refusal; `already_registered` means a row appeared since the membership check
     *
     * @param error the refusal
     */
    function handleRefusal(error: JoinErrors) {
        if (error.already_registered) {
            onJoined(lookup.tournament);
            return;
        }
        setJoinError(handleFormError(error, joinErrorHandlers(t)).form);
    }

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
                handleRefusal(response.error);
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
                handleRefusal(response.error);
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
                <Badge color={"zinc"}>{formatName(tg, lookup.format)}</Badge>
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
                <Text>{t("label.loading")}</Text>
            ) : alreadyIn ? (
                <div className={"flex flex-col gap-3"}>
                    <Text className={"text-base font-semibold text-zinc-950 dark:text-white"}>
                        {t("heading.already-joined")}
                    </Text>
                    <Text>{t("description.already-joined")}</Text>
                    <Button
                        color={"blue"}
                        href={"/tournaments/$tournamentUuid"}
                        params={{ tournamentUuid: lookup.tournament }}
                    >
                        {t("button.open-tournament")}
                    </Button>
                </div>
            ) : !lookup.registration_open ? (
                <InlineError>{t("error.registration-closed")}</InlineError>
            ) : (
                <div className={"flex flex-col gap-3"}>
                    {decklistHint !== null && (
                        // Not `Description`: Headless UI's throws outside a `Field` or `Dialog`.
                        <Text>{decklistHint}</Text>
                    )}
                    {me.loading ? (
                        // Do not flash the guest form while the session is still resolving.
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
