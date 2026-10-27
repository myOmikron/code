import { describe, expect, test } from "vitest";
import { StatisticsPosition } from "src/api/generated";
import {
    aggregateStatistics,
    autoSegmentSize,
    sortItemRows,
    StatisticsOptions,
    assignColorSlots,
    quickPeriod,
    zoomPeriod,
} from "src/utils/statistics";

const BREAD = "00000000-0000-0000-0000-00000000000b";
const ROLL = "00000000-0000-0000-0000-00000000000c";

const OPTIONS: StatisticsOptions = {
    period: { from: "2026-07-01", to: "2026-07-01" },
    segmentSize: "auto",
    measure: "units",
    selectedItems: [],
    category: null,
};

/**
 * A position of an Open order placed on 2026-07-01 10:00 Berlin time, picked up on 2026-07-03
 *
 * @param overrides fields that differ from the default
 *
 * @returns the position
 */
function position(overrides: Partial<StatisticsPosition> = {}): StatisticsPosition {
    return {
        order: "order-1",
        ordered_at: "2026-07-01T08:00:00Z",
        status: "Open",
        pickup_date: "2026-07-03",
        deadline: "2026-07-02T16:00:00Z",
        dispatched: false,
        called_off: false,
        item: BREAD,
        item_name: "Bauernbrot",
        category: { uuid: "cat-bread", name: "Brot" },
        name: "Bauernbrot",
        quantity: 1,
        price_cents: 350,
        ...overrides,
    };
}

describe("aggregateStatistics", () => {
    test("empty input yields empty outputs", () => {
        const stats = aggregateStatistics([], OPTIONS);

        expect(stats.intake).toEqual([]);
        expect(stats.pickupDays).toEqual([]);
        expect(stats.deadlineDistance).toEqual([]);
        expect(stats.items).toEqual([]);
        expect(stats.topItems).toEqual([]);
    });
});

describe("order intake", () => {
    const selected = { ...OPTIONS, selectedItems: [BREAD] };

    test("hourly segments on the spring daylight saving day: 23 hours, 02:00 is skipped", () => {
        const placedAt0330 = position({ ordered_at: "2026-03-29T01:30:00Z", quantity: 2 });
        const { intake } = aggregateStatistics([placedAt0330], {
            ...selected,
            period: { from: "2026-03-29", to: "2026-03-29" },
            segmentSize: "1h",
        });

        expect(intake).toHaveLength(23);
        expect(intake[0].start).toBe(Date.parse("2026-03-28T23:00:00Z"));
        expect(intake[22].end).toBe(Date.parse("2026-03-29T22:00:00Z"));
        expect(intake[2].start).toBe(Date.parse("2026-03-29T01:00:00Z"));
        expect(intake[2].items).toEqual({ [BREAD]: 2 });
        expect(intake[2].total).toBe(2);
        expect(intake.reduce((sum, segment) => sum + segment.total, 0)).toBe(2);
    });

    test("hourly segments on the autumn daylight saving day: 25 hours, 02:00 twice", () => {
        const { intake } = aggregateStatistics([position({ ordered_at: "2026-10-25T01:10:00Z" })], {
            ...selected,
            period: { from: "2026-10-25", to: "2026-10-25" },
            segmentSize: "1h",
        });

        expect(intake).toHaveLength(25);
        expect(intake[0].start).toBe(Date.parse("2026-10-24T22:00:00Z"));
        expect(intake[24].end).toBe(Date.parse("2026-10-25T23:00:00Z"));
        expect(intake[3].start).toBe(Date.parse("2026-10-25T01:00:00Z"));
        expect(intake[3].total).toBe(1);
    });

    test("daily segments start at Berlin midnight on both sides of a transition", () => {
        const lateEvening = position({ ordered_at: "2026-10-25T22:30:00Z" });
        const { intake } = aggregateStatistics([lateEvening], {
            ...selected,
            period: { from: "2026-10-24", to: "2026-10-26" },
            segmentSize: "1d",
        });

        expect(intake.map((segment) => new Date(segment.start).toISOString())).toEqual([
            "2026-10-23T22:00:00.000Z",
            "2026-10-24T22:00:00.000Z",
            "2026-10-25T23:00:00.000Z",
        ]);
        expect(intake.map((segment) => segment.total)).toEqual([0, 1, 0]);
    });

    test("positions placed outside the period are left out", () => {
        const { intake } = aggregateStatistics(
            [position({ ordered_at: "2026-06-30T21:59:59Z" }), position({ ordered_at: "2026-07-01T22:00:00Z" })],
            selected,
        );

        expect(intake.reduce((sum, segment) => sum + segment.total, 0)).toBe(0);
    });
});

describe("zoomed range", () => {
    const zoom = { start: Date.parse("2026-07-01T08:00:00Z"), end: Date.parse("2026-07-01T11:00:00Z") };
    const options = { ...OPTIONS, period: zoom, selectedItems: [BREAD] };

    test("the order intake covers exactly the range, in automatic 10 minute segments", () => {
        const stats = aggregateStatistics(
            [
                position({ ordered_at: "2026-07-01T07:59:59Z" }),
                position({ order: "order-2", ordered_at: "2026-07-01T08:05:00Z", quantity: 2 }),
                position({ order: "order-3", ordered_at: "2026-07-01T10:59:59Z", quantity: 3 }),
                position({ order: "order-4", ordered_at: "2026-07-01T11:00:00Z" }),
            ],
            options,
        );

        expect(stats.segmentSize).toBe("10min");
        expect(stats.intake).toHaveLength(18);
        expect(stats.intake[0]).toMatchObject({ start: zoom.start, end: zoom.start + 10 * 60 * 1000, total: 2 });
        expect(stats.intake[17]).toMatchObject({ end: zoom.end, total: 3 });
        expect(stats.items.map((row) => row.units)).toEqual([5]);
    });

    test("per pickup day keeps the pickup days of the Berlin days the range touches", () => {
        const { pickupDays } = aggregateStatistics(
            [position({ pickup_date: "2026-07-01" }), position({ order: "order-2", pickup_date: "2026-07-02" })],
            options,
        );

        expect(pickupDays.map((day) => day.date)).toEqual(["2026-07-01"]);
    });
});

describe("counting rules", () => {
    const daily = { ...OPTIONS, segmentSize: "1d" as const, selectedItems: [BREAD, ROLL] };
    const roll = { item: ROLL, item_name: "Semmel", name: "Semmel", price_cents: 60 };

    test("cancelled orders are left out of the main numbers and split into storniert and abgesagt", () => {
        const [day] = aggregateStatistics(
            [
                position({ quantity: 2 }),
                position({ order: "order-2", status: "Cancelled", quantity: 3 }),
                position({ order: "order-3", status: "Cancelled", called_off: true, quantity: 4 }),
            ],
            daily,
        ).intake;

        expect(day).toMatchObject({ items: { [BREAD]: 2 }, total: 2, cancelled: 3, calledOff: 4 });
    });

    test("Order Value is the price snapshot times the quantity", () => {
        const [day] = aggregateStatistics(
            [position({ quantity: 3, price_cents: 350 }), position({ ...roll, quantity: 2 })],
            { ...daily, measure: "orderValue" },
        ).intake;

        expect(day).toMatchObject({ items: { [BREAD]: 1050, [ROLL]: 120 }, total: 1170 });
    });

    test("orders count orders with at least one selected Item, once", () => {
        const [day] = aggregateStatistics(
            [
                position({ quantity: 2 }),
                position(roll),
                position({ ...roll, order: "order-2" }),
                position({ order: "order-3", item: "cake", item_name: "Kuchen", name: "Kuchen" }),
                position({ order: "order-4", status: "Cancelled" }),
                position({ order: "order-4", status: "Cancelled", ...roll }),
            ],
            { ...daily, measure: "orders" },
        ).intake;

        expect(day).toMatchObject({ items: { [BREAD]: 1, [ROLL]: 2 }, total: 2, cancelled: 1, calledOff: 0 });
    });
});

describe("item table", () => {
    test("one row per Item with its totals, independent of the Item selection", () => {
        const { items } = aggregateStatistics(
            [
                position({ quantity: 2, price_cents: 350 }),
                position({ order: "order-2", quantity: 1, price_cents: 300 }),
                position({ order: "order-3", status: "Cancelled", quantity: 5 }),
                position({ order: "order-4", status: "Cancelled", called_off: true, quantity: 7 }),
                position({ item: ROLL, item_name: "Semmel", name: "Semmel", quantity: 10, price_cents: 60 }),
            ],
            OPTIONS,
        );

        expect(items).toEqual([
            {
                key: ROLL,
                name: "Semmel",
                deleted: false,
                category: { uuid: "cat-bread", name: "Brot" },
                units: 10,
                orders: 1,
                orderValueCents: 600,
                cancelledUnits: 0,
                calledOffUnits: 0,
            },
            {
                key: BREAD,
                name: "Bauernbrot",
                deleted: false,
                category: { uuid: "cat-bread", name: "Brot" },
                units: 3,
                orders: 2,
                orderValueCents: 1000,
                cancelledUnits: 5,
                calledOffUnits: 7,
            },
        ]);
    });

    test("a renamed Item stays one row under its current name", () => {
        const { items } = aggregateStatistics(
            [
                position({ name: "Landbrot", item_name: "Bauernbrot" }),
                position({ order: "order-2", name: "Bauernbrot", item_name: "Bauernbrot" }),
            ],
            OPTIONS,
        );

        expect(items).toHaveLength(1);
        expect(items[0]).toMatchObject({ key: BREAD, name: "Bauernbrot", deleted: false, units: 2 });
    });

    test("deleted Items are grouped by their name snapshot and marked deleted", () => {
        const deleted = { item: null, item_name: null, category: null };
        const { items } = aggregateStatistics(
            [
                position({ ...deleted, name: "Osterzopf", quantity: 2 }),
                position({ ...deleted, order: "order-2", name: "Osterzopf" }),
                position({ ...deleted, name: "Stollen" }),
            ],
            OPTIONS,
        );

        expect(items.map(({ name, deleted, units, category }) => ({ name, deleted, units, category }))).toEqual([
            { name: "Osterzopf", deleted: true, units: 3, category: null },
            { name: "Stollen", deleted: true, units: 1, category: null },
        ]);
    });

    test("follows the placement time, not the pickup date", () => {
        const { items } = aggregateStatistics(
            [position({ ordered_at: "2026-06-29T08:00:00Z", pickup_date: "2026-07-01" })],
            OPTIONS,
        );

        expect(items).toEqual([]);
    });
    test("sorts by any column, ties by name", () => {
        const { items } = aggregateStatistics(
            [
                position({ quantity: 2, price_cents: 350 }),
                position({ item: ROLL, item_name: "Semmel", name: "Semmel", quantity: 10, price_cents: 60 }),
                position({
                    item: null,
                    item_name: null,
                    category: null,
                    name: "Apfelkuchen",
                    quantity: 2,
                    price_cents: 100,
                }),
            ],
            OPTIONS,
        );

        const names = (rows: typeof items) => rows.map((row) => row.name);
        expect(names(sortItemRows(items, "orderValueCents", "desc"))).toEqual(["Bauernbrot", "Semmel", "Apfelkuchen"]);
        expect(names(sortItemRows(items, "units", "asc"))).toEqual(["Apfelkuchen", "Bauernbrot", "Semmel"]);
        expect(names(sortItemRows(items, "name", "desc"))).toEqual(["Semmel", "Bauernbrot", "Apfelkuchen"]);
    });
});

describe("top Items", () => {
    /**
     * A position of a numbered Item
     *
     * @param n the Item number
     * @param quantity units
     * @param priceCents price snapshot
     *
     * @returns the position
     */
    function ofItem(n: number, quantity: number, priceCents = 100) {
        return position({
            item: `item-${n}`,
            item_name: `Item ${n}`,
            name: `Item ${n}`,
            quantity,
            price_cents: priceCents,
        });
    }

    test("are the 5 Items with the most of the measure in the period", () => {
        const positions = [ofItem(1, 1), ofItem(2, 6), ofItem(3, 3), ofItem(4, 5), ofItem(5, 2), ofItem(6, 4, 1000)];

        expect(aggregateStatistics(positions, OPTIONS).topItems).toEqual([
            "item-2",
            "item-4",
            "item-6",
            "item-3",
            "item-5",
        ]);
        expect(aggregateStatistics(positions, { ...OPTIONS, measure: "orderValue" }).topItems[0]).toBe("item-6");
    });

    test("leave out cancelled orders", () => {
        const positions = [ofItem(1, 1), position({ ...ofItem(2, 9), status: "Cancelled" })];

        expect(aggregateStatistics(positions, OPTIONS).topItems).toEqual(["item-1"]);
    });

    test("are what the charts show when the selection is the top preset", () => {
        const positions = [ofItem(1, 1), ofItem(2, 6), ofItem(3, 3), ofItem(4, 5), ofItem(5, 2), ofItem(6, 4)];

        const { intake } = aggregateStatistics(positions, {
            ...OPTIONS,
            segmentSize: "1d",
            selectedItems: "top",
        });

        expect(Object.keys(intake[0].items).sort()).toEqual(["item-2", "item-3", "item-4", "item-5", "item-6"]);
        expect(intake[0].total).toBe(20);
    });
});

describe("category filter", () => {
    const pastry = {
        item: ROLL,
        item_name: "Croissant",
        name: "Croissant",
        category: { uuid: "cat-pastry", name: "Gebäck" },
    };
    const positions = [
        position({ quantity: 2 }),
        position({ ...pastry, quantity: 3 }),
        position({ item: null, item_name: null, category: null, name: "Osterzopf" }),
    ];
    const pastryOnly = { ...OPTIONS, segmentSize: "1d" as const, selectedItems: [BREAD, ROLL], category: "cat-pastry" };

    test("restricts charts, table and top Items to the category", () => {
        const stats = aggregateStatistics(positions, pastryOnly);

        expect(stats.intake[0]).toMatchObject({ items: { [ROLL]: 3 }, total: 3 });
        expect(stats.items.map((row) => row.key)).toEqual([ROLL]);
        expect(stats.topItems).toEqual([ROLL]);
    });

    test("null shows every category and deleted Items", () => {
        const stats = aggregateStatistics(positions, { ...pastryOnly, category: null });

        expect(stats.items).toHaveLength(3);
    });

    test("offers every category of the period to choose from, whatever is filtered, by name", () => {
        const stats = aggregateStatistics([...positions, position({ quantity: 5 })], pastryOnly);

        expect(stats.categories).toEqual([
            { uuid: "cat-bread", name: "Brot" },
            { uuid: "cat-pastry", name: "Gebäck" },
        ]);
    });
});

describe("per pickup day", () => {
    const period = { from: "2026-07-01", to: "2026-07-03" };
    const options = { ...OPTIONS, period, selectedItems: [BREAD] };

    test("groups by effective pickup date within the period, whenever the order was placed", () => {
        const { pickupDays } = aggregateStatistics(
            [
                position({ ordered_at: "2026-06-20T08:00:00Z", pickup_date: "2026-07-03", quantity: 2 }),
                position({ order: "order-2", pickup_date: "2026-07-01", dispatched: true }),
                position({ order: "order-3", pickup_date: "2026-07-04" }),
                position({ order: "order-4", pickup_date: "2026-06-30" }),
            ],
            options,
        );

        expect(pickupDays).toEqual([
            {
                date: "2026-07-01",
                open: false,
                isCalledOff: false,
                items: { [BREAD]: 1 },
                total: 1,
                cancelled: 0,
                calledOff: 0,
            },
            {
                date: "2026-07-03",
                open: true,
                isCalledOff: false,
                items: { [BREAD]: 2 },
                total: 2,
                cancelled: 0,
                calledOff: 0,
            },
        ]);
    });

    test("a Called Off day is kept and marked, its orders count as abgesagt", () => {
        const { pickupDays } = aggregateStatistics(
            [position({ status: "Cancelled", called_off: true, quantity: 4 })],
            options,
        );

        expect(pickupDays).toEqual([
            { date: "2026-07-03", open: true, isCalledOff: true, items: {}, total: 0, cancelled: 0, calledOff: 4 },
        ]);
    });
});

describe("Deadline distance", () => {
    const options = { ...OPTIONS, period: { from: "2026-06-29", to: "2026-07-02" }, selectedItems: [BREAD] };

    /**
     * A position placed some time before the default Deadline 2026-07-02 16:00 UTC
     *
     * @param before time before the Deadline as "H:MM:SS"
     * @param order the order
     *
     * @returns the position
     */
    function placedBefore(before: string, order: string) {
        const [hours, minutes, seconds] = before.split(":").map(Number);
        const deadline = Date.parse("2026-07-02T16:00:00Z");
        const at = deadline - ((hours * 60 + minutes) * 60 + seconds) * 1000;
        return position({ order, ordered_at: new Date(at).toISOString() });
    }

    test("buckets edges belong to the longer bucket", () => {
        const { deadlineDistance } = aggregateStatistics(
            [
                placedBefore("0:00:00", "a"),
                placedBefore("0:59:59", "b"),
                placedBefore("1:00:00", "c"),
                placedBefore("2:59:59", "d"),
                placedBefore("3:00:00", "e"),
                placedBefore("12:00:00", "f"),
                placedBefore("23:59:59", "g"),
                placedBefore("24:00:00", "h"),
                placedBefore("47:59:59", "i"),
                placedBefore("48:00:00", "j"),
                placedBefore("72:00:00", "k"),
            ],
            options,
        );

        expect(deadlineDistance.map(({ bucket, total }) => [bucket, total])).toEqual([
            ["lt1h", 2],
            ["1to3h", 2],
            ["3to12h", 1],
            ["12to24h", 2],
            ["1to2d", 2],
            ["gt2d", 2],
        ]);
    });

    test("counts the measure of the selected Items, without cancelled orders", () => {
        const { deadlineDistance } = aggregateStatistics(
            [
                position({ quantity: 3 }),
                position({ order: "order-2", status: "Cancelled", quantity: 5 }),
                position({ order: "order-3", item: ROLL, item_name: "Semmel", name: "Semmel", quantity: 7 }),
            ],
            options,
        );

        expect(deadlineDistance.find((bucket) => bucket.bucket === "1to2d")).toEqual({
            bucket: "1to2d",
            items: { [BREAD]: 3 },
            total: 3,
        });
    });
});

describe("autoSegmentSize", () => {
    test("picks the finest size that keeps the order intake at 200 segments or fewer", () => {
        expect(autoSegmentSize({ from: "2026-07-01", to: "2026-07-01" })).toBe("10min");
        expect(autoSegmentSize({ from: "2026-07-01", to: "2026-07-02" })).toBe("30min");
        expect(autoSegmentSize({ from: "2026-07-01", to: "2026-07-04" })).toBe("30min");
        expect(autoSegmentSize({ from: "2026-07-01", to: "2026-07-05" })).toBe("1h");
        expect(autoSegmentSize({ from: "2026-07-01", to: "2026-07-08" })).toBe("1h");
        expect(autoSegmentSize({ from: "2026-07-01", to: "2026-07-09" })).toBe("1d");
        expect(autoSegmentSize({ from: "2026-06-01", to: "2026-06-30" })).toBe("1d");
    });

    test("applies the same limit to a zoomed range of instants", () => {
        const at = (iso: string) => Date.parse(iso);
        expect(autoSegmentSize({ start: at("2026-07-01T08:00:00Z"), end: at("2026-07-01T11:00:00Z") })).toBe("10min");
        expect(autoSegmentSize({ start: at("2026-07-01T08:00:00Z"), end: at("2026-07-03T08:00:00Z") })).toBe("30min");
        expect(autoSegmentSize({ start: at("2026-07-01T08:00:00Z"), end: at("2026-07-06T08:00:00Z") })).toBe("1h");
    });

    test("is used for auto, a manual size is honoured", () => {
        const period = { from: "2026-06-01", to: "2026-06-30" };
        expect(aggregateStatistics([], { ...OPTIONS, period }).segmentSize).toBe("1d");
        expect(aggregateStatistics([], { ...OPTIONS, period, segmentSize: "1h" }).segmentSize).toBe("1h");
    });
});

describe("zoomPeriod", () => {
    test("is exactly the dragged range, not widened to Berlin days", () => {
        expect(zoomPeriod(Date.parse("2026-07-01T08:00:00Z"), Date.parse("2026-07-01T11:00:00Z"))).toEqual({
            start: Date.parse("2026-07-01T08:00:00Z"),
            end: Date.parse("2026-07-01T11:00:00Z"),
        });
    });
});

describe("quickPeriod", () => {
    test("ends today in Berlin and reaches back the picked span", () => {
        const justAfterBerlinMidnight = Date.parse("2026-03-29T22:30:00Z");

        expect(quickPeriod("7d", justAfterBerlinMidnight)).toEqual({ from: "2026-03-24", to: "2026-03-30" });
        expect(quickPeriod("30d", justAfterBerlinMidnight)).toEqual({ from: "2026-03-01", to: "2026-03-30" });
        expect(quickPeriod("3m", justAfterBerlinMidnight)).toEqual({ from: "2025-12-31", to: "2026-03-30" });
        expect(quickPeriod("12m", justAfterBerlinMidnight)).toEqual({ from: "2025-03-31", to: "2026-03-30" });
    });
});

describe("assignColorSlots", () => {
    test("keeps the slot of every Item that stays selected and gives new ones the lowest free slot", () => {
        const first = assignColorSlots({}, ["a", "b", "c"]);
        expect(first).toEqual({ a: 0, b: 1, c: 2 });

        expect(assignColorSlots(first, ["c", "d", "a"])).toEqual({ a: 0, c: 2, d: 1 });
    });
});
