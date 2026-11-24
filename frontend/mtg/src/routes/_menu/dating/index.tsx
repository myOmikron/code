import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeftIcon, ChatBubbleLeftRightIcon, UserCircleIcon } from "@heroicons/react/20/solid";
import { Button, EmptyState, Heading, Text, notify } from "components";
import { AnimatePresence } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { DateStatus, SwipeKind } from "src/api/generated";
import type { DatingCardResponse } from "src/api/generated";
import { DatingActions } from "src/components/dating-actions";
import { DatingBioDialog } from "src/components/dating-bio-dialog";
import { DatingCard } from "src/components/dating-card";
import { DatingColorFilter } from "src/components/dating-color-filter";
import { DatingPolyToggle } from "src/components/dating-poly-toggle";
import { DatingSetFilter } from "src/components/dating-set-filter";
import { DatingVerdict } from "src/components/dating-verdict";
import type { Verdict } from "src/components/dating-verdict";
import { PrimaryButton } from "src/components/primary-button";
import { RequireAccount } from "src/components/require-account";
import i18n from "src/i18n";
import { REFILL_AT, colorFilter, loadPoly, nextColorChoice, savePoly } from "src/utils/dating";
import type { Color, ColorChoice, SwipeDirection } from "src/utils/dating";
import { useShortcuts } from "src/utils/use-shortcuts";
import { useDatingLines } from "src/utils/dating-lines";
import { useStartDeck } from "src/utils/use-start-deck";

/** What the dating page is opened with */
type DatingSearch = {
    /** The lead whose second Commander is being swiped */
    with?: string;
};

export const Route = createFileRoute("/_menu/dating/")({
    validateSearch: (search: Record<string, unknown>): DatingSearch => ({
        with: typeof search.with === "string" ? search.with : undefined,
    }),
    loader: async () => {
        await i18n.loadNamespaces(["dating"]);
    },
    component: RouteComponent,
});

/**
 * Command Zone Dating: swipe through Commanders, and they swipe back.
 *
 * @returns the page
 */
function RouteComponent() {
    const [t] = useTranslation("dating");
    const navigate = useNavigate({ from: Route.fullPath });
    const { with: leadId } = Route.useSearch();
    const startDeck = useStartDeck();
    const lines = useDatingLines();
    const [poly, setPoly] = useState(loadPoly);
    const [lead, setLead] = useState<DatingCardResponse | null>(null);
    const [stack, setStack] = useState<DatingCardResponse[]>([]);
    const [loading, setLoading] = useState(true);
    const [exhausted, setExhausted] = useState(false);
    const [supers, setSupers] = useState(1);
    const [profileNeeded, setProfileNeeded] = useState(false);
    const [colors, setColors] = useState<Map<Color, ColorChoice>>(new Map());
    const [sets, setSets] = useState<string[]>([]);
    const [filtering, setFiltering] = useState(false);
    const [exit, setExit] = useState<SwipeDirection | null>(null);
    const [last, setLast] = useState<{ card: DatingCardResponse; kind: SwipeKind } | null>(null);
    const [bio, setBio] = useState<DatingCardResponse | null>(null);
    const [flipped, setFlipped] = useState<string | null>(null);
    const [date, setDate] = useState<{
        card: DatingCardResponse;
        partner: DatingCardResponse | null;
        verdict: Verdict;
    } | null>(null);
    const [busy, setBusy] = useState(false);
    const refilling = useRef(false);
    const gone = useRef(new Set<string>());
    const saving = useRef(new Set<string>());
    const { colors: allowed, required } = colorFilter(colors);

    const load = useCallback(
        async (pending: DatingCardResponse[]) => {
            const held = [...pending.map((card) => card.commander), ...saving.current];
            if (leadId !== undefined) {
                const response = await Api.dating.partners({
                    commander: leadId,
                    colors: allowed,
                    required_colors: required,
                    pending: held,
                });
                setLead(response.lead);
                return response.commanders;
            }
            const response = await Api.dating.stack({
                colors: allowed,
                required_colors: required,
                sets,
                poly,
                pending: held,
            });
            setProfileNeeded(response.profile_needed);
            setSupers(response.super_likes_left);
            return response.commanders;
        },
        [allowed, required, sets, poly, leadId],
    );

    useEffect(() => {
        gone.current.clear();
        setLast(null);
        setFlipped(null);
        if (leadId === undefined) setLead(null);
    }, [leadId]);

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
                const fresh = cards.filter((card) => !gone.current.has(card.commander));
                setExhausted(fresh.length === 0);
                setStack((current) => {
                    const added = fresh.filter((card) => !current.some((held) => held.commander === card.commander));
                    return added.length === 0 ? current : [...current, ...added];
                });
            })
            .finally(() => {
                refilling.current = false;
            });
    }, [stack, loading, exhausted, load]);

    const swipe = async (direction: SwipeDirection) => {
        const top = stack[0];
        if (top === undefined || date !== null || busy) return;
        if (leadId !== undefined && (lead === null || direction === "up")) return;
        if (direction === "up" && supers <= 0) {
            notify.info(t("description.super-gone"));
            return;
        }
        const kind =
            direction === "left" ? SwipeKind.Pass : direction === "right" ? SwipeKind.Like : SwipeKind.SuperLike;

        setExit(direction);
        setLast({ card: top, kind });
        gone.current.add(top.commander);
        saving.current.add(top.commander);
        setStack((current) => current.slice(1));

        let response;
        try {
            response = await Api.dating.swipe(
                lead === null
                    ? { commander: top.commander, kind }
                    : { commander: lead.commander, partner: top.commander, kind },
            );
        } catch {
            notify.error(t("toast.swipe-failed"));
            gone.current.delete(top.commander);
            setLast((held) => (held?.card.commander === top.commander ? null : held));
            setExit(null);
            setStack((current) => [top, ...current.filter((card) => card.commander !== top.commander)]);
            return;
        } finally {
            saving.current.delete(top.commander);
        }
        setSupers(response.super_likes_left);
        if (kind === SwipeKind.Pass) return;
        setDate({
            card: lead ?? top,
            partner: lead === null ? null : top,
            verdict:
                response.status === DateStatus.Matched
                    ? {
                          kind: "match",
                          how: response.pity ? "pity" : kind === SwipeKind.SuperLike ? "super" : "like",
                          shared: response.shared ?? null,
                      }
                    : { kind: "reject", reason: response.reason ?? null },
        });
    };

    const rewind = async () => {
        if (last === null || busy || saving.current.size > 0) return;
        setBusy(true);
        try {
            await Api.dating.rewind();
            setExit(null);
            setDate(null);
            gone.current.delete(last.card.commander);
            setStack((current) => [last.card, ...current.filter((card) => card.commander !== last.card.commander)]);
            if (last.kind === SwipeKind.SuperLike) setSupers((count) => count + 1);
            setLast(null);
        } finally {
            setBusy(false);
        }
    };

    const flip = () => {
        const card = stack[0];
        if (card !== undefined) setFlipped((turned) => (turned === card.commander ? null : card.commander));
    };

    const toggleColor = (color: Color) =>
        setColors((current) => {
            const next = new Map(current);
            const choice = nextColorChoice(current.get(color));
            if (choice === undefined) next.delete(color);
            else next.set(color, choice);
            return next;
        });

    const togglePoly = (on: boolean) => {
        savePoly(on);
        setPoly(on);
    };

    const findPartner = (commander: string) => {
        setDate(null);
        void navigate({ search: { with: commander } });
    };

    const leavePartners = () => navigate({ search: {} });

    useShortcuts(
        {
            arrowleft: () => swipe("left"),
            arrowright: () => swipe("right"),
            arrowup: () => swipe("up"),
            arrowdown: () => flip(),
            backspace: () => rewind(),
        },
        date === null && bio === null && !profileNeeded && !filtering,
    );

    const top = stack[0];
    const filtered = sets.length > 0;
    const pairing = leadId !== undefined;

    return (
        <RequireAccount>
            <div
                className={
                    "mx-auto flex h-[calc(100dvh-5rem)] min-h-[34rem] w-full max-w-md flex-col gap-2 px-4 pt-2 pb-4 lg:h-[calc(100dvh-9rem)] lg:min-h-[30rem] lg:max-w-none lg:gap-5 lg:p-0"
                }
            >
                <header className={"flex flex-wrap items-center gap-x-2 gap-y-2 lg:flex-nowrap lg:gap-x-5"}>
                    {pairing ? (
                        <div className={"flex min-w-0 flex-1 items-center gap-2"}>
                            <Button plain={true} onClick={leavePartners} aria-label={t("button.back-to-commanders")}>
                                <ArrowLeftIcon />
                            </Button>
                            {lead !== null && (
                                <>
                                    <span
                                        className={
                                            "size-9 shrink-0 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
                                        }
                                    >
                                        {lead.image_art_crop && (
                                            <img
                                                src={lead.image_art_crop}
                                                alt={""}
                                                crossOrigin={"anonymous"}
                                                className={"size-full object-cover object-[center_35%]"}
                                            />
                                        )}
                                    </span>
                                    <Heading className={"min-w-0 truncate"}>
                                        {t(`heading.find-${(lead.seeks ?? "Partner").toLowerCase()}`, {
                                            name: lead.name,
                                        })}
                                    </Heading>
                                </>
                            )}
                        </div>
                    ) : (
                        <Heading className={"min-w-0 flex-1"}>{t("heading.title")}</Heading>
                    )}
                    {!profileNeeded && (
                        <>
                            <div className={"order-last w-full lg:order-none lg:w-auto"}>
                                <DatingColorFilter choices={colors} onToggle={toggleColor} />
                            </div>
                            <span
                                aria-hidden={true}
                                className={"hidden h-6 w-px bg-zinc-950/10 lg:block dark:bg-white/10"}
                            />
                            {!pairing && (
                                <>
                                    <DatingSetFilter sets={sets} onSets={setSets} onPicking={setFiltering} />
                                    <DatingPolyToggle poly={poly} onPoly={togglePoly} />
                                    <span
                                        aria-hidden={true}
                                        className={"hidden h-6 w-px bg-zinc-950/10 lg:block dark:bg-white/10"}
                                    />
                                </>
                            )}
                        </>
                    )}
                    <div className={"flex items-center"}>
                        <Button plain={true} href={"/dating/profile"} aria-label={t("button.profile")}>
                            <UserCircleIcon />
                        </Button>
                        <Button plain={true} href={"/dating/matches"} aria-label={t("button.matches")}>
                            <ChatBubbleLeftRightIcon />
                        </Button>
                    </div>
                </header>

                <div className={"relative isolate min-h-0 flex-1 lg:mx-auto lg:w-full lg:max-w-5xl"}>
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
                    ) : top === undefined && pairing ? (
                        <EmptyState
                            title={t("heading.title")}
                            description={t("description.empty-partners", { name: lead?.name ?? "" })}
                            action={
                                <PrimaryButton onClick={leavePartners}>{t("button.back-to-commanders")}</PrimaryButton>
                            }
                        />
                    ) : top === undefined && filtered ? (
                        <EmptyState
                            title={t("heading.title")}
                            description={t("description.empty-filtered")}
                            action={
                                <PrimaryButton onClick={() => setSets([])}>{t("button.clear-filters")}</PrimaryButton>
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
                                        gone.current.clear();
                                        notify.success(t("toast.passes-reset"));
                                        setColors(new Map());
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
                                        tagline={lines?.[card.name]?.tagline ?? null}
                                        top={card.commander === top.commander}
                                        flipped={flipped === card.commander}
                                        onSwipe={swipe}
                                        onFlip={flip}
                                        onOpenBio={() => setBio(card)}
                                    />
                                ))}
                        </AnimatePresence>
                    )}
                </div>

                {!profileNeeded && (
                    <DatingActions
                        canSwipe={top !== undefined}
                        canRewind={last !== null && !busy}
                        supers={pairing ? null : supers}
                        onSwipe={swipe}
                        onRewind={rewind}
                    />
                )}
            </div>

            <DatingBioDialog
                card={bio}
                tagline={bio === null ? null : (lines?.[bio.name]?.tagline ?? null)}
                onClose={() => setBio(null)}
            />

            <AnimatePresence>
                {date !== null && (
                    <DatingVerdict
                        commander={date.card.commander}
                        name={date.card.name}
                        art={date.card.image_art_crop ?? date.card.image_normal ?? null}
                        partner={
                            date.partner && {
                                commander: date.partner.commander,
                                name: date.partner.name,
                                art: date.partner.image_art_crop ?? date.partner.image_normal ?? null,
                            }
                        }
                        findPartner={
                            poly && date.partner === null && date.card.seeks
                                ? { seeks: date.card.seeks, onFind: () => findPartner(date.card.commander) }
                                : null
                        }
                        verdict={date.verdict}
                        lines={lines?.[date.card.name] ?? null}
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
                                        art: date.card.image_art_crop,
                                        partner: date.partner && {
                                            commander: date.partner.commander,
                                            name: date.partner.name,
                                            printing: date.partner.printing,
                                        },
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
                                await Api.dating.comeBack(date.card.commander, date.partner?.commander);
                                setDate({ ...date, verdict: { kind: "match", how: "comeback", shared: null } });
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
