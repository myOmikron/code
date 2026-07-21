import { createFileRoute } from "@tanstack/react-router";
import React from "react";
import { useTranslation } from "react-i18next";
import { ChevronRightIcon } from "@heroicons/react/16/solid";
import {
    EmptyState,
    Field,
    FilterBar,
    FilterBarControl,
    FilterChip,
    FilterChipGroup,
    Heading,
    Input,
    Link,
    Skeleton,
    Subheading,
} from "components";
import { Api, IsoDate } from "src/api/api";
import { FullOrder, OrderStatus } from "src/api/generated";
import { OrderStatusBadge, STATUS_LABELS } from "src/components/order-status-badge";
import { formatDate } from "src/utils/dates";
import { formatPrice } from "src/utils/price";

const STATUS_FILTERS: Array<OrderStatus | "all"> = ["all", "Open", "Ready", "PickedUp", "Cancelled"];

/**
 * Staff order list: filter by status + pickup date, grouped by day,
 * polling every 30s and on tab focus so the list never goes stale.
 *
 * @returns the page
 */
function OrderList() {
    const [t] = useTranslation("verkauf");
    const [tg] = useTranslation();
    const [orders, setOrders] = React.useState<FullOrder[]>();
    const [status, setStatus] = React.useState<OrderStatus | "all">("Open");
    const [date, setDate] = React.useState<IsoDate | "">("");
    const [search, setSearch] = React.useState("");

    const fetchOrders = React.useCallback(() => {
        Api.verkauf
            .orders({
                status: status === "all" ? undefined : status,
                pickup_date: date === "" ? undefined : date,
            })
            .then((response) => setOrders(response.orders));
    }, [status, date]);

    React.useEffect(() => {
        fetchOrders();
        const interval = setInterval(fetchOrders, 30_000);
        /**
         * Refetch when the tab becomes visible again
         */
        const onVisible = () => {
            if (document.visibilityState === "visible") fetchOrders();
        };
        document.addEventListener("visibilitychange", onVisible);
        return () => {
            clearInterval(interval);
            document.removeEventListener("visibilitychange", onVisible);
        };
    }, [fetchOrders]);

    // Client-side search over code + customer name (the customer reads out
    // their code, or staff types part of the name).
    const needle = search.trim().toLowerCase();
    const visible = (orders ?? []).filter(
        (o) =>
            needle === "" ||
            o.pickup_code.toLowerCase().includes(needle) ||
            o.customer_name.toLowerCase().includes(needle),
    );

    // Group by pickup date (list comes sorted by pickup_date, created_at)
    const groups: Array<{ date: string; orders: FullOrder[] }> = [];
    for (const order of visible) {
        const last = groups[groups.length - 1];
        if (last && last.date === order.pickup_date) last.orders.push(order);
        else groups.push({ date: order.pickup_date, orders: [order] });
    }

    return (
        <div className={"flex flex-col gap-6"}>
            <Heading>{t("heading.orders")}</Heading>

            {/* Big search first: the common task is finding one order by its code */}
            <Input
                type={"search"}
                className={"text-lg"}
                placeholder={t("label.search-placeholder")}
                aria-label={t("label.search-placeholder")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
            />

            <FilterBar>
                <FilterChipGroup>
                    {STATUS_FILTERS.map((filter) => (
                        <FilterChip
                            key={filter}
                            active={status === filter}
                            label={filter === "all" ? t("label.filter-all") : tg(STATUS_LABELS[filter])}
                            count={orders?.filter((o) => filter === "all" || o.status === filter).length ?? 0}
                            onClick={() => setStatus(filter)}
                        />
                    ))}
                </FilterChipGroup>
                <FilterBarControl>
                    <Field>
                        <Input
                            type={"date"}
                            aria-label={t("accessibility.filter-date")}
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                        />
                    </Field>
                </FilterBarControl>
            </FilterBar>

            {orders === undefined ? (
                <Skeleton variant={"card"} />
            ) : groups.length === 0 ? (
                <EmptyState title={t("label.orders-empty")} />
            ) : (
                groups.map((group) => (
                    <div key={group.date} className={"flex flex-col gap-2"}>
                        <Subheading>{formatDate(group.date)}</Subheading>
                        <div className={"flex flex-col gap-2"}>
                            {group.orders.map((order) => (
                                <Link
                                    key={order.uuid}
                                    href={"/verkauf/order/$orderId"}
                                    params={{ orderId: order.uuid }}
                                    className={
                                        "flex items-center justify-between gap-3 rounded-[var(--radius-card)] border border-zinc-950/5 bg-[var(--surface-card)] px-4 py-4 shadow-[var(--shadow-card-sm)] transition-shadow hover:shadow-[var(--shadow-card-md)] dark:border-white/10"
                                    }
                                >
                                    <div className={"min-w-0"}>
                                        <div className={"truncate font-medium text-zinc-950 dark:text-white"}>
                                            <span className={"font-mono"}>{order.pickup_code}</span> —{" "}
                                            {order.customer_name}
                                        </div>
                                        <div className={"text-sm text-zinc-500 dark:text-zinc-400"}>
                                            {t("label.positions", {
                                                count: order.positions.length,
                                            })}{" "}
                                            · {formatPrice(order.total_cents)}
                                        </div>
                                    </div>
                                    <div className={"flex shrink-0 items-center gap-2"}>
                                        <OrderStatusBadge status={order.status} />
                                        <ChevronRightIcon className={"size-5 text-zinc-400"} />
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </div>
                ))
            )}
        </div>
    );
}

export const Route = createFileRoute("/_auth/verkauf/")({
    component: OrderList,
});
