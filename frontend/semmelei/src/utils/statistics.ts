/** Status of an order, as in the generated `OrderStatus` */
export type StatisticsOrderStatus = "Open" | "Ready" | "PickedUp" | "Cancelled";

/** One order position as the Admin statistics endpoint returns it (#352) */
export type StatisticsPosition = {
    /** The order, to count orders */
    order: string;
    /** Point in time the order was placed (ISO datetime) */
    ordered_at: string;
    /** The order's status */
    status: StatisticsOrderStatus;
    /** Effective pickup date of the pickup day (`YYYY-MM-DD`) */
    pickup_date: string;
    /** The pickup day's Deadline (ISO datetime) */
    deadline: string;
    /** Whether the pickup day has been Dispatched */
    dispatched: boolean;
    /** Whether the pickup day is Called Off */
    called_off: boolean;
    /** Item reference, null when the Item was deleted */
    item?: string | null;
    /** The Item's current name, null when deleted */
    item_name?: string | null;
    /** The Item's current category */
    category?: { uuid: string; name: string } | null;
    /** Name snapshot at order time */
    name: string;
    /** Units ordered */
    quantity: number;
    /** Price snapshot in euro cents */
    price_cents: number;
};

/** What the charts count */
export type Measure = "units" | "orders" | "orderValue";

/** Length of one order intake segment */
export type SegmentSize = "10min" | "30min" | "1h" | "1d";

/** Calendar days in Europe/Berlin, both inclusive (`YYYY-MM-DD`) */
export type Period = { from: string; to: string };

/** Inputs of {@link aggregateStatistics} */
export type StatisticsOptions = {
    /** The period of the whole page */
    period: Period;
    /** Segment size of the order intake, or chosen from the period length */
    segmentSize: SegmentSize | "auto";
    /** What the charts count */
    measure: Measure;
    /** Keys ({@link ItemRow.key}) of the Items the charts show */
    selectedItems: string[];
    /** Uuid of the category to restrict everything to, null for all */
    category: string | null;
};

/** Values of one chart point: per selected Item, their total and the cancelled series */
export type ChartValues = {
    /** Measure per selected Item key, main numbers only */
    items: Record<string, number>;
    /** Measure over all selected Items; for orders, orders with at least one selected Item */
    total: number;
    /** Measure of cancelled orders whose pickup day is not Called Off ("storniert") */
    cancelled: number;
    /** Measure of orders of Called Off pickup days ("abgesagt") */
    calledOff: number;
};

/** One order intake segment */
export type IntakeSegment = ChartValues & {
    /** Start of the segment (epoch ms) */
    start: number;
    /** End of the segment, exclusive (epoch ms) */
    end: number;
};

/** One pickup day */
export type PickupDayPoint = ChartValues & {
    /** Effective pickup date (`YYYY-MM-DD`) */
    date: string;
    /** Not Dispatched yet, so its numbers may still change ("noch offen") */
    open: boolean;
    /** The pickup day is Called Off ("abgesagt") */
    isCalledOff: boolean;
};

/** Buckets of the Deadline distance histogram */
export type DeadlineDistance = "lt1h" | "1to3h" | "3to12h" | "12to24h" | "1to2d" | "gt2d";

/** One bar of the Deadline distance histogram */
export type DeadlineBucket = Omit<ChartValues, "cancelled" | "calledOff"> & {
    /** The bucket */
    bucket: DeadlineDistance;
};

/** One row of the item table */
export type ItemRow = {
    /** Identity: the Item uuid, or `deleted:<name snapshot>` for deleted Items */
    key: string;
    /** Current name, or the name snapshot of a deleted Item */
    name: string;
    /** The Item was deleted ("gelöscht") */
    deleted: boolean;
    /** The Item's current category */
    category: { uuid: string; name: string } | null;
    /** Units of orders that were not cancelled */
    units: number;
    /** Orders that were not cancelled and contain the Item */
    orders: number;
    /** Order Value in euro cents */
    orderValueCents: number;
    /** Units of cancelled orders whose pickup day is not Called Off */
    cancelledUnits: number;
    /** Units of orders of Called Off pickup days */
    calledOffUnits: number;
};

/** Everything the Statistik page shows */
export type Statistics = {
    /** The segment size in effect */
    segmentSize: SegmentSize;
    /** Order intake by placement time */
    intake: IntakeSegment[];
    /** Per pickup day, by effective pickup date */
    pickupDays: PickupDayPoint[];
    /** Distance from placement to the Deadline */
    deadlineDistance: DeadlineBucket[];
    /** Item table rows, by placement time */
    items: ItemRow[];
    /** Keys of the top 5 Items of the period in the current measure */
    topItems: string[];
};

const TIME_ZONE = "Europe/Berlin";
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const MAX_SEGMENTS = 200;
const TOP_ITEMS = 5;
const DEADLINE_BUCKETS: { bucket: DeadlineDistance; from?: number; to?: number }[] = [
    { bucket: "lt1h", to: HOUR },
    { bucket: "1to3h", from: HOUR, to: 3 * HOUR },
    { bucket: "3to12h", from: 3 * HOUR, to: 12 * HOUR },
    { bucket: "12to24h", from: 12 * HOUR, to: 24 * HOUR },
    { bucket: "1to2d", from: 24 * HOUR, to: 48 * HOUR },
    { bucket: "gt2d", from: 48 * HOUR },
];
const SEGMENT_SIZES: SegmentSize[] = ["10min", "30min", "1h", "1d"];
const SEGMENT_MS: Record<Exclude<SegmentSize, "1d">, number> = {
    "10min": 10 * MINUTE,
    "30min": 30 * MINUTE,
    "1h": HOUR,
};

const berlinFields = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
});

/**
 * Offset of Europe/Berlin from UTC at an instant
 *
 * @param instant epoch ms
 *
 * @returns the offset in ms
 */
function berlinOffset(instant: number): number {
    const parts = Object.fromEntries(berlinFields.formatToParts(instant).map((part) => [part.type, part.value]));
    const local = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
    return local - Math.floor(instant / 1000) * 1000;
}

/**
 * Midnight in Europe/Berlin at the start of a calendar day
 *
 * @param date the day (`YYYY-MM-DD`)
 * @param addDays days to move from it
 *
 * @returns the instant (epoch ms)
 */
function berlinMidnight(date: string, addDays = 0): number {
    const [year, month, day] = date.split("-").map(Number);
    const utcMidnight = Date.UTC(year, month - 1, day + addDays);
    const guess = utcMidnight - berlinOffset(utcMidnight);
    return utcMidnight - berlinOffset(guess);
}

/**
 * Starts of the order intake segments of a period, followed by the period's end
 *
 * @param period the period
 * @param size the segment size
 *
 * @returns the segment boundaries (epoch ms)
 */
function segmentBoundaries(period: Period, size: SegmentSize): number[] {
    const end = berlinMidnight(period.to, 1);
    const boundaries = [];
    if (size === "1d") {
        for (
            let day = 0, start = berlinMidnight(period.from);
            start < end;
            start = berlinMidnight(period.from, ++day)
        ) {
            boundaries.push(start);
        }
    } else {
        for (let start = berlinMidnight(period.from); start < end; start += SEGMENT_MS[size]) boundaries.push(start);
    }
    boundaries.push(end);
    return boundaries;
}

/**
 * The segment an instant within the boundaries falls into
 *
 * @param boundaries segment starts followed by the end
 * @param instant epoch ms
 *
 * @returns the index of the segment
 */
function segmentIndex(boundaries: number[], instant: number): number {
    let low = 0;
    let high = boundaries.length - 2;
    while (low < high) {
        const middle = Math.ceil((low + high) / 2);
        if (boundaries[middle] <= instant) low = middle;
        else high = middle - 1;
    }
    return low;
}

/**
 * The finest segment size that splits a period into at most 200 segments
 *
 * @param period the period
 *
 * @returns the segment size
 */
export function autoSegmentSize(period: Period): SegmentSize {
    return SEGMENT_SIZES.find((size) => segmentBoundaries(period, size).length - 1 <= MAX_SEGMENTS) ?? "1d";
}

/**
 * Identity of a position's Item
 *
 * @param position the position
 *
 * @returns the Item uuid, or `deleted:<name snapshot>` for a deleted Item
 */
function itemKey(position: StatisticsPosition): string {
    return position.item ?? `deleted:${position.name}`;
}

/**
 * Chart values of a set of positions
 *
 * @param positions the positions of one chart point
 * @param options the selection and measure
 *
 * @returns the values
 */
function chartValues(positions: StatisticsPosition[], options: StatisticsOptions): ChartValues {
    const selected = positions.filter((position) => options.selectedItems.includes(itemKey(position)));
    const main = selected.filter((position) => position.status !== "Cancelled");
    const items: Record<string, number> = {};
    for (const key of new Set(main.map(itemKey))) {
        items[key] = measure(
            main.filter((position) => itemKey(position) === key),
            options.measure,
        );
    }
    return {
        items,
        total: measure(main, options.measure),
        cancelled: measure(selected.filter(isCancelledOneByOne), options.measure),
        calledOff: measure(selected.filter(isCalledOff), options.measure),
    };
}

/**
 * Whether a position's order was cancelled on its own, not with its pickup day
 *
 * @param position the position
 *
 * @returns whether it counts as "storniert"
 */
function isCancelledOneByOne(position: StatisticsPosition): boolean {
    return position.status === "Cancelled" && !position.called_off;
}

/**
 * Whether a position's order was cancelled because its pickup day is Called Off
 *
 * @param position the position
 *
 * @returns whether it counts as "abgesagt"
 */
function isCalledOff(position: StatisticsPosition): boolean {
    return position.status === "Cancelled" && position.called_off;
}

/**
 * A measure over positions
 *
 * @param positions the positions
 * @param what the measure
 *
 * @returns units, distinct orders or Order Value in euro cents
 */
function measure(positions: StatisticsPosition[], what: Measure): number {
    switch (what) {
        case "units":
            return positions.reduce((sum, position) => sum + position.quantity, 0);
        case "orderValue":
            return positions.reduce((sum, position) => sum + position.quantity * position.price_cents, 0);
        case "orders":
            return new Set(positions.map((position) => position.order)).size;
    }
}

/**
 * Item table rows, by units descending, then by name
 *
 * @param positions the positions placed in the period
 *
 * @returns one row per Item
 */
function itemRows(positions: StatisticsPosition[]): ItemRow[] {
    const groups = new Map<string, StatisticsPosition[]>();
    for (const position of positions) {
        const key = itemKey(position);
        groups.set(key, [...(groups.get(key) ?? []), position]);
    }
    return [...groups].map(([key, group]) => itemRow(key, group)).sort(byUnitsThenName);
}

/**
 * The item table row of one Item
 *
 * @param key the Item's identity
 * @param positions all its positions
 *
 * @returns the row
 */
function itemRow(key: string, positions: StatisticsPosition[]): ItemRow {
    const [first] = positions;
    const main = positions.filter((position) => position.status !== "Cancelled");
    return {
        key,
        name: first.item_name ?? first.name,
        deleted: !first.item,
        category: first.category ?? null,
        units: measure(main, "units"),
        orders: measure(main, "orders"),
        orderValueCents: measure(main, "orderValue"),
        cancelledUnits: measure(positions.filter(isCancelledOneByOne), "units"),
        calledOffUnits: measure(positions.filter(isCalledOff), "units"),
    };
}

/**
 * Order of item table rows: units descending, then name
 *
 * @param a one row
 * @param b another row
 *
 * @returns the comparison
 */
function byUnitsThenName(a: ItemRow, b: ItemRow): number {
    return b.units - a.units || a.name.localeCompare(b.name, "de");
}

/**
 * The Items with the most of a measure
 *
 * @param rows the item table rows
 * @param what the measure
 *
 * @returns the keys of up to 5 Items, the highest first
 */
function topItems(rows: ItemRow[], what: Measure): string[] {
    const value = (row: ItemRow) =>
        what === "units" ? row.units : what === "orders" ? row.orders : row.orderValueCents;
    return rows
        .filter((row) => value(row) > 0)
        .sort((a, b) => value(b) - value(a) || a.name.localeCompare(b.name, "de"))
        .slice(0, TOP_ITEMS)
        .map((row) => row.key);
}

/**
 * Chart points per pickup day in the period, by date
 *
 * @param positions the positions in the category filter
 * @param options the period, selection and measure
 *
 * @returns one point per pickup day that has positions
 */
function pickupDays(positions: StatisticsPosition[], options: StatisticsOptions): PickupDayPoint[] {
    const { from, to } = options.period;
    const days = new Map<string, StatisticsPosition[]>();
    for (const position of positions) {
        if (position.pickup_date < from || position.pickup_date > to) continue;
        days.set(position.pickup_date, [...(days.get(position.pickup_date) ?? []), position]);
    }
    return [...days]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, day]) => ({
            date,
            open: day.some((position) => !position.dispatched),
            isCalledOff: day.every((position) => position.called_off),
            ...chartValues(day, options),
        }));
}

/**
 * The Deadline distance histogram
 *
 * @param positions the positions placed in the period
 * @param options the selection and measure
 *
 * @returns all buckets, shortest distance first, or none without positions
 */
function deadlineDistance(positions: StatisticsPosition[], options: StatisticsOptions): DeadlineBucket[] {
    if (positions.length === 0) return [];
    return DEADLINE_BUCKETS.map(({ bucket, from, to }) => {
        const inBucket = positions.filter((position) => {
            const distance = Date.parse(position.deadline) - Date.parse(position.ordered_at);
            return (from === undefined || distance >= from) && (to === undefined || distance < to);
        });
        const { items, total } = chartValues(inBucket, options);
        return { bucket, items, total };
    });
}

/**
 * Aggregate statistics positions into the series, buckets and rows of the Statistik page
 *
 * @param positions positions from the statistics endpoint
 * @param options period, segment size, measure, Item selection and category filter
 *
 * @returns the aggregated statistics
 */
export function aggregateStatistics(positions: StatisticsPosition[], options: StatisticsOptions): Statistics {
    const segmentSize = options.segmentSize === "auto" ? autoSegmentSize(options.period) : options.segmentSize;
    const boundaries = segmentBoundaries(options.period, segmentSize);
    const periodStart = boundaries[0];
    const periodEnd = boundaries[boundaries.length - 1];
    const inCategory =
        options.category === null
            ? positions
            : positions.filter((position) => position.category?.uuid === options.category);
    const placed = inCategory.filter((position) => {
        const at = Date.parse(position.ordered_at);
        return at >= periodStart && at < periodEnd;
    });

    const intake: IntakeSegment[] = [];
    if (placed.length > 0) {
        const segments: StatisticsPosition[][] = boundaries.slice(1).map(() => []);
        for (const position of placed) {
            segments[segmentIndex(boundaries, Date.parse(position.ordered_at))].push(position);
        }
        segments.forEach((inSegment, i) =>
            intake.push({ start: boundaries[i], end: boundaries[i + 1], ...chartValues(inSegment, options) }),
        );
    }

    const items = itemRows(placed);

    return {
        segmentSize,
        intake,
        pickupDays: pickupDays(inCategory, options),
        deadlineDistance: deadlineDistance(placed, options),
        items,
        topItems: topItems(items, options.measure),
    };
}
