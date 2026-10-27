import React from "react";
import { useTranslation } from "react-i18next";
import { Button, Field, Input, Label } from "components";
import { Period, quickPeriod, QuickPeriod } from "src/utils/statistics";

const QUICK_PICKS: QuickPeriod[] = ["7d", "30d", "3m", "12m"];

/** The properties of {@link PeriodPicker} */
export type PeriodPickerProps = {
    /** The period */
    period: Period;
    /** Called with a new, valid period */
    onChange: (period: Period) => void;
};

/**
 * From/to dates of the page's period and quick picks
 *
 * @returns the picker
 */
export function PeriodPicker(props: PeriodPickerProps) {
    const { period, onChange } = props;
    const [t] = useTranslation("statistics");

    const isQuick = (pick: QuickPeriod) => {
        const quick = quickPeriod(pick, Date.now());
        return quick.from === period.from && quick.to === period.to;
    };
    const change = (next: Period) => {
        if (next.from !== "" && next.to !== "" && next.from <= next.to) onChange(next);
    };

    return (
        <div className={"flex flex-wrap items-end gap-3"}>
            <Field className={"w-40"}>
                <Label>{t("label.from")}</Label>
                <Input
                    type={"date"}
                    value={period.from}
                    max={period.to}
                    onChange={(event) => change({ ...period, from: event.target.value })}
                />
            </Field>
            <Field className={"w-40"}>
                <Label>{t("label.to")}</Label>
                <Input
                    type={"date"}
                    value={period.to}
                    min={period.from}
                    onChange={(event) => change({ ...period, to: event.target.value })}
                />
            </Field>
            <div className={"flex flex-wrap gap-2"}>
                {QUICK_PICKS.map((pick) =>
                    isQuick(pick) ? (
                        <Button key={pick} color={"blue"} onClick={() => onChange(quickPeriod(pick, Date.now()))}>
                            {t(`button.quick-${pick}`)}
                        </Button>
                    ) : (
                        <Button key={pick} outline onClick={() => onChange(quickPeriod(pick, Date.now()))}>
                            {t(`button.quick-${pick}`)}
                        </Button>
                    ),
                )}
            </div>
        </div>
    );
}
