import React from "react";
import { useTranslation } from "react-i18next";
import { Brush, XAxis } from "recharts";
import { Button, Listbox, ListboxLabel, ListboxOption } from "components";
import { ChartCard } from "src/components/statistics/chart-card";
import { ItemSeries } from "src/components/statistics/series";
import { IntakeSegment, Measure, SegmentSize } from "src/utils/statistics";

const TIME_ZONE = "Europe/Berlin";
const DAY = new Intl.DateTimeFormat("de-DE", { timeZone: TIME_ZONE, day: "2-digit", month: "2-digit" });
const DAY_TIME = new Intl.DateTimeFormat("de-DE", {
    timeZone: TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
});
const TIME = new Intl.DateTimeFormat("de-DE", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit" });
const SEGMENT_SIZES: SegmentSize[] = ["10min", "30min", "1h", "1d"];

/** The properties of {@link IntakeChart} */
export type IntakeChartProps = {
    /** The segments */
    intake: IntakeSegment[];
    /** The segment size in effect */
    segmentSize: SegmentSize;
    /** The chosen segment size, `auto` to follow the period */
    segmentChoice: SegmentSize | "auto";
    /** Called with a new segment size choice */
    onSegmentChoice: (choice: SegmentSize | "auto") => void;
    /** The selected Items */
    series: ItemSeries[];
    /** The measure */
    measure: Measure;
    /** Called with the range of a brush drag, start and exclusive end (epoch ms) */
    onZoom: (start: number, end: number) => void;
};

/**
 * Order intake by placement time, with brush zoom and segment size override
 *
 * @returns the chart card
 */
export function IntakeChart(props: IntakeChartProps) {
    const { intake, segmentSize, segmentChoice, onSegmentChoice, series, measure, onZoom } = props;
    const [t] = useTranslation("statistics");

    const formatTick = (start: number) => (segmentSize === "1d" ? DAY : DAY_TIME).format(start);
    const formatRange = (start: number) => {
        const segment = intake.find((candidate) => candidate.start === start);
        if (segment === undefined || segmentSize === "1d") return DAY.format(start);
        return `${DAY_TIME.format(segment.start)}–${TIME.format(segment.end)}`;
    };

    return (
        <ChartCard
            title={t("heading.intake")}
            hint={t("description.intake")}
            data={intake}
            series={series}
            measure={measure}
            withCancelled
            formatLabel={(label) => formatRange(Number(label))}
            action={
                <div className={"w-44"}>
                    <Listbox
                        aria-label={t("accessibility.segment-size")}
                        value={segmentChoice}
                        onChange={onSegmentChoice}
                    >
                        <ListboxOption value={"auto"}>
                            <ListboxLabel>
                                {t("label.segment-auto", { size: t(`label.segment-${segmentSize}`) })}
                            </ListboxLabel>
                        </ListboxOption>
                        {SEGMENT_SIZES.map((size) => (
                            <ListboxOption key={size} value={size}>
                                <ListboxLabel>{t(`label.segment-${size}`)}</ListboxLabel>
                            </ListboxOption>
                        ))}
                    </Listbox>
                </div>
            }
            height={320}
            xAxis={
                <XAxis
                    dataKey={"start"}
                    tickFormatter={formatTick}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={24}
                    tick={{ fill: "currentColor", fontSize: 12 }}
                />
            }
        >
            {intake.length > 1 && (
                <Brush
                    key={`${intake[0].start}-${intake.length}`}
                    dataKey={"start"}
                    height={24}
                    stroke={"currentColor"}
                    fill={"transparent"}
                    tickFormatter={(value: number) => formatTick(value)}
                    ariaLabel={t("accessibility.zoom")}
                    onDragEnd={({ startIndex, endIndex }) => {
                        if (startIndex === 0 && endIndex === intake.length - 1) return;
                        onZoom(intake[startIndex].start, intake[endIndex].end);
                    }}
                />
            )}
        </ChartCard>
    );
}

/** The properties of {@link ZoomResetButton} */
export type ZoomResetButtonProps = {
    /** Called to leave the zoom */
    onClick: () => void;
};

/**
 * Button that leaves the zoom and returns to the picked period
 *
 * @returns the button
 */
export function ZoomResetButton(props: ZoomResetButtonProps) {
    const [t] = useTranslation("statistics");
    return (
        <Button outline onClick={props.onClick}>
            {t("button.reset-zoom")}
        </Button>
    );
}
