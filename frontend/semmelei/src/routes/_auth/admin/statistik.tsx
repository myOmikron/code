import { createFileRoute } from "@tanstack/react-router";
import React from "react";
import { useTranslation } from "react-i18next";
import {
    Button,
    CardSkeleton,
    EmptyState,
    Field,
    Heading,
    Label,
    Listbox,
    ListboxLabel,
    ListboxOption,
    Subheading,
    Text,
} from "components";
import { Api } from "src/api/api";
import { StatisticsPosition as ApiStatisticsPosition } from "src/api/generated";
import { DeadlineChart } from "src/components/statistics/deadline-chart";
import { IntakeChart, ZoomResetButton } from "src/components/statistics/intake-chart";
import { ItemSelection } from "src/components/statistics/item-selection";
import { ItemTable } from "src/components/statistics/item-table";
import { PeriodPicker } from "src/components/statistics/period-picker";
import { PickupDayChart } from "src/components/statistics/pickup-day-chart";
import { ItemSeries, MAX_SERIES, seriesColor } from "src/components/statistics/series";
import {
    aggregateStatistics,
    assignColorSlots,
    Measure,
    Period,
    quickPeriod,
    SegmentSize,
    zoomPeriod,
} from "src/utils/statistics";
import { formatDate } from "src/utils/dates";

const MEASURES: Measure[] = ["units", "orders", "orderValue"];
const MEASURE_LABELS: Record<Measure, string> = {
    units: "button.measure-units",
    orders: "button.measure-orders",
    orderValue: "button.measure-order-value",
};

/**
 * Order statistics for Admins: order intake, per pickup day, Deadline distance and the item table
 *
 * @returns the page
 */
function Statistik() {
    const [t] = useTranslation("statistics");

    const [period, setPeriod] = React.useState<Period>(() => quickPeriod("30d", Date.now()));
    const [zoom, setZoom] = React.useState<Period>();
    const [positions, setPositions] = React.useState<ApiStatisticsPosition[]>();
    const [measure, setMeasure] = React.useState<Measure>("units");
    const [segmentChoice, setSegmentChoice] = React.useState<SegmentSize | "auto">("auto");
    const [selection, setSelection] = React.useState<string[] | "top">("top");
    const [category, setCategory] = React.useState<string | null>(null);
    const colorSlots = React.useRef<Record<string, number>>({});

    React.useEffect(() => {
        let current = true;
        setPositions(undefined);
        setZoom(undefined);
        Api.admin.statistics.positions(period.from, period.to).then((response) => {
            if (current) setPositions(response.positions);
        });
        return () => {
            current = false;
        };
    }, [period]);

    const viewPeriod = zoom ?? period;
    const stats = React.useMemo(
        () =>
            aggregateStatistics(positions ?? [], {
                period: viewPeriod,
                segmentSize: segmentChoice,
                measure,
                selectedItems: selection,
                category,
            }),
        [positions, viewPeriod, segmentChoice, measure, selection, category],
    );

    const selected = React.useMemo(
        () =>
            selection === "top"
                ? stats.topItems
                : selection.filter((key) => stats.items.some((row) => row.key === key)),
        [selection, stats],
    );
    const series: ItemSeries[] = React.useMemo(() => {
        colorSlots.current = assignColorSlots(colorSlots.current, selected);
        return selected.map((key) => {
            const row = stats.items.find((candidate) => candidate.key === key);
            const name = row === undefined ? key : row.deleted ? `${row.name} (${t("label.deleted")})` : row.name;
            return { key, name, color: seriesColor(colorSlots.current[key]) };
        });
    }, [selected, stats.items, t]);

    const empty = stats.intake.length === 0 && stats.pickupDays.length === 0;

    return (
        <div className={"flex flex-col gap-6"}>
            <div className={"flex flex-wrap items-center justify-between gap-4"}>
                <Heading>{t("heading.statistics")}</Heading>
            </div>

            <PeriodPicker period={period} onChange={setPeriod} />

            <div className={"flex flex-wrap items-end gap-3"}>
                <div className={"flex flex-col gap-2"}>
                    <Text className={"text-sm/6! font-medium"}>{t("label.measure")}</Text>
                    <div className={"flex flex-wrap gap-2"} role={"group"} aria-label={t("label.measure")}>
                        {MEASURES.map((option) =>
                            option === measure ? (
                                <Button key={option} color={"blue"} aria-pressed={true}>
                                    {t(MEASURE_LABELS[option])}
                                </Button>
                            ) : (
                                <Button key={option} outline aria-pressed={false} onClick={() => setMeasure(option)}>
                                    {t(MEASURE_LABELS[option])}
                                </Button>
                            ),
                        )}
                    </div>
                </div>
                <Field className={"w-full sm:w-56"}>
                    <Label>{t("label.category")}</Label>
                    <Listbox value={category} onChange={(value) => setCategory(value)}>
                        <ListboxOption value={null}>
                            <ListboxLabel>{t("label.all-categories")}</ListboxLabel>
                        </ListboxOption>
                        {stats.categories.map((option) => (
                            <ListboxOption key={option.uuid} value={option.uuid}>
                                <ListboxLabel>{option.name}</ListboxLabel>
                            </ListboxOption>
                        ))}
                    </Listbox>
                </Field>
                <div className={"flex w-full flex-col gap-2 sm:w-auto"}>
                    <Text className={"text-sm/6! font-medium"}>{t("label.items-shown")}</Text>
                    <ItemSelection
                        items={stats.items}
                        selection={selection}
                        selected={selected}
                        onChange={(next) => setSelection(next === "top" ? next : next.slice(0, MAX_SERIES))}
                    />
                </div>
                {zoom !== undefined && <ZoomResetButton onClick={() => setZoom(undefined)} />}
            </div>

            {zoom !== undefined && (
                <Text>{t("description.zoomed", { from: formatDate(zoom.from), to: formatDate(zoom.to) })}</Text>
            )}

            {positions === undefined ? (
                <div className={"grid gap-6 lg:grid-cols-2"}>
                    <CardSkeleton />
                    <CardSkeleton />
                </div>
            ) : empty ? (
                <EmptyState title={t("label.empty")} description={t("description.empty")} />
            ) : (
                <>
                    {stats.intake.length > 0 && (
                        <IntakeChart
                            intake={stats.intake}
                            segmentSize={stats.segmentSize}
                            segmentChoice={segmentChoice}
                            onSegmentChoice={setSegmentChoice}
                            series={series}
                            measure={measure}
                            onZoom={(start, end) => {
                                setZoom(zoomPeriod(start, end));
                                setSegmentChoice("auto");
                            }}
                        />
                    )}
                    <div className={"grid gap-6 xl:grid-cols-2"}>
                        {stats.pickupDays.length > 0 && (
                            <PickupDayChart days={stats.pickupDays} series={series} measure={measure} />
                        )}
                        {stats.deadlineDistance.length > 0 && (
                            <DeadlineChart buckets={stats.deadlineDistance} series={series} measure={measure} />
                        )}
                    </div>
                    <section className={"flex flex-col gap-3"}>
                        <Subheading>{t("heading.items")}</Subheading>
                        <Text>{t("description.items")}</Text>
                        {stats.items.length === 0 ? (
                            <EmptyState variant={"bare"} title={t("label.items-empty")} />
                        ) : (
                            <ItemTable rows={stats.items} />
                        )}
                    </section>
                </>
            )}
        </div>
    );
}

export const Route = createFileRoute("/_auth/admin/statistik")({
    component: Statistik,
});
