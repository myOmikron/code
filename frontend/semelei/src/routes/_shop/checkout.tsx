import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useForm } from "@tanstack/react-form";
import React from "react";
import { useTranslation } from "react-i18next";
import {
    Button,
    Description,
    ErrorMessage,
    Field,
    FieldGroup,
    Fieldset,
    Form,
    Heading,
    Input,
    Label,
    PrimaryButton,
    RequiredLabel,
    Strong,
    Text,
    Textarea,
} from "components";
import { Api } from "src/api/api";
import { PickupWindowResponse } from "src/api/generated";
import { CART_CONTEXT } from "src/context/cart";
import { clearCart } from "src/utils/cart";
import { formatDate, formatDateTime } from "src/utils/dates";
import { rememberOrder } from "src/utils/orders-storage";
import { formatPrice } from "src/utils/price";
import { orderLanguage } from "src/utils/language";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+0-9][0-9 /()-]{4,}$/;

/**
 * The checkout form: name + (phone OR email) + note
 *
 * The pickup date is not entered — the server decides which day is open and
 * until when, and the page only shows it.
 *
 * @returns the page
 */
function Checkout() {
    const [t] = useTranslation("shop");
    const navigate = useNavigate();
    const { cart, dispatch, totalCents } = React.useContext(CART_CONTEXT);
    const [pickup, setPickup] = React.useState<PickupWindowResponse>();

    React.useEffect(() => {
        Api.shop.pickupWindow().then(setPickup);
    }, []);

    const form = useForm({
        defaultValues: {
            name: "",
            phone: "",
            email: "",
            note: "",
        },
        validators: {
            onSubmit: ({ value }) => {
                const fields: Record<string, string> = {};
                if (!value.name.trim()) fields.name = t("error.name-required");
                if (!value.phone.trim() && !value.email.trim()) {
                    fields.phone = t("error.contact-required");
                    fields.email = t("error.contact-required");
                }
                if (value.phone.trim() && !PHONE_RE.test(value.phone.trim())) fields.phone = t("error.phone-invalid");
                if (value.email.trim() && !EMAIL_RE.test(value.email.trim())) fields.email = t("error.email-invalid");
                return Object.keys(fields).length > 0 ? { fields } : undefined;
            },
        },
        onSubmit: async ({ value }) => {
            const response = await Api.shop.createOrder({
                customer_name: value.name.trim(),
                phone: value.phone.trim() || null,
                email: value.email.trim() || null,
                note: value.note.trim() || null,
                items: cart.entries.map((e) => ({ item: e.itemId, quantity: e.quantity })),
                language: orderLanguage(),
            });
            clearCart();
            dispatch({ type: "clear" });
            rememberOrder({
                pickupCode: response.pickup_code,
                pickupDate: response.order.pickup_date,
                createdAt: new Date().toISOString(),
            });
            await navigate({
                to: "/order/$pickupCode",
                params: { pickupCode: response.pickup_code },
            });
        },
    });

    if (cart.entries.length === 0) {
        return <Heading>{t("label.cart-empty")}</Heading>;
    }
    // No open pickup day means the deadline passed and the next one has not
    // opened yet — ordering now would be rejected by the server anyway.
    if (pickup && !pickup.pickup_date) {
        return (
            <div className={"mx-auto flex w-full max-w-xl flex-col gap-4"}>
                <Heading>{t("heading.checkout")}</Heading>
                <Text>{t("description.orders-closed")}</Text>
                <Button plain href={"/"}>
                    {t("button.back-to-shop")}
                </Button>
            </div>
        );
    }

    /**
     * Renders the error message of a field, if any
     *
     * @param errors the field's error list
     *
     * @returns the message or nothing
     */
    const fieldError = (errors: unknown[]) =>
        errors.length > 0 ? <ErrorMessage>{String(errors[0])}</ErrorMessage> : undefined;

    return (
        <div className={"mx-auto flex w-full max-w-xl flex-col gap-6"}>
            <Heading>{t("heading.checkout")}</Heading>

            <Form onSubmit={form.handleSubmit}>
                <Fieldset>
                    <FieldGroup>
                        <form.Field name={"name"}>
                            {(fieldApi) => (
                                <Field>
                                    <RequiredLabel>{t("label.name")}</RequiredLabel>
                                    <Input
                                        required
                                        maxLength={255}
                                        autoComplete={"name"}
                                        value={fieldApi.state.value}
                                        onChange={(e) => fieldApi.handleChange(e.target.value)}
                                        invalid={fieldApi.state.meta.errors.length > 0}
                                    />
                                    {fieldError(fieldApi.state.meta.errors)}
                                </Field>
                            )}
                        </form.Field>

                        <form.Field name={"phone"}>
                            {(fieldApi) => (
                                <Field>
                                    <Label>{t("label.phone")}</Label>
                                    <Input
                                        type={"tel"}
                                        maxLength={64}
                                        autoComplete={"tel"}
                                        value={fieldApi.state.value}
                                        onChange={(e) => fieldApi.handleChange(e.target.value)}
                                        invalid={fieldApi.state.meta.errors.length > 0}
                                    />
                                    {fieldError(fieldApi.state.meta.errors)}
                                </Field>
                            )}
                        </form.Field>

                        <form.Field name={"email"}>
                            {(fieldApi) => (
                                <Field>
                                    <Label>{t("label.email")}</Label>
                                    <Input
                                        type={"email"}
                                        maxLength={255}
                                        autoComplete={"email"}
                                        value={fieldApi.state.value}
                                        onChange={(e) => fieldApi.handleChange(e.target.value)}
                                        invalid={fieldApi.state.meta.errors.length > 0}
                                    />
                                    <Description>{t("description.contact")}</Description>
                                    {fieldError(fieldApi.state.meta.errors)}
                                </Field>
                            )}
                        </form.Field>

                        <form.Field name={"note"}>
                            {(fieldApi) => (
                                <Field>
                                    <Label>{t("label.note")}</Label>
                                    <Textarea
                                        rows={3}
                                        maxLength={1024}
                                        value={fieldApi.state.value}
                                        onChange={(e) => fieldApi.handleChange(e.target.value)}
                                    />
                                </Field>
                            )}
                        </form.Field>

                        <div className={"flex items-center justify-between"}>
                            <Text>{t("label.total")}</Text>
                            <Strong>{formatPrice(totalCents)}</Strong>
                        </div>
                        {pickup?.pickup_date && (
                            <Text>{t("label.pickup-on", { date: formatDate(pickup.pickup_date) })}</Text>
                        )}
                        {pickup?.deadline && (
                            <Text>{t("label.cancel-until", { date: formatDateTime(pickup.deadline) })}</Text>
                        )}
                        <Text>{t("description.payment")}</Text>

                        <form.Subscribe selector={(state) => state.isSubmitting}>
                            {(isSubmitting) => (
                                <PrimaryButton
                                    type={"submit"}
                                    loading={isSubmitting}
                                    disabled={!pickup?.pickup_date}
                                    className={"w-full"}
                                >
                                    {t("button.submit-order")}
                                </PrimaryButton>
                            )}
                        </form.Subscribe>
                    </FieldGroup>
                </Fieldset>
            </Form>
        </div>
    );
}

export const Route = createFileRoute("/_shop/checkout")({
    component: Checkout,
});
