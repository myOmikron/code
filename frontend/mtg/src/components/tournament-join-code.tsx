import {
    ArrowPathIcon,
    EllipsisHorizontalIcon,
    LinkIcon,
    PresentationChartBarIcon,
    XCircleIcon,
} from "@heroicons/react/20/solid";
import type { BadgeProps } from "components";
import {
    Button,
    CopyButton,
    Dropdown,
    DropdownButton,
    DropdownItem,
    DropdownLabel,
    DropdownMenu,
    notify,
} from "components";
import { QRCodeSVG } from "qrcode.react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import type { TournamentStatus } from "src/api/generated";
import { TournamentSlots } from "src/components/tournament-slots";

/** How many characters of a join code sit before the display dash */
const CODE_SPLIT = 3;

/** The colour union {@link Badge} accepts, without the `undefined` a plain lookup would carry */
type BadgeColor = NonNullable<BadgeProps["color"]>;

/**
 * The badge colour for a tournament's lifecycle status
 *
 * @param status the tournament's status
 *
 * @returns the badge colour
 */
export function tournamentStatusColor(status: TournamentStatus): BadgeColor {
    switch (status) {
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
 * Splits a raw join code into its `XXX-XXX` display form
 *
 * @param code the raw, six character code
 *
 * @returns the code with a dash in the middle
 */
export function displayJoinCode(code: string): string {
    return `${code.slice(0, CODE_SPLIT)}-${code.slice(CODE_SPLIT)}`;
}

/** The uppercase label above each of the join bar's two values */
const JOIN_BAR_LABEL = "text-xs font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400";

/**
 * Puts the join link on the clipboard (a labelled button, unlike the icon-only `CopyButton`)
 *
 * @param url the link to copy
 * @param message what to say once it is on the clipboard
 */
async function copyJoinLink(url: string, message: string) {
    await navigator.clipboard.writeText(url);
    notify.success(message);
}

/**
 * The properties for {@link TournamentJoinBar}
 */
export type TournamentJoinBarProps = {
    /** The tournament the code belongs to */
    tournamentUuid: string;
    /** The raw code, `null`/`undefined` while nobody has one */
    joinCode: string | null | undefined;
    /** How many people are on the roster */
    participantCount: number;
    /** How many fit, `null` for an event that turns nobody away */
    maxParticipants: number | null | undefined;
    /** Whether the viewer may rotate or revoke the code */
    mayManage: boolean;
    /** Called after a rotate or revoke */
    onChanged: () => void | Promise<void>;
};

/**
 * The organizer's bar across a tournament: join code and QR, how full it is, and code actions
 *
 * @returns the bar
 */
export function TournamentJoinBar({
    tournamentUuid,
    joinCode,
    participantCount,
    maxParticipants,
    mayManage,
    onChanged,
}: TournamentJoinBarProps) {
    const [t] = useTranslation("tournament");

    // The browser's own origin is PUBLIC_ORIGIN: passkey login only works there.
    const joinUrl = joinCode != null ? `${window.location.origin}/join/${joinCode}` : null;

    /** Mints a fresh join code, replacing the one in place */
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
            className={
                "flex flex-wrap items-center gap-x-5 gap-y-4 rounded-(--radius-card) bg-(--surface-card) px-5 py-4 shadow-(--shadow-card-sm) ring-1 ring-zinc-950/5 dark:ring-white/10"
            }
        >
            <div className={"flex items-center gap-4"}>
                {/* White plate: a QR on the dark theme's ground does not scan. */}
                {joinUrl != null && (
                    <div className={"shrink-0 rounded-lg bg-white p-1.5 ring-1 ring-zinc-950/5"}>
                        <QRCodeSVG value={joinUrl} size={72} />
                    </div>
                )}
                <div className={"flex flex-col gap-1"}>
                    <span className={JOIN_BAR_LABEL}>{t("heading.join-code")}</span>
                    {joinCode != null ? (
                        <div className={"flex items-center gap-1.5"}>
                            <span
                                className={
                                    "font-mono text-2xl/8 font-semibold tracking-[0.16em] text-zinc-950 tabular-nums dark:text-white"
                                }
                            >
                                {displayJoinCode(joinCode)}
                            </span>
                            <CopyButton value={displayJoinCode(joinCode)} label={t("accessibility.copy-join-code")} />
                        </div>
                    ) : (
                        <span className={"text-2xl/8 font-medium text-zinc-500 dark:text-zinc-400"}>
                            {t("label.no-join-code")}
                        </span>
                    )}
                </div>
            </div>

            <div className={"hidden h-12 w-px self-center bg-zinc-950/10 sm:block dark:bg-white/10"} />

            <div className={"flex flex-col gap-1"}>
                <span className={JOIN_BAR_LABEL}>{t("heading.registered")}</span>
                <TournamentSlots count={participantCount} max={maxParticipants} variant={"inline"} />
            </div>

            <div className={"ms-auto flex flex-wrap items-center gap-2"}>
                {joinUrl != null && (
                    <Button outline={true} onClick={() => void copyJoinLink(joinUrl, t("toast.link-copied"))}>
                        <LinkIcon />
                        {t("button.copy-join-link")}
                    </Button>
                )}
                {joinCode != null && (
                    <Button outline={true} href={`/display/${joinCode}`} target={"_blank"}>
                        <PresentationChartBarIcon />
                        {t("button.show-display")}
                    </Button>
                )}
                {mayManage && (
                    <Dropdown>
                        <DropdownButton plain={true} aria-label={t("heading.join-code")}>
                            <EllipsisHorizontalIcon />
                        </DropdownButton>
                        <DropdownMenu anchor={"bottom end"}>
                            <DropdownItem onClick={() => void rotate()}>
                                <ArrowPathIcon />
                                <DropdownLabel>{t("button.rotate-code")}</DropdownLabel>
                            </DropdownItem>
                            {joinCode != null && (
                                <DropdownItem onClick={() => void revoke()}>
                                    <XCircleIcon />
                                    <DropdownLabel>{t("button.revoke-code")}</DropdownLabel>
                                </DropdownItem>
                            )}
                        </DropdownMenu>
                    </Dropdown>
                )}
            </div>
        </div>
    );
}
