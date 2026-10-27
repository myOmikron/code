import { Popover, PopoverButton, PopoverPanel } from "@headlessui/react";
import { ChevronDownIcon } from "@heroicons/react/16/solid";
import React from "react";
import { useTranslation } from "react-i18next";
import { Button, Checkbox, CheckboxField, Label, Text } from "components";
import { MAX_SERIES } from "src/components/statistics/series";
import { ItemRow } from "src/utils/statistics";

/** The properties of {@link ItemSelection} */
export type ItemSelectionProps = {
    /** The Items to choose from */
    items: ItemRow[];
    /** The selection: Item keys, or `top` for the top 5 preset */
    selection: string[] | "top";
    /** The keys selected right now, the top 5 under the preset */
    selected: string[];
    /** Called with a new selection */
    onChange: (selection: string[] | "top") => void;
};

/**
 * Picker of the Items the charts show, preset with the top 5
 *
 * @returns the picker
 */
export function ItemSelection(props: ItemSelectionProps) {
    const { items, selection, selected, onChange } = props;
    const [t] = useTranslation("statistics");

    const toggle = (key: string, on: boolean) =>
        onChange(on ? [...selected, key] : selected.filter((candidate) => candidate !== key));

    return (
        <Popover className={"relative"}>
            <PopoverButton as={Button} outline className={"w-full justify-between sm:w-auto"}>
                {selection === "top"
                    ? t("label.selection-top")
                    : t("label.selection-count", { count: selected.length })}
                <ChevronDownIcon />
            </PopoverButton>
            <PopoverPanel
                anchor={"bottom start"}
                className={
                    "z-20 flex max-h-96 w-72 flex-col gap-3 rounded-xl bg-white p-4 shadow-lg ring-1 ring-zinc-950/10 [--anchor-gap:--spacing(2)] dark:bg-zinc-900 dark:ring-white/10"
                }
            >
                <div className={"flex items-center justify-between gap-2"}>
                    <Text className={"text-xs/5!"}>{t("description.selection-limit", { count: MAX_SERIES })}</Text>
                    <Button plain disabled={selection === "top"} onClick={() => onChange("top")}>
                        {t("button.selection-top")}
                    </Button>
                </div>
                <div className={"flex flex-col gap-2 overflow-y-auto"}>
                    {items.map((item) => {
                        const checked = selected.includes(item.key);
                        return (
                            <CheckboxField key={item.key}>
                                <Checkbox
                                    checked={checked}
                                    disabled={!checked && selected.length >= MAX_SERIES}
                                    onChange={(on) => toggle(item.key, on)}
                                />
                                <Label>{item.deleted ? `${item.name} (${t("label.deleted")})` : item.name}</Label>
                            </CheckboxField>
                        );
                    })}
                </div>
            </PopoverPanel>
        </Popover>
    );
}
