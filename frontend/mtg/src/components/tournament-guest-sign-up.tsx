import { UserPlusIcon } from "@heroicons/react/20/solid";
import { Button, Description, ErrorMessage, Field, Input, Label, Subheading, notify } from "components";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type {
    GuestSignUpRequest,
    SignUpAsSharedTournamentGuest200Response,
    TournamentResponse,
} from "src/api/generated";
import { PrimaryButton } from "src/components/primary-button";
import { isFormError } from "src/utils/error";
import { guestSignUpErrorKey, keepGuestSeat, storedGuestSeat } from "src/utils/tournament-guest";

/**
 * The properties for {@link TournamentGuestSignUp}
 */
export type TournamentGuestSignUpProps = {
    /** The Tournament to sign up for */
    tournament: TournamentResponse;
    /** Signs the visitor up as a Guest, by id or by share link; `null` where the request was refused */
    signUp: (request: GuestSignUpRequest) => Promise<SignUpAsSharedTournamentGuest200Response | null>;
    /** Called once the visitor plays as the Guest */
    onSignedUp: () => void;
};

/**
 * A visitor without an Account signing itself up as a Guest by name, or logging in to sign up with its Account.
 *
 * Keeps the Recovery code on this device, so the Guest seat survives the session.
 *
 * @returns the sign-up form
 */
export function TournamentGuestSignUp({ tournament, signUp, onSignedUp }: TournamentGuestSignUpProps) {
    const [t] = useTranslation("tournament");
    const [name, setName] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    /**
     * Signs up under the name in the field
     */
    async function join() {
        if (name.trim() === "") return;
        setBusy(true);
        try {
            const kept = storedGuestSeat(tournament.uuid);
            const result = await signUp({
                name,
                recovery: kept === null ? null : { participant: kept.participant, code: kept.recoveryCode },
            });
            if (result === null || isFormError(result)) {
                setError(t(guestSignUpErrorKey(result === null ? null : result.error)));
                return;
            }
            keepGuestSeat({
                tournament: tournament.uuid,
                participant: result.participant.uuid,
                recoveryCode: result.recovery_code,
            });
            notify.success(t("toast.signed-up"));
            onSignedUp();
        } finally {
            setBusy(false);
        }
    }

    return (
        <section className={"flex flex-col gap-4"}>
            <Subheading>{t("heading.guest-sign-up")}</Subheading>
            <Field>
                <Label>{t("label.your-name")}</Label>
                <form
                    className={"flex flex-wrap items-start gap-2"}
                    onSubmit={(event) => {
                        event.preventDefault();
                        void join();
                    }}
                >
                    <Input
                        className={"min-w-0 flex-1"}
                        maxLength={64}
                        autoComplete={"nickname"}
                        value={name}
                        invalid={error !== null}
                        aria-label={t("label.your-name")}
                        onChange={(event) => {
                            setName(event.target.value);
                            setError(null);
                        }}
                    />
                    <PrimaryButton type={"submit"} disabled={busy || name.trim() === ""} className={"shrink-0"}>
                        <UserPlusIcon />
                        {t("button.sign-up-as-guest")}
                    </PrimaryButton>
                </form>
                {error !== null ? (
                    <ErrorMessage>{error}</ErrorMessage>
                ) : (
                    <Description>{t("description.guest-sign-up")}</Description>
                )}
            </Field>
            <div>
                <Button plain href={"/auth/login"} search={{ redirect: window.location.pathname }}>
                    {t("button.sign-up-with-account")}
                </Button>
            </div>
        </section>
    );
}
