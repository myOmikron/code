import { createFileRoute } from "@tanstack/react-router";
import React from "react";
import { useTranslation } from "react-i18next";
import {
    Button,
    CopyButton,
    DescriptionDetails,
    DescriptionList,
    DescriptionTerm,
    Divider,
    EmptyState,
    Heading,
    Skeleton,
    StackedList,
    StackedListFlexRow,
    StackedListItem,
    StackedListTitle,
    Step,
    StepBar,
    Strong,
    Text,
} from "components";
import { Api } from "src/api/api";
import { PublicOrder } from "src/api/generated";
import { OrderStatusBadge, STATUS_LABELS } from "src/components/order-status-badge";
import { formatDate } from "src/utils/dates";
import { formatPrice } from "src/utils/price";

/**
 * Map an order status onto the three-step progress bar
 *
 * @param order the order
 * @param labels translator for the status labels (default namespace)
 *
 * @returns the steps for {@link StepBar}
 */
function steps(order: PublicOrder, labels: (key: string) => string): Step[] {
    const reached = { Open: 1, Ready: 2, PickedUp: 3, Cancelled: 0 }[order.status];
    /**
     * Compute a single step's state
     *
     * @param position the step's position (1..3)
     *
     * @returns the step state
     */
    const state = (position: number): Step["state"] =>
        reached >= position ? "finished" : reached === position - 1 ? "active" : "pending";
    return [
        { label: labels(STATUS_LABELS.Open), state: state(1) },
        { label: labels(STATUS_LABELS.Ready), state: state(2) },
        { label: labels(STATUS_LABELS.PickedUp), state: state(3) },
    ];
}

/**
 * Customer-facing order status page, reachable by pickup code
 *
 * @returns the page
 */
function OrderStatus() {
    const { pickupCode } = Route.useParams();
    const [t] = useTranslation("shop");
    const [tg] = useTranslation();
    const [order, setOrder] = React.useState<PublicOrder | "not-found">();

    React.useEffect(() => {
        Api.shop
            .orderStatus(pickupCode)
            .then(setOrder)
            .catch(() => setOrder("not-found"));
    }, [pickupCode]);

    if (order === undefined) {
        return <Skeleton variant={"card"} />;
    }
    if (order === "not-found") {
        return (
            <EmptyState
                title={t("label.order-not-found")}
                action={<Button href={"/"}>{t("button.back-to-shop")}</Button>}
            />
        );
    }

    return (
        <div className={"mx-auto flex w-full max-w-xl flex-col gap-6"}>
            <div className={"flex items-center justify-between"}>
                <Heading>{t("heading.order")}</Heading>
                <OrderStatusBadge status={order.status} />
            </div>

            <div className={"flex flex-col gap-2"}>
                <Text>{t("description.pickup-code")}</Text>
                <div className={"flex items-center gap-2"}>
                    <Strong className={"font-mono text-2xl tracking-widest"}>{order.pickup_code}</Strong>
                    <CopyButton value={window.location.href} label={t("accessibility.copy-link")} />
                </div>
            </div>

            {order.status !== "Cancelled" && <StepBar steps={steps(order, tg)} />}

            <DescriptionList>
                <DescriptionTerm>{t("label.pickup-date")}</DescriptionTerm>
                <DescriptionDetails>{formatDate(order.pickup_date)}</DescriptionDetails>
            </DescriptionList>

            <div className={"flex flex-col gap-2"}>
                <Text>{t("label.positions")}</Text>
                <StackedList>
                    {order.positions.map((position, idx) => (
                        <StackedListFlexRow key={idx}>
                            <StackedListItem>
                                <StackedListTitle>
                                    {position.quantity} × {position.name}
                                </StackedListTitle>
                            </StackedListItem>
                            <Text>{formatPrice(position.price_cents * position.quantity)}</Text>
                        </StackedListFlexRow>
                    ))}
                </StackedList>
                <Divider />
                <div className={"flex items-center justify-between"}>
                    <Text>{t("label.total")}</Text>
                    <Strong>{formatPrice(order.total_cents)}</Strong>
                </div>
            </div>

            <Button plain href={"/"}>
                {t("button.back-to-shop")}
            </Button>
        </div>
    );
}

export const Route = createFileRoute("/_shop/order/$pickupCode")({
    component: OrderStatus,
});
