import { PhoneIcon } from "@heroicons/react/16/solid";
import { createFileRoute } from "@tanstack/react-router";
import React from "react";
import { useTranslation } from "react-i18next";
import {
    Button,
    EmptyState,
    Heading,
    Link,
    Skeleton,
    StackedList,
    StackedListFlexRow,
    StackedListDescription,
    StackedListItem,
    StackedListTitle,
    Strong,
    Text,
} from "components";
import { Api } from "src/api/api";
import { FullOrder } from "src/api/generated";
import { OrderStatusBadge } from "src/components/order-status-badge";
import { formatDate } from "src/utils/dates";
import { formatPrice } from "src/utils/price";

/**
 * End of the pickup day: what is still standing, and who to call about it
 *
 * @returns the page
 */
function Closing() {
    const { date } = Route.useParams();
    const [t] = useTranslation("verkauf");
    const [tg] = useTranslation();
    const [orders, setOrders] = React.useState<FullOrder[]>();

    React.useEffect(() => {
        Api.verkauf.orders({ pickup_date: date }).then((r) => setOrders(r.orders));
    }, [date]);

    if (orders === undefined) {
        return <Skeleton variant={"card"} />;
    }

    const relevant = orders.filter((order) => order.status !== "Cancelled");
    const open = relevant.filter((order) => order.status !== "PickedUp");
    const done = relevant.length - open.length;

    return (
        <div className={"flex flex-col gap-6"}>
            <Heading>{t("heading.closing", { date: formatDate(date) })}</Heading>

            <Text>
                <Strong>{t("label.done-count", { done, total: relevant.length })}</Strong>
            </Text>

            {open.length === 0 ? (
                <EmptyState title={t("label.closing-clear")} />
            ) : (
                <>
                    {/* Everything left here was paid for at the bakery but never
                        collected — the contact data is the whole point of the view. */}
                    <Text>{t("description.closing-open")}</Text>
                    <StackedList>
                        {open.map((order) => (
                            <StackedListFlexRow key={order.uuid}>
                                <StackedListItem>
                                    <StackedListTitle>
                                        <Link
                                            href={"/verkauf/order/$orderId"}
                                            params={{ orderId: order.uuid }}
                                            className={"font-mono tracking-widest"}
                                        >
                                            {order.pickup_code}
                                        </Link>{" "}
                                        {order.customer_name}
                                    </StackedListTitle>
                                    <StackedListDescription>
                                        {[order.phone, order.email].filter(Boolean).join(" · ")}
                                    </StackedListDescription>
                                </StackedListItem>
                                <div className={"flex items-center gap-3"}>
                                    <Text>{formatPrice(order.total_cents)}</Text>
                                    <OrderStatusBadge status={order.status} />
                                    {order.phone && (
                                        <Button plain href={`tel:${order.phone}`}>
                                            <PhoneIcon />
                                            {t("button.call")}
                                        </Button>
                                    )}
                                </div>
                            </StackedListFlexRow>
                        ))}
                    </StackedList>
                </>
            )}

            <div className={"flex gap-2"}>
                <Button plain href={"/verkauf"}>
                    {t("button.back-to-orders")}
                </Button>
                <Button plain href={"/verkauf/beschaffung/$date"} params={{ date }}>
                    {tg("button.procurement")}
                </Button>
            </div>
        </div>
    );
}

export const Route = createFileRoute("/_auth/verkauf/tagesabschluss/$date")({
    component: Closing,
});
