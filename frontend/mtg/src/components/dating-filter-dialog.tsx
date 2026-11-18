import { XMarkIcon } from "@heroicons/react/20/solid";
import clsx from "clsx";
import { Button, Dialog, DialogActions, DialogBody, DialogTitle, Text } from "components";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { CardRarity } from "src/api/generated";
import type { DatingSetResponse } from "src/api/generated";
import { PrimaryButton } from "src/components/primary-button";
import { SetPicker } from "src/components/set-picker";

/** The rarities offered, commonest first */
const RARITIES = [CardRarity.Common, CardRarity.Uncommon, CardRarity.Rare, CardRarity.Mythic] as const;

/** A pill that toggles */
const PILL =
    "min-h-11 rounded-full px-4 text-sm font-semibold ring-1 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-500";

/** A pill that is on */
const ON = "bg-lime-400 text-lime-950 ring-lime-500";

/** A pill that is off */
const OFF = "bg-white text-zinc-800 ring-zinc-950/10 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-white/15";

/**
 * The properties for {@link DatingFilterDialog}
 */
export type DatingFilterDialogProps = {
    open: boolean;
    onClose: () => void;
    /** The rarities switched on; none means every rarity */
    rarities: ReadonlySet<CardRarity>;
    onRarities: (rarities: Set<CardRarity>) => void;
    /** Set codes, upper case; none means every set */
    sets: string[];
    onSets: (sets: string[]) => void;
};

/**
 * Narrows the stack to Commanders printed in some sets or at some rarities.
 *
 * @returns the dialog
 */
export function DatingFilterDialog({ open, onClose, rarities, onRarities, sets, onSets }: DatingFilterDialogProps) {
    const [t] = useTranslation("dating");
    const [known, setKnown] = useState<DatingSetResponse[] | null>(null);
    const [picking, setPicking] = useState(false);

    useEffect(() => {
        if (!open || known !== null) return;
        Api.dating.sets().then(setKnown);
    }, [open, known]);

    const names = useMemo(() => {
        const byCode = new Map((known ?? []).map((set) => [set.code, set.name]));
        return sets.map((code) => byCode.get(code) ?? code);
    }, [known, sets]);

    const toggle = (rarity: CardRarity) => {
        const next = new Set(rarities);
        if (next.has(rarity)) next.delete(rarity);
        else next.add(rarity);
        onRarities(next);
    };

    return (
        <>
            <Dialog open={open && !picking} onClose={onClose} size={"md"}>
                <DialogTitle>{t("heading.filter")}</DialogTitle>
                <DialogBody className={"flex flex-col gap-6"}>
                    <fieldset className={"flex flex-col gap-2"}>
                        <legend className={"mb-2"}>
                            <Text className={"font-semibold"}>{t("label.rarity")}</Text>
                        </legend>
                        <div className={"flex flex-wrap gap-2"}>
                            {RARITIES.map((rarity) => (
                                <button
                                    key={rarity}
                                    type={"button"}
                                    aria-pressed={rarities.has(rarity)}
                                    onClick={() => toggle(rarity)}
                                    className={clsx(PILL, rarities.has(rarity) ? ON : OFF)}
                                >
                                    {t(`label.rarity-${rarity.toLowerCase()}`)}
                                </button>
                            ))}
                        </div>
                    </fieldset>

                    <fieldset className={"flex flex-col gap-2"}>
                        <legend className={"mb-2"}>
                            <Text className={"font-semibold"}>{t("label.sets")}</Text>
                        </legend>
                        <div className={"flex items-center gap-2"}>
                            <Button
                                outline={true}
                                className={"min-w-0 flex-1 justify-start!"}
                                disabled={known === null}
                                onClick={() => setPicking(true)}
                            >
                                <span className={"truncate"}>
                                    {names.length === 0 ? t("label.all-sets") : names.join(", ")}
                                </span>
                            </Button>
                            {sets.length > 0 && (
                                <Button
                                    plain={true}
                                    aria-label={t("accessibility.clear-sets")}
                                    onClick={() => onSets([])}
                                >
                                    <XMarkIcon />
                                </Button>
                            )}
                        </div>
                    </fieldset>
                </DialogBody>
                <DialogActions>
                    <Button
                        plain={true}
                        disabled={rarities.size === 0 && sets.length === 0}
                        onClick={() => {
                            onRarities(new Set());
                            onSets([]);
                        }}
                    >
                        {t("button.clear-filters")}
                    </Button>
                    <PrimaryButton onClick={onClose}>{t("button.done")}</PrimaryButton>
                </DialogActions>
            </Dialog>
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
