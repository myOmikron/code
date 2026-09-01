import { ArrowPathIcon, XCircleIcon } from "@heroicons/react/20/solid";
import type { BadgeProps } from "components";
import { Button, CopyButton, Text, notify } from "components";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import type { ParticipantStatus, TournamentStatus } from "src/api/generated";

/** How many characters of a join code sit before the display dash */
const CODE_SPLIT = 3;

/** The colour union {@link Badge} accepts, without the `undefined` a plain lookup would carry */
type BadgeColor = NonNullable<BadgeProps["color"]>;

/**
 * The colour a tournament's lifecycle status reads best in
 *
 * Exported alongside the join-code card — every other tournament surface (the list, the layout
 * heading, the overview and settings tabs, the join lookup card) needs the same mapping, and this
 * is the smallest component file already reused by all of them; see `DeckTile`'s
 * `VISIBILITY_ICON`/`VISIBILITY_LABEL` for the same "bundle it with the nearest component" call.
 *
 * @param status the tournament's status
 *
 * @returns the badge colour
 */
export function tournamentStatusColor(status: TournamentStatus): BadgeColor {
    switch (status) {
        case "Draft":
            return "zinc";
        case "Registration":
            return "sky";
        case "Running":
            return "emerald";
        case "Finished":
            return "zinc";
        case "Cancelled":
            return "red";
    }
}

/**
 * The translation key naming a tournament's lifecycle status
 *
 * @param status the tournament's status
 *
 * @returns the `tournament` namespace key
 */
export function tournamentStatusLabelKey(status: TournamentStatus): string {
    switch (status) {
        case "Draft":
            return "label.status-draft";
        case "Registration":
            return "label.status-registration";
        case "Running":
            return "label.status-running";
        case "Finished":
            return "label.status-finished";
        case "Cancelled":
            return "label.status-cancelled";
    }
}

/**
 * The colour a participant's status reads best in
 *
 * Fixed by the plan, not a design choice made here: zinc Registered, sky CheckedIn, amber
 * Dropped, red Disqualified.
 *
 * @param status the participant's status
 *
 * @returns the badge colour
 */
export function participantStatusColor(status: ParticipantStatus): BadgeColor {
    switch (status) {
        case "Registered":
            return "zinc";
        case "CheckedIn":
            return "sky";
        case "Dropped":
            return "amber";
        case "Disqualified":
            return "red";
    }
}

/**
 * The translation key naming a participant's status
 *
 * @param status the participant's status
 *
 * @returns the `tournament` namespace key
 */
export function participantStatusLabelKey(status: ParticipantStatus): string {
    switch (status) {
        case "Registered":
            return "label.player-registered";
        case "CheckedIn":
            return "label.player-checked-in";
        case "Dropped":
            return "label.player-dropped";
        case "Disqualified":
            return "label.player-disqualified";
    }
}

/**
 * Splits a raw join code into its `XXX-XXX` display form
 *
 * @param code the raw, six character code
 *
 * @returns the code with a dash in the middle
 */
function displayJoinCode(code: string): string {
    return `${code.slice(0, CODE_SPLIT)}-${code.slice(CODE_SPLIT)}`;
}

/**
 * The properties for {@link TournamentJoinCode}
 */
export type TournamentJoinCodeProps = {
    /** The tournament the code belongs to */
    tournamentUuid: string;
    /** The raw code, `null`/`undefined` while nobody has minted one */
    joinCode: string | null | undefined;
    /** Whether the viewer may rotate or revoke it — a scorekeeper may see it, not touch it */
    mayManage: boolean;
    /** Called after a rotate or revoke went through, so the caller can reload the tournament */
    onChanged: () => void | Promise<void>;
};

/**
 * The organizer-only card showing a tournament's join code, and the actions to mint a fresh one
 * or withdraw it.
 *
 * @returns the card
 */
export function TournamentJoinCode({ tournamentUuid, joinCode, mayManage, onChanged }: TournamentJoinCodeProps) {
    const [t] = useTranslation("tournament");

    /** Mints a fresh join code, replacing any code already in place */
    async function rotate() {
        await Api.tournaments.rotateJoinCode(tournamentUuid);
        notify.success(t("toast.code-rotated"));
        await onChanged();
    }

    /** Withdraws the current join code, so it stops resolving */
    async function revoke() {
        await Api.tournaments.revokeJoinCode(tournamentUuid);
        notify.success(t("toast.code-revoked"));
        await onChanged();
    }

    return (
        <div
            className={"flex flex-col gap-3 rounded-(--radius-card) border border-zinc-950/10 p-4 dark:border-white/10"}
        >
            <Text className={"text-sm font-semibold text-zinc-950 dark:text-white"}>{t("heading.join-code")}</Text>
            {joinCode != null ? (
                <div className={"flex items-center gap-2"}>
                    <span
                        className={
                            "rounded-(--radius-control) bg-zinc-950/5 px-3 py-1.5 font-mono text-lg tracking-[0.2em] text-zinc-950 dark:bg-white/10 dark:text-white"
                        }
                    >
                        {displayJoinCode(joinCode)}
                    </span>
                    <CopyButton value={displayJoinCode(joinCode)} label={t("accessibility.copy-join-code")} />
                </div>
            ) : (
                <Text className={"text-sm"}>{t("label.no-join-code")}</Text>
            )}
            {mayManage && (
                <div className={"flex flex-wrap gap-2"}>
                    <Button outline={true} onClick={() => void rotate()}>
                        <ArrowPathIcon />
                        {t("button.rotate-code")}
                    </Button>
                    {joinCode != null && (
                        <Button outline={true} onClick={() => void revoke()}>
                            <XCircleIcon />
                            {t("button.revoke-code")}
                        </Button>
                    )}
                </div>
            )}
        </div>
    );
}
