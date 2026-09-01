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
    Form,
    Input,
    RequiredLabel,
    Text,
    notify,
} from "components";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import type { JoinErrors, JoinLookupResponse } from "src/api/generated";
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
    };
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

    // The dialog stays mounted; every field starts fresh each time it opens.
    useEffect(() => {
        if (!open) return;
        setCode("");
        setLookup(null);
        setLookupError(undefined);
        setDisplayName(me.account?.username ?? "");
        setJoinError(undefined);
    }, [open, me.account]);

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
            const response = await Api.join.asGuest(code.trim(), displayName.trim());
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
                                    {me.account === null && (
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
                                    )}
                                    <Button
                                        color={"blue"}
                                        loading={joining}
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
