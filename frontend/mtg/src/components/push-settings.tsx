import { Description, HorizontalField, HorizontalFieldDivider, Label, Subheading, Switch, notify } from "components";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { useLoaded } from "src/utils/use-loaded";
import { deviceSubscribed, pushSupported, subscribeDevice, unsubscribeDevice } from "src/utils/web-push";
import { pushLanguage } from "src/utils/web-push-data";

/**
 * Notifications: whether this device gets pushes, and whether the account wants tournament pushes at all.
 *
 * The device switch subscribes this browser only; the tournament switch holds for every device of the account.
 *
 * @returns the settings section
 */
export function PushSettings() {
    const [t, i18n] = useTranslation("profile");
    const settings = useLoaded(() => Api.accounts.push.settings(), []);
    const device = useLoaded(() => deviceSubscribed(), []);
    const [busy, setBusy] = useState(false);

    const available = pushSupported() && settings.data?.public_key != null;

    /**
     * Subscribes or unsubscribes this device
     *
     * @param wanted what the switch was moved to
     */
    async function changeDevice(wanted: boolean) {
        const publicKey = settings.data?.public_key;
        if (publicKey == null) return;
        setBusy(true);
        try {
            if (wanted) {
                const outcome = await subscribeDevice(publicKey, pushLanguage(i18n.resolvedLanguage));
                if (outcome === "denied") notify.error(t("toast.push-denied"));
                if (outcome === "failed") notify.error(t("toast.push-failed"));
            } else {
                await unsubscribeDevice();
            }
        } catch {
            notify.error(t("toast.push-failed"));
        } finally {
            setBusy(false);
            device.reload();
        }
    }

    /**
     * Turns tournament pushes on or off for the account
     *
     * @param wanted what the switch was moved to
     */
    async function changeTournamentPushes(wanted: boolean) {
        await Api.accounts.push.setTournamentPushes(wanted);
        settings.reload();
    }

    return (
        <div className={"flex flex-col gap-8"}>
            <Subheading>{t("heading.notifications")}</Subheading>
            <HorizontalField>
                <Label>{t("label.push-device")}</Label>
                <Description>
                    {available ? t("description.push-device") : t("description.push-unavailable")}
                </Description>
                <HorizontalFieldDivider />
                <Switch
                    color={"lime"}
                    checked={device.data ?? false}
                    disabled={!available || busy || device.data === null}
                    onChange={(wanted) => void changeDevice(wanted)}
                />
            </HorizontalField>

            <HorizontalField>
                <Label>{t("label.tournament-pushes")}</Label>
                <Description>{t("description.tournament-pushes")}</Description>
                <HorizontalFieldDivider />
                <Switch
                    color={"lime"}
                    checked={settings.data?.tournament_pushes ?? false}
                    disabled={settings.data === null}
                    onChange={(wanted) => void changeTournamentPushes(wanted)}
                />
            </HorizontalField>
        </div>
    );
}
