import { UserPlusIcon } from "@heroicons/react/20/solid";
import { Button, PrimaryButton } from "components";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useAccount } from "src/context/account";
import { listTournamentGuests } from "src/utils/tournament-guest";

/**
 * The properties for {@link TournamentGuestUpgradeBanner}
 */
export type TournamentGuestUpgradeBannerProps = {
    /** The tournament being viewed */
    tournamentUuid: string;
    /** The viewer's own participant row in it, if they have one */
    participantUuid: string | null | undefined;
};

/**
 * Offers a guest to turn their seat into an account, via the claim page their stored token opens.
 *
 * Shows only on the device that still holds the claim token; any other guest has to ask the desk
 * for the claim QR.
 *
 * @returns the banner, or nothing for anyone who is not a guest with a token here
 */
export function TournamentGuestUpgradeBanner({ tournamentUuid, participantUuid }: TournamentGuestUpgradeBannerProps) {
    const [t] = useTranslation("tournament");
    const me = useAccount();

    const claimToken = useMemo(
        () =>
            listTournamentGuests().find(
                (entry) => entry.tournamentUuid === tournamentUuid && entry.participantUuid === participantUuid,
            )?.claimToken,
        [tournamentUuid, participantUuid],
    );

    if (me.loading || me.account !== null || claimToken === undefined) return null;

    const search = { redirect: `/join/claim/${claimToken}` };

    return (
        <div
            className={
                "flex flex-col gap-3 rounded-(--radius-card) bg-(--surface-card) p-4 shadow-(--shadow-card-sm) ring-1 ring-zinc-950/5 sm:flex-row sm:items-center dark:ring-white/10"
            }
        >
            <UserPlusIcon className={"size-5 shrink-0 text-zinc-400 dark:text-zinc-500"} aria-hidden={"true"} />
            <div className={"min-w-0 flex-1"}>
                <p className={"text-sm font-medium text-zinc-950 dark:text-white"}>{t("heading.guest-upgrade")}</p>
                <p className={"text-xs text-zinc-600 dark:text-zinc-400"}>{t("description.guest-upgrade")}</p>
            </div>
            <div className={"flex shrink-0 items-center gap-2"}>
                <Button plain href={"/auth/login"} search={search}>
                    {t("button.guest-upgrade-login")}
                </Button>
                <PrimaryButton href={"/auth/signup"} search={search}>
                    {t("button.guest-upgrade-signup")}
                </PrimaryButton>
            </div>
        </div>
    );
}
