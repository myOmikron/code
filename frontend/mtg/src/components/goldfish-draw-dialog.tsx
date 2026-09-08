import { Button, Dialog, DialogActions, DialogBody, DialogTitle, Field, Input, Label, PrimaryButton } from "components";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

/** The counts offered without typing */
const PRESETS = [2, 3, 4, 5, 7];

/**
 * The properties for {@link GoldfishDrawDialog}
 */
export type GoldfishDrawDialogProps = {
    /** Whether the dialog is open */
    open: boolean;
    /** How many cards the library holds */
    available: number;
    /** Draws that many cards */
    onDraw: (count: number) => void;
    /** Closes the dialog */
    onClose: () => void;
};

/**
 * Drawing several cards at once.
 *
 * @returns the dialog
 */
export function GoldfishDrawDialog({ open, available, onDraw, onClose }: GoldfishDrawDialogProps) {
    const [t] = useTranslation("goldfish");
    const [tg] = useTranslation();
    const [count, setCount] = useState("2");

    useEffect(() => {
        if (open) setCount("2");
    }, [open]);

    const amount = Math.max(0, Math.min(available, Math.floor(Number(count) || 0)));

    /**
     * Draws and closes
     *
     * @param wanted how many
     */
    function submit(wanted: number) {
        if (wanted <= 0) return;
        onDraw(wanted);
        onClose();
    }

    return (
        <Dialog open={open} onClose={onClose} size={"xs"}>
            <DialogTitle>{t("heading.draw-many")}</DialogTitle>
            <DialogBody>
                <div className={"flex flex-col gap-4"}>
                    <div className={"flex flex-wrap gap-2"}>
                        {PRESETS.filter((preset) => preset <= available).map((preset) => (
                            <Button key={preset} outline={true} onClick={() => submit(preset)}>
                                {preset}
                            </Button>
                        ))}
                    </div>
                    <Field>
                        <Label>{t("label.draw-count", { available })}</Label>
                        <Input
                            type={"number"}
                            inputMode={"numeric"}
                            min={1}
                            max={available}
                            value={count}
                            autoFocus={true}
                            onChange={(event) => setCount(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                    event.preventDefault();
                                    submit(amount);
                                }
                            }}
                        />
                    </Field>
                </div>
            </DialogBody>
            <DialogActions>
                <Button plain={true} onClick={onClose}>
                    {tg("button.cancel")}
                </Button>
                <PrimaryButton disabled={amount <= 0} onClick={() => submit(amount)}>
                    {t("button.draw-count", { count: amount })}
                </PrimaryButton>
            </DialogActions>
        </Dialog>
    );
}
