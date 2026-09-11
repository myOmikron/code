import { createFileRoute, notFound } from "@tanstack/react-router";
import { EmptyState } from "components";
import { QRCodeSVG } from "qrcode.react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { displayJoinCode } from "src/components/tournament-join-code";
import { TournamentSlots } from "src/components/tournament-slots";
import i18n from "src/i18n";
import { isFormError } from "src/utils/error";
import { formatDateTime } from "src/utils/format";

export const Route = createFileRoute("/display/$code")({
    loader: async ({ params }) => {
        await i18n.loadNamespaces("tournament");
        // A retired or mistyped code comes back as the typed `unknown_code` refusal, HTTP 200 —
        // the same answer the join screen gets, and nothing to show on a wall.
        const lookup = await Api.join.lookup(params.code);
        if (isFormError(lookup)) throw notFound();
        return lookup;
    },
    component: RouteComponent,
    notFoundComponent: NotFound,
});

/**
 * The screen that goes on the beamer: where you are, and how you get in.
 *
 * Outside `_menu` on purpose — no sidebar, no navigation, nothing to click. It resolves through
 * the join code rather than the tournament's uuid, so the machine driving the projector needs no
 * login and no session: whoever can read the code off the screen could have typed it anyway. The
 * flip side is that revoking or rotating the code retires this address too, which is the right
 * behaviour for a screen whose whole content is that code.
 *
 * Deliberately nameless. Who has registered is the desk's business, and a roster on a wall is the
 * one place it would be readable by the whole room.
 *
 * @returns the screen
 */
function RouteComponent() {
    const tournament = Route.useLoaderData();
    const [t] = useTranslation("tournament");

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
                                <dt
                                    className={
                                        "w-28 shrink-0 text-xs font-semibold tracking-widest text-zinc-500 uppercase dark:text-zinc-400"
                                    }
                                >
                                    {t("label.starts-at")}
                                </dt>
                                <dd
                                    className={
                                        "text-[clamp(1rem,1.8vw,1.5rem)] font-medium text-zinc-950 dark:text-white"
                                    }
                                >
                                    {formatDateTime(tournament.starts_at)}
                                </dd>
                            </div>
                        )}
                        <div className={"flex items-baseline gap-4"}>
                            <dt
                                className={
                                    "w-28 shrink-0 text-xs font-semibold tracking-widest text-zinc-500 uppercase dark:text-zinc-400"
                                }
                            >
                                {t("label.format")}
                            </dt>
                            <dd className={"text-[clamp(1rem,1.8vw,1.5rem)] font-medium text-zinc-950 dark:text-white"}>
                                {tournament.format}
                            </dd>
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
                    {/* White backing plate: a QR rendered straight onto the dark theme's ground
                        does not scan, and this one is read from across a room. */}
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

/**
 * What a retired code shows: the same dead end a typed one gets, with nothing to act on.
 *
 * @returns the empty state
 */
function NotFound() {
    const [t] = useTranslation("tournament");

    return (
        <div className={"flex min-h-svh items-center justify-center bg-(--surface-page) p-8"}>
            <EmptyState title={t("error.unknown-code")} />
        </div>
    );
}
