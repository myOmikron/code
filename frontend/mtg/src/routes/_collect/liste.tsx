import { ArrowUpTrayIcon, ChevronLeftIcon, TrashIcon } from "@heroicons/react/20/solid";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Badge, Button, EmptyState, HeadingLayout, StackedList, StackedListFlexRow, Strong, Text } from "components";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CardImage } from "src/components/card-image";
import { PrintingPicker } from "src/components/printing-picker";
import { usePendingScans } from "src/context/pending-scans-context";
import { groupPendingScans, pendingValue } from "src/utils/pending-scans";
import { formatCurrency } from "src/utils/format";

export const Route = createFileRoute("/_collect/liste")({ component: PendingListRoute });

/**
 * Review of everything the scanner has staged.
 *
 * This is the hand-off point: the list lives in localStorage today and is meant to be pushed to a
 * backend later, which is why entries are kept individually — sending can then acknowledge and
 * drop exactly what the server accepted.
 *
 * @returns the page
 */
function PendingListRoute() {
    const [t] = useTranslation("liste");
    const [tg] = useTranslation();
    const navigate = useNavigate();
    const { scans, remove, replaceCard, clear } = usePendingScans();
    // Which entry is being corrected. Groups share a card, so correcting one corrects that copy —
    // the id is what makes "this one" unambiguous.
    const [correcting, setCorrecting] = useState<string | null>(null);
    const correctingScan = scans.find((scan) => scan.id === correcting) ?? null;

    const groups = useMemo(() => groupPendingScans(scans), [scans]);
    const value = useMemo(() => pendingValue(scans), [scans]);

    return (
        <main className="min-h-svh px-5 py-8 lg:mx-auto lg:max-w-220 lg:px-12 lg:py-10">
            <HeadingLayout
                heading={t("heading.scanned-cards")}
                headingDescription={
                    scans.length > 0
                        ? t("label.summary", {
                              cards: tg("label.cards", { count: scans.length, amount: scans.length }),
                              value: formatCurrency(value),
                          })
                        : undefined
                }
                headingChildren={
                    <Button plain onClick={() => void navigate({ to: "/scan" })}>
                        <ChevronLeftIcon className="size-5" /> {tg("button.scan")}
                    </Button>
                }
            >
                {scans.length === 0 ? (
                    <EmptyState
                        className="mt-6"
                        title={tg("heading.nothing-scanned")}
                        description={t("description.empty")}
                        action={
                            <Button color="lime" onClick={() => void navigate({ to: "/scan" })}>
                                {t("button.start-scanning")}
                            </Button>
                        }
                    />
                ) : (
                    <>
                        <StackedList className="mt-6">
                            {groups.map((group) => (
                                <StackedListFlexRow key={`${group.card.id}-${group.foil}`} className="gap-3">
                                    {/* The row itself is the way to fix a printing — that is the correction the
                                        scanner gets wrong most often, so it should not hide behind an icon. */}
                                    <button
                                        className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left"
                                        onClick={() => setCorrecting(group.ids[0])}
                                        aria-label={t("accessibility.change-printing", { name: group.card.name })}
                                    >
                                        <CardImage card={group.card} className="h-[67px] w-12 shrink-0 rounded-[5px]" />
                                        <div className="min-w-0 flex-1">
                                            <Strong className="block truncate">{group.card.name}</Strong>
                                            <Text className="truncate">{group.card.setName}</Text>
                                            <Text className="truncate">
                                                {group.card.setCode} · #{group.card.collectorNumber}
                                            </Text>
                                        </div>
                                    </button>
                                    <div className="flex shrink-0 items-center gap-2">
                                        {group.foil && <Badge color="purple">{tg("label.foil")}</Badge>}
                                        <Badge>×{group.ids.length}</Badge>
                                        {/* Removes one copy, which is why the group keeps its member ids. */}
                                        <Button
                                            plain
                                            aria-label={t("accessibility.remove-copy", { name: group.card.name })}
                                            onClick={() => remove(group.ids[0])}
                                        >
                                            <TrashIcon className="size-5" />
                                        </Button>
                                    </div>
                                </StackedListFlexRow>
                            ))}
                        </StackedList>

                        <div className="mt-6 flex items-center gap-2">
                            {/* No backend is wired up yet. The affordance is here so the shape of the
                                hand-off is visible, but it must not pretend to have sent anything. */}
                            <Button color="lime" disabled title={t("label.no-backend")}>
                                <ArrowUpTrayIcon className="size-5" /> {t("button.send-to-backend")}
                            </Button>
                            <Button plain onClick={clear}>
                                {t("button.clear-list")}
                            </Button>
                        </div>
                        <Text className="mt-2">{t("description.local-only")}</Text>
                    </>
                )}
            </HeadingLayout>

            <PrintingPicker
                card={correctingScan?.card ?? null}
                open={correctingScan !== null}
                onClose={() => setCorrecting(null)}
                onSelect={(card) => {
                    if (correctingScan) replaceCard(correctingScan.id, card);
                    setCorrecting(null);
                }}
            />
        </main>
    );
}
