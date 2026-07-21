import React from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "components";
import { OrderStatus } from "src/api/generated";

const COLORS: Record<OrderStatus, "zinc" | "amber" | "lime" | "red"> = {
    Open: "amber",
    Ready: "lime",
    PickedUp: "zinc",
    Cancelled: "red",
};

/** Translation key (general namespace) per status */
export const STATUS_LABELS: Record<OrderStatus, string> = {
    Open: "label.status-open",
    Ready: "label.status-ready",
    PickedUp: "label.status-picked-up",
    Cancelled: "label.status-cancelled",
};

/**
 * The properties for {@link OrderStatusBadge}
 */
export type OrderStatusBadgeProps = {
    /** The status to render */
    status: OrderStatus;
};

/**
 * Colored badge for an order status, label from the default namespace
 *
 * @param props {@link OrderStatusBadgeProps}
 *
 * @returns the badge
 */
export function OrderStatusBadge(props: OrderStatusBadgeProps) {
    const [tg] = useTranslation();
    return <Badge color={COLORS[props.status]}>{tg(STATUS_LABELS[props.status])}</Badge>;
}
