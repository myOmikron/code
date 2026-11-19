import { AdjustmentsHorizontalIcon, XMarkIcon } from "@heroicons/react/20/solid";
import { Button } from "components";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import type { DatingSetResponse } from "src/api/generated";
import { SetPicker } from "src/components/set-picker";

/**
 * The properties for {@link DatingSetFilter}
 */
export type DatingSetFilterProps = {
    /** Set codes, upper case; none means every set */
    sets: string[];
    onSets: (sets: string[]) => void;
    /** Whether the picker is open, so the page can mute its shortcuts */
    onPicking?: (picking: boolean) => void;
};

/**
 * Narrows the stack to Commanders printed in some sets: an icon on phones, the chosen sets on desktop.
 *
 * @returns the trigger and its picker
 */
export function DatingSetFilter({ sets, onSets, onPicking }: DatingSetFilterProps) {
    const [t] = useTranslation("dating");
    const [known, setKnown] = useState<DatingSetResponse[] | null>(null);
    const [picking, setPicking] = useState(false);

    useEffect(() => {
        Api.dating.sets().then(setKnown);
    }, []);

    useEffect(() => onPicking?.(picking), [picking, onPicking]);

    const label = useMemo(() => {
        if (sets.length === 0) return t("label.all-sets");
        const byCode = new Map((known ?? []).map((set) => [set.code, set.name]));
        return sets.map((code) => byCode.get(code) ?? code).join(", ");
    }, [known, sets, t]);

    return (
        <>
            <span className={"lg:hidden"}>
                <Button
                    plain={true}
                    className={"relative"}
                    aria-label={t("button.filter")}
                    disabled={known === null}
                    onClick={() => setPicking(true)}
                >
                    <AdjustmentsHorizontalIcon />
                    {sets.length > 0 && (
                        <span
                            aria-hidden={true}
                            className={"absolute top-1.5 right-1.5 size-2 rounded-full bg-lime-500"}
                        />
                    )}
                </Button>
            </span>
            <span className={"hidden max-w-64 items-center gap-1 lg:flex"}>
                <Button outline={true} className={"min-w-0"} disabled={known === null} onClick={() => setPicking(true)}>
                    <span className={"truncate"}>{label}</span>
                </Button>
                {sets.length > 0 && (
                    <Button plain={true} aria-label={t("accessibility.clear-sets")} onClick={() => onSets([])}>
                        <XMarkIcon />
                    </Button>
                )}
            </span>
            {known !== null && picking && (
                <SetPicker
                    open={true}
                    sets={known.map((set) => ({ code: set.code, name: set.name, cardCount: set.legends }))}
                    initialSelection={sets}
                    confirmLabel={t("button.apply-sets")}
                    onCancel={() => setPicking(false)}
                    onConfirm={(codes) => {
                        onSets(codes);
                        setPicking(false);
                    }}
                />
            )}
        </>
    );
}
