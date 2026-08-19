import { Badge } from "components";
import { useTranslation } from "react-i18next";
import { BucketReport } from "src/api/graph-generated";

/**
 * The properties for {@link DeckAdvisorQuotas}
 */
export type DeckAdvisorQuotasProps = {
    /** The composition buckets as the advisor reports them */
    buckets: Array<BucketReport>;
};

/**
 * Formats a weighted count without a pointless `.0`
 *
 * @param value the count, possibly fractional
 *
 * @returns the count with at most one decimal
 */
function count(value: number): string {
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/**
 * How well each composition role is covered, against its target corridor.
 *
 * One meter per bucket: the fill is the deck's weighted coverage, the shaded
 * band behind it the target corridor. The verdict is spelled out in a badge —
 * the colour supports it but never carries it alone.
 *
 * @returns the meter list
 */
export function DeckAdvisorQuotas({ buckets }: DeckAdvisorQuotasProps) {
    const [t] = useTranslation("advisor");

    return (
        <div className={"flex flex-col gap-4"}>
            {buckets.map((bucket) => {
                // Each meter carries its own scale: far enough past the
                // corridor that an overshoot stays visible instead of clipping.
                const scale = Math.max(bucket.high * 1.25, bucket.coverage, 1);
                const fill = Math.min(bucket.coverage / scale, 1);
                const bandLeft = Math.min(bucket.low / scale, 1);
                const bandRight = Math.min(bucket.high / scale, 1);
                return (
                    <div key={bucket.bucket} className={"flex flex-col gap-1"}>
                        <div className={"flex items-baseline justify-between gap-2"}>
                            <span className={"text-sm font-medium text-zinc-950 dark:text-white"}>
                                {t(`label.bucket-${bucket.bucket.replace(/_/g, "-")}`, {
                                    defaultValue: bucket.bucket.replace(/_/g, " "),
                                })}
                            </span>
                            <span className={"flex items-baseline gap-2 text-xs text-zinc-500 dark:text-zinc-400"}>
                                {t("label.quota-numbers", {
                                    coverage: count(bucket.coverage),
                                    low: count(bucket.low),
                                    high: count(bucket.high),
                                })}
                                <Badge color={bucket.status === "ok" ? "green" : "amber"}>
                                    {t(`label.status-${bucket.status}`, { defaultValue: bucket.status })}
                                </Badge>
                            </span>
                        </div>
                        <div className={"relative h-2 overflow-hidden rounded-full bg-zinc-950/5 dark:bg-white/10"}>
                            <div
                                className={"absolute inset-y-0 bg-zinc-950/10 dark:bg-white/15"}
                                style={{ left: `${bandLeft * 100}%`, width: `${(bandRight - bandLeft) * 100}%` }}
                            />
                            <div
                                className={"absolute inset-y-0 left-0 rounded-full bg-(--color-accent)"}
                                style={{ width: `${fill * 100}%` }}
                            />
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
