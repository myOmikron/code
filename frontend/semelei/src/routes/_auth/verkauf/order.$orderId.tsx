import { CheckCircleIcon, ShoppingBagIcon } from "@heroicons/react/24/solid";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import React from "react";
import { useTranslation } from "react-i18next";
import {
    BackButton,
    Button,
    ConfirmDialog,
    DescriptionDetails,
    DescriptionList,
    DescriptionTerm,
    Divider,
    Heading,
    Skeleton,
    Strong,
    Subheading,
    Text,
} from "components";
import { Api } from "src/api/api";
import { FullOrder } from "src/api/generated";
import { OrderStatusBadge } from "src/components/order-status-badge";
import { PackingRow } from "src/components/packing-row";
import { formatDate } from "src/utils/dates";
import { formatPrice } from "src/utils/price";

/**
 * Packing view of a single order: per-position checkboxes + status actions
 *
 * @returns the page
 */
function OrderDetail() {
    const { orderId } = Route.useParams();
    const [t] = useTranslation("verkauf");
    const navigate = useNavigate();
    const [order, setOrder] = React.useState<FullOrder>();
    const [confirm, setConfirm] = React.useState<"cancel" | "picked-up">();

    const fetchOrder = React.useCallback(() => {
        Api.verkauf.order(orderId).then(setOrder);
    }, [orderId]);

    React.useEffect(fetchOrder, [fetchOrder]);

    if (!order) {
        return <Skeleton variant={"card"} />;
    }

    /**
     * Toggle a position's packed state (optimistic update)
     *
     * @param positionUuid the position to toggle
     * @param packed the new state
     */
    async function setPacked(positionUuid: string, packed: boolean) {
        setOrder(
            (current) =>
                current && {
                    ...current,
                    positions: current.positions.map((p) => (p.uuid === positionUuid ? { ...p, packed } : p)),
                },
        );
        await Api.verkauf.setPacked(positionUuid, packed);
    }

    /**
     * Advance the order's status
     *
     * @param status the new status
     */
    async function setStatus(status: FullOrder["status"]) {
        const updated = await Api.verkauf.setStatus(order!.uuid, status);
        setOrder(updated);
    }

    return (
        <div className={"flex flex-col gap-6"}>
            <div className={"flex items-center justify-between"}>
                <BackButton onClick={() => void navigate({ to: "/verkauf" })}>{t("heading.orders")}</BackButton>
                <OrderStatusBadge status={order.status} />
            </div>

            <div>
                <Heading>
                    <span className={"font-mono"}>{order.pickup_code}</span> — {order.customer_name}
                </Heading>
                <Text>{formatDate(order.pickup_date)}</Text>
            </div>

            <DescriptionList>
                {order.phone && (
                    <>
                        <DescriptionTerm>{t("label.phone")}</DescriptionTerm>
                        <DescriptionDetails>
                            <a href={`tel:${order.phone}`}>{order.phone}</a>
                        </DescriptionDetails>
                    </>
                )}
                {order.email && (
                    <>
                        <DescriptionTerm>{t("label.email")}</DescriptionTerm>
                        <DescriptionDetails>
                            <a href={`mailto:${order.email}`}>{order.email}</a>
                        </DescriptionDetails>
                    </>
                )}
                {order.note && (
                    <>
                        <DescriptionTerm>{t("label.note")}</DescriptionTerm>
                        <DescriptionDetails>{order.note}</DescriptionDetails>
                    </>
                )}
                <DescriptionTerm>{t("label.placed-at")}</DescriptionTerm>
                <DescriptionDetails>{formatDate(order.created_at)}</DescriptionDetails>
            </DescriptionList>

            <div className={"flex flex-col gap-3"}>
                <Subheading>{t("heading.packing-list")}</Subheading>
                {(order.status === "Open" || order.status === "Ready") && <Text>{t("description.packing-hint")}</Text>}
                <div className={"flex flex-col gap-2"}>
                    {order.positions.map((position) => (
                        <PackingRow
                            key={position.uuid}
                            position={position}
                            disabled={order.status !== "Open" && order.status !== "Ready"}
                            onToggle={(packed) => void setPacked(position.uuid, packed)}
                        />
                    ))}
                </div>
                <Divider />
                <div className={"flex items-center justify-between text-lg"}>
                    <Text>{t("label.total")}</Text>
                    <Strong>{formatPrice(order.total_cents)}</Strong>
                </div>
            </div>

            {/* Primary next step — one big, obvious button */}
            <div className={"flex flex-col gap-3"}>
                {order.status === "Open" && (
                    <Button color={"blue"} className={"w-full py-4 text-lg"} onClick={() => void setStatus("Ready")}>
                        <ShoppingBagIcon />
                        {t("button.mark-ready")}
                    </Button>
                )}
                {order.status === "Ready" && (
                    <Button color={"blue"} className={"w-full py-4 text-lg"} onClick={() => setConfirm("picked-up")}>
                        <CheckCircleIcon />
                        {t("button.mark-picked-up")}
                    </Button>
                )}
                {(order.status === "Open" || order.status === "Ready") && (
                    <Button plain className={"w-full"} onClick={() => setConfirm("cancel")}>
                        {t("button.cancel-order")}
                    </Button>
                )}
            </div>

            <ConfirmDialog
                open={confirm === "cancel"}
                onClose={() => setConfirm(undefined)}
                onConfirm={async () => {
                    await setStatus("Cancelled");
                    setConfirm(undefined);
                }}
                title={t("heading.confirm-cancel")}
                description={t("description.confirm-cancel", {
                    code: order.pickup_code,
                    name: order.customer_name,
                })}
            />
            <ConfirmDialog
                open={confirm === "picked-up"}
                onClose={() => setConfirm(undefined)}
                onConfirm={async () => {
                    await setStatus("PickedUp");
                    setConfirm(undefined);
                }}
                title={t("heading.confirm-picked-up")}
                description={t("description.confirm-picked-up", {
                    code: order.pickup_code,
                })}
                confirmColor={"emerald"}
            />
        </div>
    );
}

export const Route = createFileRoute("/_auth/verkauf/order/$orderId")({
    component: OrderDetail,
});
