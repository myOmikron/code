import { createFileRoute } from "@tanstack/react-router";
import React from "react";
import { useTranslation } from "react-i18next";
import {
    Badge,
    Button,
    EmptyState,
    Heading,
    Skeleton,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
    Text,
} from "components";
import { Api } from "src/api/api";
import { ProcurementSummary } from "src/api/generated";
import { downloadText, toCsv } from "src/utils/csv";
import { formatDate, formatDateTime } from "src/utils/dates";
import { formatPrice } from "src/utils/price";

/**
 * What has to be procured for one pickup day, summed per item
 *
 * @returns the page
 */
function Procurement() {
    const { date } = Route.useParams();
    const [t] = useTranslation("verkauf");
    const [tg] = useTranslation();
    const [summary, setSummary] = React.useState<ProcurementSummary | "not-found">();

    React.useEffect(() => {
        Api.verkauf
            .procurement(date)
            .then(setSummary)
            .catch(() => setSummary("not-found"));
    }, [date]);

    if (summary === undefined) {
        return <Skeleton variant={"card"} />;
    }
    if (summary === "not-found") {
        return (
            <EmptyState
                title={t("label.pickup-day-unknown")}
                action={<Button href={"/verkauf"}>{t("button.back-to-orders")}</Button>}
            />
        );
    }

    /** Download the list as a CSV for the bakery */
    function download() {
        if (summary === undefined || summary === "not-found") return;
        const csv = toCsv([
            [t("label.item"), t("label.quantity"), t("label.orders"), t("label.unit-price")],
            ...summary.positions.map((p) => [
                p.name,
                p.total_quantity,
                p.order_count,
                (p.price_cents / 100).toFixed(2).replace(".", ","),
            ]),
        ]);
        downloadText(`beschaffung-${summary.pickup_date}.csv`, csv);
    }

    return (
        <div className={"flex flex-col gap-6"}>
            <div className={"flex flex-wrap items-center justify-between gap-3"}>
                <Heading>{t("heading.procurement", { date: formatDate(summary.pickup_date) })}</Heading>
                <div className={"flex items-center gap-2"}>
                    {summary.closed ? (
                        <Badge color={"red"}>{t("label.state-closed")}</Badge>
                    ) : summary.locked ? (
                        <Badge color={"green"}>{t("label.state-final")}</Badge>
                    ) : (
                        <Badge color={"amber"}>{t("label.state-preliminary")}</Badge>
                    )}
                    <Button onClick={download} disabled={summary.positions.length === 0}>
                        {t("button.download-csv")}
                    </Button>
                </div>
            </div>

            {/* Until the deadline the list still moves — say so, so nobody
                orders at the bakery off a preliminary number. */}
            <Text>
                {summary.locked
                    ? t("description.procurement-final", { count: summary.order_count })
                    : t("description.procurement-preliminary", { date: formatDateTime(summary.deadline) })}
            </Text>

            {summary.positions.length === 0 ? (
                <EmptyState title={t("label.procurement-empty")} />
            ) : (
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableHeader>{t("label.item")}</TableHeader>
                            <TableHeader>{t("label.quantity")}</TableHeader>
                            <TableHeader>{t("label.orders")}</TableHeader>
                            <TableHeader>{t("label.sum")}</TableHeader>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {summary.positions.map((position) => (
                            <TableRow key={position.name}>
                                <TableCell>{position.name}</TableCell>
                                <TableCell className={"text-lg font-semibold"}>{position.total_quantity}</TableCell>
                                <TableCell>{position.order_count}</TableCell>
                                <TableCell>{formatPrice(position.price_cents * position.total_quantity)}</TableCell>
                            </TableRow>
                        ))}
                        <TableRow>
                            <TableCell className={"font-semibold"}>{t("label.total")}</TableCell>
                            <TableCell />
                            <TableCell />
                            <TableCell className={"font-semibold"}>{formatPrice(summary.total_cents)}</TableCell>
                        </TableRow>
                    </TableBody>
                </Table>
            )}

            <div className={"flex gap-2"}>
                <Button plain href={"/verkauf"}>
                    {t("button.back-to-orders")}
                </Button>
                <Button plain href={"/verkauf/tagesabschluss/$date"} params={{ date: summary.pickup_date }}>
                    {tg("button.closing")}
                </Button>
            </div>
        </div>
    );
}

export const Route = createFileRoute("/_auth/verkauf/beschaffung/$date")({
    component: Procurement,
});
