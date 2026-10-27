import { Button, Description, Subheading, Text } from "components";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import type { PushSettingsResponse } from "src/api/generated";
import { activateTournamentPushes, deviceSubscribed, pushSupported } from "src/utils/web-push";
import { pushLanguage } from "src/utils/web-push-data";

/** The Participant-visible state of notification activation. */
type ActivationState = "loading" | "offer" | "enabled" | "denied" | "unavailable" | "failed";

/**
 * Optional Tournament push activation for a Participant on this device.
 *
 * @returns the current activation state and an explicit permission action
 */
export function TournamentPushActivation() {
    const [t, i18n] = useTranslation("tournament");
    const [state, setState] = useState<ActivationState>("loading");
    const [settings, setSettings] = useState<PushSettingsResponse | null>(null);
    const [subscribed, setSubscribed] = useState(false);
    const [busy, setBusy] = useState(false);
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        let current = true;
        if (!pushSupported()) {
            setState("unavailable");
            return;
        }
        if (Notification.permission === "denied") {
            setState("denied");
            return;
        }
        setState("loading");
        Promise.all([Api.accounts.push.settings(), deviceSubscribed()])
            .then(([loaded, device]) => {
                if (!current) return;
                setSettings(loaded);
                setSubscribed(device);
                setState(
                    loaded.public_key == null
                        ? "unavailable"
                        : device && loaded.tournament_pushes
                          ? "enabled"
                          : "offer",
                );
            })
            .catch(() => {
                if (current) setState("failed");
            });
        return () => {
            current = false;
        };
    }, [attempt]);

    /** Enables this device and the Account preference from the activation tap. */
    async function activate() {
        if (settings?.public_key == null || busy) return;
        setBusy(true);
        try {
            const outcome = await activateTournamentPushes(
                settings.public_key,
                pushLanguage(i18n.resolvedLanguage),
                subscribed,
            );
            setState(outcome === "subscribed" ? "enabled" : outcome === "denied" ? "denied" : "failed");
            if (outcome === "subscribed") setSubscribed(true);
        } catch {
            setState("failed");
        } finally {
            setBusy(false);
        }
    }

    return (
        <section
            className={"flex flex-col items-start gap-3 rounded-lg border border-zinc-950/10 p-4 dark:border-white/10"}
        >
            <Subheading>{t("heading.tournament-push-activation")}</Subheading>
            <Description>{t("description.tournament-push-activation")}</Description>
            <div role={"status"} aria-live={"polite"}>
                {state === "loading" && <Text>{t("label.tournament-push-loading")}</Text>}
                {state === "enabled" && <Text>{t("description.tournament-push-enabled")}</Text>}
                {state === "unavailable" && <Text>{t("description.tournament-push-unavailable")}</Text>}
                {state === "denied" && <Text>{t("description.tournament-push-denied")}</Text>}
                {state === "failed" && <Text>{t("error.tournament-push-activation")}</Text>}
            </div>
            {(state === "offer" || (state === "failed" && settings !== null)) && (
                <>
                    {settings?.tournament_pushes === false && (
                        <Description>{t("description.tournament-push-global-disabled")}</Description>
                    )}
                    <Button outline disabled={busy} onClick={() => void activate()}>
                        {t("button.enable-tournament-pushes")}
                    </Button>
                </>
            )}
            {state === "failed" && settings === null && (
                <Button outline onClick={() => setAttempt((held) => held + 1)}>
                    {t("button.retry-tournament-push-status")}
                </Button>
            )}
        </section>
    );
}
