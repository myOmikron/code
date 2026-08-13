import React from "react";
import { useTranslation } from "react-i18next";
import {
    Button,
    Description,
    Dialog,
    DialogActions,
    DialogBody,
    DialogTitle,
    Field,
    FieldGroup,
    Fieldset,
    Input,
    Label,
    PrimaryButton,
    Switch,
    SwitchField,
    Text,
} from "components";
import { Api } from "src/api/api";
import { AdminPickupDay } from "src/api/generated";

/**
 * The properties for {@link PickupDayDialog}
 */
export type PickupDayDialogProps = {
    /** The day being edited; the dialog is closed while unset */
    day?: AdminPickupDay;
    /** Close the dialog without saving */
    onClose: () => void;
    /** Called after the day was saved */
    onSaved: () => void;
};

/**
 * Split an ISO timestamp into the date and time an `<input>` expects.
 *
 * Deliberately local: the admin types the shop's wall clock time, and that is
 * what the browser renders back.
 *
 * @param iso the ISO timestamp
 *
 * @returns date (`YYYY-MM-DD`) and time (`HH:MM`) in local time
 */
function splitLocal(iso: string): { date: string; time: string } {
    const value = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return {
        date: `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`,
        time: `${pad(value.getHours())}:${pad(value.getMinutes())}`,
    };
}

/**
 * Edit a single pickup day: move it, change its deadline or call it off
 *
 * @param props {@link PickupDayDialogProps}
 *
 * @returns the dialog
 */
export function PickupDayDialog(props: PickupDayDialogProps) {
    const [t] = useTranslation("admin");
    const [tg] = useTranslation();
    const [pickupDate, setPickupDate] = React.useState("");
    const [deadlineDate, setDeadlineDate] = React.useState("");
    const [deadlineTime, setDeadlineTime] = React.useState("");
    const [closed, setClosed] = React.useState(false);
    const [saving, setSaving] = React.useState(false);

    // Reset the form whenever another day is opened
    React.useEffect(() => {
        if (!props.day) return;
        const deadline = splitLocal(props.day.deadline);
        setPickupDate(props.day.pickup_date);
        setDeadlineDate(deadline.date);
        setDeadlineTime(deadline.time);
        setClosed(props.day.closed);
    }, [props.day]);

    /** Save the changes */
    async function save() {
        if (!props.day) return;
        setSaving(true);
        try {
            await Api.admin.schedule.updateDay(props.day.rule_date, {
                pickup_date: pickupDate,
                // The browser reads the local wall clock back as an offset,
                // which is exactly what the server stores.
                deadline: new Date(`${deadlineDate}T${deadlineTime}`).toISOString(),
                closed,
            });
            props.onSaved();
        } finally {
            setSaving(false);
        }
    }

    return (
        <Dialog open={props.day !== undefined} onClose={props.onClose} size={"lg"}>
            <DialogTitle>{t("heading.edit-pickup-day")}</DialogTitle>
            <DialogBody>
                <Fieldset>
                    <FieldGroup>
                        <Field>
                            <Label>{t("label.pickup-date")}</Label>
                            <Input
                                type={"date"}
                                lang={"de-DE"}
                                value={pickupDate}
                                onChange={(e) => setPickupDate(e.target.value)}
                            />
                            <Description>{t("description.move-pickup-day")}</Description>
                        </Field>

                        <Field>
                            <Label>{t("label.order-deadline")}</Label>
                            <div className={"flex gap-2"}>
                                <Input
                                    type={"date"}
                                    lang={"de-DE"}
                                    value={deadlineDate}
                                    onChange={(e) => setDeadlineDate(e.target.value)}
                                />
                                <Input
                                    type={"time"}
                                    lang={"de-DE"}
                                    value={deadlineTime}
                                    onChange={(e) => setDeadlineTime(e.target.value)}
                                />
                            </div>
                        </Field>

                        <SwitchField>
                            <Label>{t("label.day-closed")}</Label>
                            <Description>{t("description.close-pickup-day")}</Description>
                            <Switch checked={closed} onChange={setClosed} />
                        </SwitchField>

                        {closed && props.day && props.day.order_count > 0 && (
                            <Text className={"text-red-600 dark:text-red-400"}>
                                {t("description.close-cancels-orders", { count: props.day.order_count })}
                            </Text>
                        )}
                    </FieldGroup>
                </Fieldset>
            </DialogBody>
            <DialogActions>
                <Button plain onClick={props.onClose}>
                    {tg("button.cancel")}
                </Button>
                <PrimaryButton loading={saving} onClick={save}>
                    {tg("button.save")}
                </PrimaryButton>
            </DialogActions>
        </Dialog>
    );
}
