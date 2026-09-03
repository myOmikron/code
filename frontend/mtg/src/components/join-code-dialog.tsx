import {
    Badge,
    Button,
    Checkbox,
    CheckboxField,
    Description,
    Dialog,
    DialogActions,
    DialogBody,
    DialogTitle,
    ErrorMessage,
    Field,
    Form,
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
import { useAccount } from "src/context/account";
import type { ValidationErrors } from "src/utils/error";
import { handleFormError, isFormError } from "src/utils/error";
import { formatDateTime } from "src/utils/format";
import { addTournamentGuest } from "src/utils/tournament-guest";

/**
 * The properties for {@link JoinCodeDialog}
 */
export type JoinCodeDialogProps = {
    /** Whether the dialog is on screen */
    open: boolean;
    /** Called when the dialog should close */
    onClose: () => void;
    /** Called once the code resolved and the join went through, with the tournament joined */
    onJoined: (tournamentUuid: string) => void;
};

/**
 * Every field {@link JoinErrors} can carry, mapped onto the one inline message the dialog shows.
 *
 * The lookup and both join calls share this exact error shape, so one map serves all three —
 * `handleFormError` requires every field to have a handler regardless of which call actually set
 * it, since a shared backend type carries fields no single endpoint can trigger.
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
 * Typed code entry, from a blank field to a joined roster row.
 *
 * Two phases in one dialog: typing a code resolves it into a small preview card (what the event
 * is, whether it is even taking new players right now), and only once that card is on screen does
 * the actual join button appear — a logged-in account joins under its own name, a visitor types
 * one and becomes a guest.
 *
 * @returns the dialog
 */
export function JoinCodeDialog({ open, onClose, onJoined }: JoinCodeDialogProps) {
    const [t] = useTranslation("tournament");
    const [tg] = useTranslation();
    const me = useAccount();

    const [code, setCode] = useState("");
    const [lookup, setLookup] = useState<JoinLookupResponse | null>(null);
    const [lookupError, setLookupError] = useState<string | undefined>();
    const [lookingUp, setLookingUp] = useState(false);

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

    // The dialog stays mounted; every field starts fresh each time it opens.
    useEffect(() => {
        if (!open) return;
        setCode("");
        setLookup(null);
        setLookupError(undefined);
        setDisplayName(me.account?.username ?? "");
        setJoinError(undefined);
        setDecklistMode("link");
        setDeckUuid("");
        setShowAllFormats(false);
        setDecklistText("");
    }, [open, me.account]);

    // Only once there is an account to ask for — TRAP 2: `Api.decks.list()` 401s for a guest,
    // and that 401 would run through `handleError` into a login redirect a guest cannot
    // complete. A visitor never sees this request at all.
    useEffect(() => {
        if (!open || me.account === null) {
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
    }, [open, me.account]);

    // Format-matched by default — a Legacy deck offered for a Modern event is a mistake far more
    // often than it is deliberate, but nothing stops the account from picking one anyway.
    const filteredDecks =
        showAllFormats || lookup === null ? decks : decks.filter((overview) => overview.deck.format === lookup.format);

    const decklistProvided =
        me.account === null
            ? decklistText.trim() !== ""
            : decklistMode === "link"
              ? deckUuid !== ""
              : decklistText.trim() !== "";
    const decklistRequired = lookup !== null && lookup.decklist_policy === DecklistPolicy.RequiredToRegister;

    /** Resolves the typed code into the preview card */
    async function doLookup() {
        setLookingUp(true);
        setLookupError(undefined);
        try {
            const response = await Api.join.lookup(code.trim());
            if (isFormError(response)) {
                setLookupError(handleFormError(response.error, joinErrorHandlers(t)).form);
                return;
            }
            setLookup(response);
        } catch (error) {
            console.error(error);
            setLookupError(t("error.join-failed"));
        } finally {
            setLookingUp(false);
        }
    }

    /** Joins under the signed-in account */
    async function joinAsAccount() {
        setJoining(true);
        setJoinError(undefined);
        try {
            const response = await Api.join.asAccount(
                code.trim(),
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
                code.trim(),
                displayName.trim(),
                decklistText.trim() === "" ? undefined : decklistText.trim(),
            );
            if (isFormError(response)) {
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
        <Dialog open={open} onClose={onClose}>
            <DialogTitle>{t("heading.join-by-code")}</DialogTitle>
            <DialogBody>
                <div className={"flex flex-col gap-4"}>
                    <Form onSubmit={() => void doLookup()}>
                        <Field>
                            <RequiredLabel>{t("label.code")}</RequiredLabel>
                            <Description>{t("description.join-by-code")}</Description>
                            <div className={"mt-2 flex gap-2"}>
                                <Input
                                    autoFocus={true}
                                    required={true}
                                    maxLength={8}
                                    invalid={lookupError !== undefined}
                                    value={code}
                                    onChange={(event) => {
                                        setCode(event.target.value);
                                        setLookup(null);
                                        setLookupError(undefined);
                                    }}
                                    className={"font-mono tracking-widest uppercase"}
                                />
                                <Button type={"submit"} loading={lookingUp} disabled={code.trim() === ""}>
                                    {t("button.join")}
                                </Button>
                            </div>
                            {lookupError !== undefined && <ErrorMessage>{lookupError}</ErrorMessage>}
                        </Field>
                    </Form>

                    {lookup !== null && (
                        <div
                            className={
                                "flex flex-col gap-3 rounded-(--radius-card) border border-zinc-950/10 p-4 dark:border-white/10"
                            }
                        >
                            <Text className={"text-base font-semibold text-zinc-950 dark:text-white"}>
                                {lookup.name}
                            </Text>
                            <div className={"flex flex-wrap items-center gap-2"}>
                                <Badge color={tournamentStatusColor(lookup.status)}>
                                    {t(tournamentStatusLabelKey(lookup.status))}
                                </Badge>
                                <Badge color={"zinc"}>{lookup.format}</Badge>
                                <Badge color={"zinc"}>{t("label.players", { count: lookup.participant_count })}</Badge>
                            </div>
                            {lookup.venue != null && lookup.venue !== "" && <Text>{lookup.venue}</Text>}
                            {lookup.starts_at != null && <Text>{formatDateTime(lookup.starts_at)}</Text>}

                            {!lookup.registration_open ? (
                                <InlineError>{t("error.registration-closed")}</InlineError>
                            ) : (
                                <div className={"flex flex-col gap-3"}>
                                    {decklistPolicyHint(lookup.decklist_policy, t) !== null && (
                                        <Description>{decklistPolicyHint(lookup.decklist_policy, t)}</Description>
                                    )}
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
                                                            <ListboxOption
                                                                key={overview.deck.uuid}
                                                                value={overview.deck.uuid}
                                                            >
                                                                <ListboxLabel>{overview.deck.name}</ListboxLabel>
                                                            </ListboxOption>
                                                        ))}
                                                    </Listbox>
                                                    <CheckboxField>
                                                        <Checkbox
                                                            checked={showAllFormats}
                                                            onChange={setShowAllFormats}
                                                        />
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
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </DialogBody>
            <DialogActions>
                <Button plain onClick={onClose}>
                    {tg("button.cancel")}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
