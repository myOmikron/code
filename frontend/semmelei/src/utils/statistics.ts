import { AdminItem, PublicCategory, StatisticsPosition } from "src/api/generated";

/** What the charts count */
export type Measure = "units" | "orders" | "orderValue";

/** Length of one order intake segment */
export type SegmentSize = "10min" | "30min" | "1h" | "1d";

/** Calendar days in Europe/Berlin, both inclusive (`YYYY-MM-DD`) */
export type Period = { from: string; to: string };

/** A range of instants (epoch ms), the end exclusive */
export type TimeRange = { start: number; end: number };

/** Inputs of {@link aggregateStatistics} */
export type StatisticsOptions = {
    /** The period of the whole page, or the range zoomed into */
    period: Period | TimeRange;
    /** Segment size of the order intake, or chosen from the period length */
    segmentSize: SegmentSize | "auto";
    /** What the charts count */
    measure: Measure;
    /** Keys ({@link ItemRow.key}) of the Items the charts show, or `"top"` for {@link Statistics.topItems} */
    selectedItems: string[] | "top";
    /** Uuid of the category to restrict everything to, null for all */
    category: string | null;
    /** The shop's Items and categories; active Items without orders in the period get a table row of zeros */
    catalog: Catalog;
};

/** The shop's Items and categories, as the Admin endpoints return them */
export type Catalog = {
    /** All Items, active or not */
    items: AdminItem[];
    /** All categories, to name the category of an Item */
    categories: PublicCategory[];
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
    category: PublicCategory | null;
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
    /** Categories of all positions, to choose the category filter from, by name */
    categories: PublicCategory[];
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
 * The instants a period or a zoomed range spans
 *
 * @param span calendar days in Europe/Berlin, or a range of instants
 *
 * @returns the range, from Berlin midnight to Berlin midnight for a period
 */
function toRange(span: Period | TimeRange): TimeRange {
    return "from" in span ? { start: berlinMidnight(span.from), end: berlinMidnight(span.to, 1) } : span;
}

/**
 * Starts of the order intake segments of a range, followed by the range's end
 *
 * Daily segments start at Berlin midnight, shorter ones at the range's start; the last segment
 * ends with the range.
 *
 * @param range the range
 * @param size the segment size
 *
 * @returns the segment boundaries (epoch ms)
 */
function segmentBoundaries(range: TimeRange, size: SegmentSize): number[] {
    const boundaries = [range.start];
    const next =
        size === "1d"
            ? (start: number) => berlinMidnight(berlinDate(start), 1)
            : (start: number) => start + SEGMENT_MS[size];
    for (let start = next(range.start); start < range.end; start = next(start)) boundaries.push(start);
    boundaries.push(range.end);
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
 * The calendar day of an instant in Europe/Berlin
 *
 * @param instant epoch ms
 *
 * @returns the day (`YYYY-MM-DD`)
 */
function berlinDate(instant: number): string {
    return new Date(instant + berlinOffset(instant)).toISOString().slice(0, 10);
}

/**
 * The range a brush drag over order intake segments selects, to zoom into
 *
 * @param start start of the first segment (epoch ms)
 * @param end end of the last segment, exclusive (epoch ms)
 *
 * @returns exactly that range
 */
export function zoomPeriod(start: number, end: number): TimeRange {
    return { start, end };
}

/** Quick picks of the period: last 7 or 30 days, last 3 or 12 months */
export type QuickPeriod = "7d" | "30d" | "3m" | "12m";

const QUICK_PERIODS: Record<QuickPeriod, { months: number; days: number }> = {
    "7d": { months: 0, days: 7 },
    "30d": { months: 0, days: 30 },
    "3m": { months: 3, days: 0 },
    "12m": { months: 12, days: 0 },
};

/**
 * The period of a quick pick, ending today in Europe/Berlin
 *
 * @param pick the quick pick
 * @param now the current instant (epoch ms)
 *
 * @returns the period
 */
export function quickPeriod(pick: QuickPeriod, now: number): Period {
    const to = berlinDate(now);
    const [year, month, day] = to.split("-").map(Number);
    const { months, days } = QUICK_PERIODS[pick];
    const from = new Date(Date.UTC(year, month - 1 - months, day - days + 1)).toISOString().slice(0, 10);
    return { from, to };
}

/**
 * The finest segment size that splits a period or zoomed range into at most 200 segments
 *
 * @param span the period or range
 *
 * @returns the segment size
 */
export function autoSegmentSize(span: Period | TimeRange): SegmentSize {
    const range = toRange(span);
    return SEGMENT_SIZES.find((size) => segmentBoundaries(range, size).length - 1 <= MAX_SEGMENTS) ?? "1d";
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

/** {@link StatisticsOptions} with the Item selection resolved to keys */
type ChartOptions = Omit<StatisticsOptions, "selectedItems"> & { selectedItems: string[] };

/**
 * Chart values of a set of positions
 *
 * @param positions the positions of one chart point
 * @param options the selection and measure
 *
 * @returns the values
 */
function chartValues(positions: StatisticsPosition[], options: ChartOptions): ChartValues {
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
 * @param positions the positions placed in the period, in the category filter
 * @param options the catalog and category filter
 *
 * @returns one row per Item ordered in the period and per other active Item in the category filter
 */
function itemRows(positions: StatisticsPosition[], options: StatisticsOptions): ItemRow[] {
    const groups = new Map<string, StatisticsPosition[]>();
    for (const position of positions) {
        const key = itemKey(position);
        groups.set(key, [...(groups.get(key) ?? []), position]);
    }
    const rows = [...groups].map(([key, group]) => itemRow(key, group));
    const categories = new Map(options.catalog.categories.map((category) => [category.uuid, category]));
    for (const item of options.catalog.items) {
        if (!item.active || groups.has(item.uuid)) continue;
        if (options.category !== null && item.category !== options.category) continue;
        rows.push({
            key: item.uuid,
            name: item.name,
            deleted: false,
            category: (item.category && categories.get(item.category)) || null,
            units: 0,
            orders: 0,
            orderValueCents: 0,
            cancelledUnits: 0,
            calledOffUnits: 0,
        });
    }
    return rows.sort(byUnitsThenName);
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

/** Columns of the item table */
export type ItemColumn = "name" | "units" | "orders" | "orderValueCents" | "cancelledUnits" | "calledOffUnits";

/**
 * Item table rows sorted by a column
 *
 * @param rows the rows
 * @param column the column to sort by
 * @param direction ascending or descending
 *
 * @returns the sorted rows, ties ordered by name
 */
export function sortItemRows(rows: ItemRow[], column: ItemColumn, direction: "asc" | "desc"): ItemRow[] {
    const sign = direction === "asc" ? 1 : -1;
    const byName = (a: ItemRow, b: ItemRow) => a.name.localeCompare(b.name, "de");
    return [...rows].sort((a, b) =>
        column === "name" ? sign * byName(a, b) : sign * (a[column] - b[column]) || byName(a, b),
    );
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
 * @returns one point per pickup day on the Berlin days the period touches that has positions
 */
function pickupDays(positions: StatisticsPosition[], options: ChartOptions): PickupDayPoint[] {
    const range = toRange(options.period);
    const from = berlinDate(range.start);
    const to = berlinDate(range.end - 1);
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
function deadlineDistance(positions: StatisticsPosition[], options: ChartOptions): DeadlineBucket[] {
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
 * The distinct categories of positions
 *
 * @param positions the positions
 *
 * @returns each category once, by name
 */
function categories(positions: StatisticsPosition[]): PublicCategory[] {
    const byUuid = new Map<string, PublicCategory>();
    for (const { category } of positions) {
        if (category) byUuid.set(category.uuid, { uuid: category.uuid, name: category.name });
    }
    return [...byUuid.values()].sort((a, b) => a.name.localeCompare(b.name, "de"));
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
    const range = toRange(options.period);
    const segmentSize = options.segmentSize === "auto" ? autoSegmentSize(range) : options.segmentSize;
    const boundaries = segmentBoundaries(range, segmentSize);
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

    const items = itemRows(placed, options);
    const top = topItems(items, options.measure);
    const chartOptions = { ...options, selectedItems: options.selectedItems === "top" ? top : options.selectedItems };

    const intake: IntakeSegment[] = [];
    if (placed.length > 0) {
        const segments: StatisticsPosition[][] = boundaries.slice(1).map(() => []);
        for (const position of placed) {
            segments[segmentIndex(boundaries, Date.parse(position.ordered_at))].push(position);
        }
        segments.forEach((inSegment, i) =>
            intake.push({ start: boundaries[i], end: boundaries[i + 1], ...chartValues(inSegment, chartOptions) }),
        );
    }

    return {
        segmentSize,
        intake,
        pickupDays: pickupDays(inCategory, chartOptions),
        deadlineDistance: deadlineDistance(placed, chartOptions),
        items,
        topItems: top,
        categories: categories(positions),
    };
}

/**
 * Colour slots of the selected Items, so that an Item keeps its colour while the selection changes
 *
 * @param previous the slots so far, by Item key
 * @param keys the Items selected now
 *
 * @returns a slot per selected Item: its previous one, or the lowest free one
 */
export function assignColorSlots(previous: Record<string, number>, keys: string[]): Record<string, number> {
    const slots: Record<string, number> = {};
    for (const key of keys) if (key in previous) slots[key] = previous[key];
    const taken = new Set(Object.values(slots));
    let free = 0;
    for (const key of keys) {
        if (key in slots) continue;
        while (taken.has(free)) free++;
        slots[key] = free;
        taken.add(free);
    }
    return slots;
}
