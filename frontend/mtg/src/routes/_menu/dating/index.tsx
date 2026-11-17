import { ArrowUturnLeftIcon, ChatBubbleLeftRightIcon, UserCircleIcon } from "@heroicons/react/20/solid";
import { HeartIcon, StarIcon, XMarkIcon } from "@heroicons/react/24/solid";
import { createFileRoute } from "@tanstack/react-router";
import clsx from "clsx";
import { Button, EmptyState, Heading, Text, notify } from "components";
import { AnimatePresence } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { DateStatus, SwipeKind } from "src/api/generated";
import type { DatingCardResponse } from "src/api/generated";
import { DatingBioDialog } from "src/components/dating-bio-dialog";
import { DatingCard } from "src/components/dating-card";
import { DatingColorFilter } from "src/components/dating-color-filter";
import { DatingVerdict } from "src/components/dating-verdict";
import type { Verdict } from "src/components/dating-verdict";
import { PrimaryButton } from "src/components/primary-button";
import { RequireAccount } from "src/components/require-account";
import i18n from "src/i18n";
import { REFILL_AT, colorFilter } from "src/utils/dating";
import type { Color, SwipeDirection } from "src/utils/dating";
import { useShortcuts } from "src/utils/use-shortcuts";
import { useStartDeck } from "src/utils/use-start-deck";

export const Route = createFileRoute("/_menu/dating/")({
    loader: async () => {
        await i18n.loadNamespaces(["dating"]);
    },
    component: RouteComponent,
});

/** A round action button under the stack */
const ROUND =
    "flex items-center justify-center rounded-full ring-1 shadow-(--shadow-card-sm) transition-transform active:scale-95 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-500";

/** A quiet round button */
const QUIET = "bg-white ring-zinc-950/10 dark:bg-zinc-900 dark:ring-white/10";

/**
 * Command Zone Dating: swipe through Commanders, and they swipe back.
 *
 * @returns the page
 */
function RouteComponent() {
    const [t] = useTranslation("dating");
    const startDeck = useStartDeck();
    const [stack, setStack] = useState<DatingCardResponse[]>([]);
    const [loading, setLoading] = useState(true);
    const [exhausted, setExhausted] = useState(false);
    const [supers, setSupers] = useState(1);
    const [profileNeeded, setProfileNeeded] = useState(false);
    const [colors, setColors] = useState<Set<Color>>(new Set());
    const [exit, setExit] = useState<SwipeDirection | null>(null);
    const [last, setLast] = useState<{ card: DatingCardResponse; kind: SwipeKind } | null>(null);
    const [bio, setBio] = useState<DatingCardResponse | null>(null);
    const [date, setDate] = useState<{ card: DatingCardResponse; verdict: Verdict } | null>(null);
    const [busy, setBusy] = useState(false);
    const refilling = useRef(false);
    const filter = colorFilter(colors);

    const load = useCallback(
        async (pending: DatingCardResponse[]) => {
            const response = await Api.dating.stack({
                colors: filter,
                pending: pending.map((card) => card.commander),
            });
            setProfileNeeded(response.profile_needed);
            setSupers(response.super_likes_left);
            return response.commanders;
        },
        [filter],
    );

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setExhausted(false);
        load([]).then((cards) => {
            if (cancelled) return;
            setStack(cards);
            setExhausted(cards.length === 0);
            setLoading(false);
        });
        return () => {
            cancelled = true;
        };
    }, [load]);

    useEffect(() => {
        if (loading || exhausted || refilling.current || stack.length > REFILL_AT) return;
        refilling.current = true;
        load(stack)
            .then((cards) => {
                setExhausted(cards.length === 0);
                setStack((current) => [
                    ...current,
                    ...cards.filter((card) => !current.some((held) => held.commander === card.commander)),
                ]);
            })
            .finally(() => {
                refilling.current = false;
            });
    }, [stack, loading, exhausted, load]);

    const swipe = async (direction: SwipeDirection) => {
        const top = stack[0];
        if (top === undefined || date !== null || busy) return;
        if (direction === "up" && supers <= 0) {
            notify.info(t("description.super-gone"));
            return;
        }
        const kind =
            direction === "left" ? SwipeKind.Pass : direction === "right" ? SwipeKind.Like : SwipeKind.SuperLike;

        setExit(direction);
        setStack((current) => current.slice(1));
        setLast({ card: top, kind });

        const response = await Api.dating.swipe({ commander: top.commander, kind });
        setSupers(response.super_likes_left);
        if (kind === SwipeKind.Pass) return;
        setDate({
            card: top,
            verdict:
                response.status === DateStatus.Matched
                    ? {
                          kind: "match",
                          how: kind === SwipeKind.SuperLike ? "super" : "like",
                          shared: response.shared ?? null,
                      }
                    : { kind: "reject", reason: response.reason ?? null },
        });
    };

    const rewind = async () => {
        if (last === null || busy) return;
        setBusy(true);
        try {
            await Api.dating.rewind();
            setExit(null);
            setDate(null);
            setStack((current) => [last.card, ...current.filter((card) => card.commander !== last.card.commander)]);
            if (last.kind === SwipeKind.SuperLike) setSupers((count) => count + 1);
            setLast(null);
        } finally {
            setBusy(false);
        }
    };

    const toggleColor = (color: Color) =>
        setColors((current) => {
            const next = new Set(current);
            if (next.has(color)) next.delete(color);
            else next.add(color);
            return next;
        });

    useShortcuts(
        {
            arrowleft: () => swipe("left"),
            arrowright: () => swipe("right"),
            arrowup: () => swipe("up"),
            backspace: () => rewind(),
        },
        date === null && bio === null && !profileNeeded,
    );

    const top = stack[0];

    return (
        <RequireAccount>
            <div
                className={
                    "mx-auto flex h-[calc(100dvh-5rem)] min-h-[34rem] w-full max-w-md flex-col gap-2 px-4 pt-2 pb-4"
                }
            >
                <header className={"flex items-center justify-between gap-2"}>
                    <Heading>{t("heading.title")}</Heading>
                    <div className={"flex items-center"}>
                        <Button plain={true} href={"/dating/profile"} aria-label={t("button.profile")}>
                            <UserCircleIcon />
                        </Button>
                        <Button plain={true} href={"/dating/matches"} aria-label={t("button.matches")}>
                            <ChatBubbleLeftRightIcon />
                        </Button>
                    </div>
                </header>

                {!profileNeeded && <DatingColorFilter selected={colors} onToggle={toggleColor} />}

                <div className={"relative isolate min-h-0 flex-1"}>
                    {loading ? (
                        <Text className={"pt-10 text-center"}>{t("description.loading")}</Text>
                    ) : profileNeeded ? (
                        <EmptyState
                            title={t("heading.profile")}
                            description={t("description.no-profile")}
                            action={
                                <PrimaryButton href={"/dating/profile"}>{t("button.answer-questions")}</PrimaryButton>
                            }
                        />
                    ) : top === undefined ? (
                        <EmptyState
                            title={t("heading.title")}
                            description={t("description.empty")}
                            action={
                                <PrimaryButton
                                    onClick={async () => {
                                        await Api.dating.resetPasses();
                                        notify.success(t("toast.passes-reset"));
                                        setColors(new Set());
                                        setStack(await load([]));
                                        setExhausted(false);
                                    }}
                                >
                                    {t("button.reset-passes")}
                                </PrimaryButton>
                            }
                        />
                    ) : (
                        <AnimatePresence custom={exit}>
                            {stack
                                .slice(0, 2)
                                .reverse()
                                .map((card) => (
                                    <DatingCard
                                        key={card.commander}
                                        card={card}
                                        top={card.commander === top.commander}
                                        onSwipe={swipe}
                                        onOpenBio={() => setBio(card)}
                                    />
                                ))}
                        </AnimatePresence>
                    )}
                </div>

                {!profileNeeded && (
                    <div className={"flex items-center justify-center gap-4 pt-2"}>
                        <button
                            type={"button"}
                            onClick={rewind}
                            disabled={last === null || busy}
                            aria-label={t("button.rewind")}
                            className={clsx(ROUND, QUIET, "size-12 text-amber-500")}
                        >
                            <ArrowUturnLeftIcon className={"size-5"} />
                        </button>
                        <button
                            type={"button"}
                            onClick={() => swipe("left")}
                            disabled={top === undefined}
                            aria-label={t("button.pass")}
                            className={clsx(ROUND, QUIET, "size-16 text-zinc-700 dark:text-zinc-200")}
                        >
                            <XMarkIcon className={"size-8"} />
                        </button>
                        <button
                            type={"button"}
                            onClick={() => swipe("up")}
                            disabled={top === undefined || supers <= 0}
                            aria-label={t("button.super-like")}
                            className={clsx(ROUND, QUIET, "relative size-12 text-sky-500")}
                        >
                            <StarIcon className={"size-5"} />
                            <span
                                className={
                                    "absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full bg-sky-500 text-[0.65rem] font-bold text-white"
                                }
                            >
                                {supers}
                            </span>
                        </button>
                        <button
                            type={"button"}
                            onClick={() => swipe("right")}
                            disabled={top === undefined}
                            aria-label={t("button.like")}
                            className={clsx(ROUND, "size-16 bg-lime-400 text-lime-950 ring-lime-500")}
                        >
                            <HeartIcon className={"size-8"} />
                        </button>
                    </div>
                )}
            </div>

            <DatingBioDialog card={bio} onClose={() => setBio(null)} />

            <AnimatePresence>
                {date !== null && (
                    <DatingVerdict
                        commander={date.card.commander}
                        name={date.card.name}
                        art={date.card.image_art_crop ?? date.card.image_normal ?? null}
                        verdict={date.verdict}
                        busy={busy}
                        onKeepSwiping={() => setDate(null)}
                        onStartDeck={async (mode) => {
                            setBusy(true);
                            try {
                                await startDeck(
                                    {
                                        commander: date.card.commander,
                                        name: date.card.name,
                                        printing: date.card.printing,
                                    },
                                    mode,
                                );
                            } finally {
                                setBusy(false);
                            }
                        }}
                        onComeBack={async () => {
                            setBusy(true);
                            try {
                                await Api.dating.comeBack(date.card.commander);
                                setDate({ card: date.card, verdict: { kind: "match", how: "comeback", shared: null } });
                            } finally {
                                setBusy(false);
                            }
                        }}
                    />
                )}
            </AnimatePresence>
        </RequireAccount>
    );
}
