import { createFileRoute } from "@tanstack/react-router";
import React from "react";
import { useTranslation } from "react-i18next";
import {
    Badge,
    Button,
    ConfirmDialog,
    Description,
    Field,
    FieldGroup,
    Fieldset,
    Heading,
    Input,
    Label,
    Listbox,
    ListboxLabel,
    ListboxOption,
    PrimaryButton,
    Subheading,
    Table,
    TableBody,
    TableBodySkeleton,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
    Text,
    notify,
} from "components";
import { Api } from "src/api/api";
import { AdminPickupDay, ScheduleWeekday } from "src/api/generated";
import { PickupDayDialog } from "src/components/pickup-day-dialog";
import { formatDate, formatDateTime } from "src/utils/dates";

/** The weekdays, in the order a German week runs */
const WEEKDAYS: ScheduleWeekday[] = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/**
 * Pickup days: the recurring rule and the exceptions to it
 *
 * @returns the page
 */
function Termine() {
    const [t] = useTranslation("admin");
    const [tg] = useTranslation();
    const [weekday, setWeekday] = React.useState<ScheduleWeekday>("Saturday");
    const [offsetDays, setOffsetDays] = React.useState(1);
    const [deadlineTime, setDeadlineTime] = React.useState("16:00");
    const [savingRule, setSavingRule] = React.useState(false);
    const [days, setDays] = React.useState<AdminPickupDay[]>();
    const [editing, setEditing] = React.useState<AdminPickupDay>();
    const [locking, setLocking] = React.useState<AdminPickupDay>();

    const fetchDays = React.useCallback(() => {
        Api.admin.schedule.days().then((r) => setDays(r.days));
    }, []);

    React.useEffect(() => {
        Api.admin.schedule.get().then((schedule) => {
            setWeekday(schedule.pickup_weekday);
            setOffsetDays(schedule.deadline_offset_days);
            // The API sends `HH:MM:SS`, the time input wants `HH:MM`
            setDeadlineTime(schedule.deadline_time.slice(0, 5));
        });
        fetchDays();
    }, [fetchDays]);

    /** Save the recurring rule */
    async function saveRule() {
        setSavingRule(true);
        try {
            await Api.admin.schedule.update({
                pickup_weekday: weekday,
                deadline_offset_days: offsetDays,
                deadline_time: `${deadlineTime}:00`,
            });
            notify.success(t("toast.schedule-saved"));
            fetchDays();
        } finally {
            setSavingRule(false);
        }
    }

    return (
        <div className={"flex flex-col gap-10"}>
            <div className={"flex flex-col gap-4"}>
                <Heading>{t("heading.schedule")}</Heading>
                <Text>{t("description.schedule")}</Text>

                <Fieldset className={"max-w-xl"}>
                    <FieldGroup>
                        <Field>
                            <Label>{t("label.pickup-weekday")}</Label>
                            <Listbox<ScheduleWeekday> value={weekday} onChange={setWeekday}>
                                {WEEKDAYS.map((day) => (
                                    <ListboxOption key={day} value={day}>
                                        <ListboxLabel>{tg(`label.weekday-${day.toLowerCase()}`)}</ListboxLabel>
                                    </ListboxOption>
                                ))}
                            </Listbox>
                        </Field>

                        <Field>
                            <Label>{t("label.deadline-offset")}</Label>
                            <Input
                                type={"number"}
                                min={0}
                                max={30}
                                value={offsetDays}
                                onChange={(e) => setOffsetDays(Number(e.target.value))}
                            />
                            <Description>{t("description.deadline-offset")}</Description>
                        </Field>

                        <Field>
                            <Label>{t("label.deadline-time")}</Label>
                            <Input
                                type={"time"}
                                // The browser formats date and time inputs by its own
                                // locale — `lang` asks for the German 24h format.
                                lang={"de-DE"}
                                value={deadlineTime}
                                onChange={(e) => setDeadlineTime(e.target.value)}
                            />
                        </Field>

                        <PrimaryButton loading={savingRule} onClick={saveRule} className={"self-start"}>
                            {tg("button.save")}
                        </PrimaryButton>
                    </FieldGroup>
                </Fieldset>
            </div>

            <div className={"flex flex-col gap-4"}>
                <Subheading>{t("heading.upcoming-pickup-days")}</Subheading>
                <Text>{t("description.upcoming-pickup-days")}</Text>

                <Table>
                    <TableHead>
                        <TableRow>
                            <TableHeader>{t("label.pickup-date")}</TableHeader>
                            <TableHeader>{t("label.order-deadline")}</TableHeader>
                            <TableHeader>{t("label.orders")}</TableHeader>
                            <TableHeader>{t("label.day-state")}</TableHeader>
                            <TableHeader />
                        </TableRow>
                    </TableHead>
                    {days === undefined ? (
                        <TableBodySkeleton rows={4} cols={5} />
                    ) : (
                        <TableBody>
                            {days.map((day) => (
                                <TableRow key={day.rule_date}>
                                    <TableCell>{formatDate(day.pickup_date)}</TableCell>
                                    <TableCell>{formatDateTime(day.deadline)}</TableCell>
                                    <TableCell>{day.order_count}</TableCell>
                                    <TableCell>
                                        {day.closed ? (
                                            <Badge color={"red"}>{t("label.state-closed")}</Badge>
                                        ) : day.locked ? (
                                            <Badge color={"amber"}>{t("label.state-locked")}</Badge>
                                        ) : (
                                            <Badge color={"green"}>{t("label.state-open")}</Badge>
                                        )}
                                    </TableCell>
                                    <TableCell className={"flex justify-end gap-2"}>
                                        {!day.locked && !day.closed && (
                                            <Button plain onClick={() => setLocking(day)}>
                                                {t("button.lock-day")}
                                            </Button>
                                        )}
                                        <Button plain disabled={day.locked} onClick={() => setEditing(day)}>
                                            {tg("button.edit")}
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    )}
                </Table>
            </div>

            <PickupDayDialog
                day={editing}
                onClose={() => setEditing(undefined)}
                onSaved={() => {
                    setEditing(undefined);
                    fetchDays();
                }}
            />

            <ConfirmDialog
                open={locking !== undefined}
                onClose={() => setLocking(undefined)}
                onConfirm={async () => {
                    const result = await Api.admin.schedule.lockDay(locking!.rule_date);
                    notify.success(t("toast.day-locked", { count: result.confirmed_orders }));
                    setLocking(undefined);
                    fetchDays();
                }}
                title={t("heading.confirm-lock-day")}
                description={t("description.confirm-lock-day", {
                    count: locking?.order_count ?? 0,
                })}
                confirmColor={"amber"}
                confirmLabel={t("button.lock-day")}
            />
        </div>
    );
}

export const Route = createFileRoute("/_auth/admin/termine")({
    component: Termine,
});
