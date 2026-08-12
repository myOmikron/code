import { createFileRoute, useNavigate } from "@tanstack/react-router";
import React from "react";
import { useTranslation } from "react-i18next";
import { Button, Field, Form, Heading, Input, Label, PrimaryButton, Text } from "components";
import { Api } from "src/api/api";
import { QrScanner } from "src/components/qr-scanner";

/**
 * Pull the pickup code out of whatever the QR code contained.
 *
 * The customer's page encodes its own url, but a code typed by hand is just
 * the code — accept both rather than making staff care which is which.
 *
 * @param value the scanned text
 *
 * @returns the pickup code
 */
function pickupCodeOf(value: string): string {
    const match = value.match(/\/order\/([A-Za-z0-9]+)/);
    return (match ? match[1] : value).trim().toUpperCase();
}

/**
 * Scan a customer's QR code and jump straight to their order
 *
 * @returns the page
 */
function Scan() {
    const [t] = useTranslation("verkauf");
    const navigate = useNavigate();
    const [manual, setManual] = React.useState("");
    const [error, setError] = React.useState<string>();
    const [cameraFailed, setCameraFailed] = React.useState(false);

    /**
     * Look the code up and open its order
     *
     * @param value the scanned or typed text
     */
    const open = React.useCallback(
        async (value: string) => {
            const code = pickupCodeOf(value);
            if (!code) return;
            setError(undefined);
            try {
                // The customer-facing endpoint resolves the code; the staff
                // detail page needs the order's uuid, so go through the list.
                const orders = await Api.verkauf.orders({});
                const match = orders.orders.find((order) => order.pickup_code === code);
                if (!match) {
                    setError(t("error.unknown-code", { code }));
                    return;
                }
                await navigate({ to: "/verkauf/order/$orderId", params: { orderId: match.uuid } });
            } catch {
                setError(t("error.unknown-code", { code }));
            }
        },
        [navigate, t],
    );

    return (
        <div className={"mx-auto flex w-full max-w-xl flex-col gap-6"}>
            <Heading>{t("heading.scan")}</Heading>
            <Text>{t("description.scan")}</Text>

            {cameraFailed ? (
                <Text className={"text-red-600 dark:text-red-400"}>{t("error.camera")}</Text>
            ) : (
                <QrScanner onScan={(value) => void open(value)} onError={() => setCameraFailed(true)} />
            )}

            <Form
                onSubmit={async () => {
                    await open(manual);
                }}
            >
                <Field>
                    <Label>{t("label.manual-code")}</Label>
                    <Input
                        value={manual}
                        autoCapitalize={"characters"}
                        className={"font-mono text-lg tracking-widest"}
                        onChange={(e) => setManual(e.target.value)}
                    />
                </Field>
                <PrimaryButton type={"submit"} className={"mt-3 w-full"}>
                    {t("button.open-order")}
                </PrimaryButton>
            </Form>

            {error && <Text className={"text-red-600 dark:text-red-400"}>{error}</Text>}

            <Button plain href={"/verkauf"}>
                {t("button.back-to-orders")}
            </Button>
        </div>
    );
}

export const Route = createFileRoute("/_auth/verkauf/scan")({
    component: Scan,
});
