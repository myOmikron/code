import { BookOpenIcon, CameraIcon, RectangleStackIcon, Square2StackIcon, UsersIcon } from "@heroicons/react/20/solid";
import { createFileRoute } from "@tanstack/react-router";
import { EmptyState, StatTile, Text } from "components";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import type { AdminStatisticsResponse } from "src/api/generated";
import { ChartCard } from "src/components/charts/chart-card";
import { StatisticsCurve, type StatisticsCount } from "src/components/charts/statistics-curve";
import { formatDateTime, formatDay } from "src/utils/format";

export const Route = createFileRoute("/_menu/admin/statistics")({
    component: RouteComponent,
});

/**
 * The newest Statistics snapshot and how each count moved over the last 30 days.
 *
 * Shows stored snapshots only, never live counts.
 *
 * @returns the page
 */
function RouteComponent() {
    const [t] = useTranslation("admin");
    const [statistics, setStatistics] = useState<AdminStatisticsResponse | null>(null);

    useEffect(() => {
        let current = true;
        Api.admin
            .statistics()
            .then((response) => {
                if (current) setStatistics(response);
            })
            .catch(() => undefined);
        return () => {
            current = false;
        };
    }, []);

    if (statistics === null) return <Text>{t("label.loading")}</Text>;

    const newest = statistics.newest;
    if (newest === undefined || newest === null) {
        return <EmptyState title={t("heading.no-statistics")} description={t("description.no-statistics")} />;
    }

    const number = (value: number) => value.toLocaleString("de-DE");
    const curves: Array<{ count: StatisticsCount; label: string }> = [
        { count: "accounts", label: t("label.accounts") },
        { count: "collections", label: t("label.collections") },
        { count: "decks", label: t("label.decks") },
        { count: "public_decks", label: t("label.public-decks") },
        { count: "cards", label: t("label.cards") },
        { count: "open_scanner_sessions", label: t("label.open-scanner-sessions") },
    ];

    return (
        <div className={"flex flex-col gap-6"}>
            <Text>{t("label.taken-at", { time: formatDateTime(newest.taken_at) })}</Text>
            <div className={"grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5"}>
                <StatTile
                    icon={<UsersIcon className={"size-5"} />}
                    label={t("label.accounts")}
                    value={number(newest.accounts)}
                    sub={t("label.new-accounts", { count: newest.new_accounts })}
                />
                <StatTile
                    icon={<RectangleStackIcon className={"size-5"} />}
                    label={t("label.collections")}
                    value={number(newest.collections)}
                />
                <StatTile
                    icon={<BookOpenIcon className={"size-5"} />}
                    label={t("label.decks")}
                    value={number(newest.decks)}
                    sub={t("label.public-decks-of", { count: newest.public_decks })}
                />
                <StatTile
                    icon={<Square2StackIcon className={"size-5"} />}
                    label={t("label.cards")}
                    value={number(newest.cards)}
                />
                <StatTile
                    icon={<CameraIcon className={"size-5"} />}
                    label={t("label.open-scanner-sessions")}
                    value={number(newest.open_scanner_sessions)}
                />
            </div>
            <div className={"grid grid-cols-1 gap-4 lg:grid-cols-2"}>
                {curves.map(({ count, label }) => (
                    <ChartCard key={count} title={label} hint={t("description.last-30-days")} height={180}>
                        <StatisticsCurve
                            snapshots={statistics.history}
                            count={count}
                            name={label}
                            formatTick={(iso) => formatDay(iso.slice(0, 10))}
                            formatTime={formatDateTime}
                        />
                    </ChartCard>
                ))}
            </div>
        </div>
    );
}
