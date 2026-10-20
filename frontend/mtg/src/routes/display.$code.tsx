import { createFileRoute, notFound } from "@tanstack/react-router";
import { QRCodeSVG } from "qrcode.react";
import { useTranslation } from "react-i18next";
import { formatName } from "src/utils/format-label";
import { Api } from "src/api/api";
import { DisplayNotFound } from "src/components/display-not-found";
import { displayJoinCode } from "src/components/tournament-join-code";
import { TournamentSlots } from "src/components/tournament-slots";
import i18n from "src/i18n";
import { isFormError } from "src/utils/error";
import { formatDateTime } from "src/utils/format";

export const Route = createFileRoute("/display/$code")({
    loader: async ({ params }) => {
        await i18n.loadNamespaces("tournament");
        // An unknown code is a typed refusal (HTTP 200), not a thrown error.
        const lookup = await Api.join.lookup(params.code);
        if (isFormError(lookup)) throw notFound();
        return lookup;
    },
    component: RouteComponent,
    notFoundComponent: DisplayNotFound,
});

/** The uppercase label of a fact row */
const FACT_LABEL = "w-28 shrink-0 text-xs font-semibold tracking-widest text-zinc-500 uppercase dark:text-zinc-400";

/** The value of a fact row */
const FACT_VALUE = "text-[clamp(1rem,1.8vw,1.5rem)] font-medium text-zinc-950 dark:text-white";

/**
 * The beamer screen: tournament facts, fill level and the join QR
 *
 * Keyed by join code so the projector needs no session; deliberately shows no player names.
 *
 * @returns the screen
 */
function RouteComponent() {
    const tournament = Route.useLoaderData();
    const [t] = useTranslation("tournament");
    const [tg] = useTranslation();

    const joinUrl = `${window.location.origin}/join/${tournament.join_code}`;

    return (
        <div className={"flex min-h-svh flex-col justify-center bg-(--surface-page) p-[4vmin]"}>
            <div
                className={
                    "mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-[5vmin] rounded-(--radius-card) bg-(--surface-card) p-[5vmin] shadow-(--shadow-card-md) ring-1 ring-zinc-950/5 dark:ring-white/10"
                }
            >
                <div className={"flex min-w-72 flex-1 flex-col gap-[3vmin]"}>
                    <h1
                        className={
                            "text-[clamp(2rem,5vw,4rem)] leading-[1.05] font-bold tracking-tight text-balance text-zinc-950 dark:text-white"
                        }
                    >
                        {tournament.name}
                    </h1>
                    <dl className={"flex flex-col gap-2"}>
                        {tournament.starts_at != null && (
                            <div className={"flex items-baseline gap-4"}>
                                <dt className={FACT_LABEL}>{t("label.starts-at")}</dt>
                                <dd className={FACT_VALUE}>{formatDateTime(tournament.starts_at)}</dd>
                            </div>
                        )}
                        <div className={"flex items-baseline gap-4"}>
                            <dt className={FACT_LABEL}>{t("label.format")}</dt>
                            <dd className={FACT_VALUE}>{formatName(tg, tournament.format)}</dd>
                        </div>
                    </dl>
                    <TournamentSlots
                        count={tournament.participant_count}
                        max={tournament.max_participants}
                        large={true}
                        className={"max-w-md"}
                    />
                </div>

                <div className={"flex flex-col items-center gap-[2vmin]"}>
                    {/* White plate: a QR on the dark theme's ground does not scan. */}
                    <div className={"rounded-xl bg-white p-3"}>
                        <QRCodeSVG value={joinUrl} size={220} className={"h-auto w-[min(32vmin,17rem)]"} />
                    </div>
                    <span
                        className={
                            "font-mono text-[clamp(1.75rem,4vw,3rem)] font-bold tracking-[0.14em] text-zinc-950 tabular-nums dark:text-white"
                        }
                    >
                        {displayJoinCode(tournament.join_code)}
                    </span>
                    <span className={"text-center text-sm text-zinc-500 dark:text-zinc-400"}>
                        {t("description.scan-to-join", { origin: window.location.host })}
                    </span>
                </div>
            </div>
        </div>
    );
}
