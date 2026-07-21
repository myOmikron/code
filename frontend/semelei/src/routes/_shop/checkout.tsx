import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useForm } from "@tanstack/react-form";
import React from "react";
import { useTranslation } from "react-i18next";
import {
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
import { CART_CONTEXT } from "src/context/cart";
import { clearCart } from "src/utils/cart";
import { formatDate, nextSaturdayIsoDate } from "src/utils/dates";
import { rememberOrder } from "src/utils/orders-storage";
import { formatPrice } from "src/utils/price";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+0-9][0-9 /()-]{4,}$/;

/**
 * The checkout form: name + (phone OR email) + note
 *
 * The pickup date is not entered — every order is for the next Saturday.
 *
 * @returns the page
 */
function Checkout() {
    const [t] = useTranslation("shop");
    const navigate = useNavigate();
    const { cart, dispatch, totalCents } = React.useContext(CART_CONTEXT);

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
                        <Text>{t("label.pickup-on", { date: formatDate(nextSaturdayIsoDate()) })}</Text>
                        <Text>{t("description.payment")}</Text>

                        <form.Subscribe selector={(state) => state.isSubmitting}>
                            {(isSubmitting) => (
                                <PrimaryButton type={"submit"} loading={isSubmitting} className={"w-full"}>
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
