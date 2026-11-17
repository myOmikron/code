import { Dialog, DialogActions, DialogDescription, DialogTitle } from "components";
import { Button } from "components";
import { useTranslation } from "react-i18next";
import { PrimaryButton } from "src/components/primary-button";
import type { StartMode } from "src/utils/use-start-deck";

/**
 * The properties for {@link DatingStartDialog}
 */
export type DatingStartDialogProps = {
    /** The Commander a deck is started with, `null` while closed */
    name: string | null;
    /** Whether a deck is being created */
    busy: boolean;
    /** Start the deck one of three ways */
    onStart: (mode: StartMode) => void;
    /** Close without starting */
    onClose: () => void;
};

/**
 * How to start a deck with a match: plan a date, a Blind Date, or just build.
 *
 * @returns the dialog
 */
export function DatingStartDialog({ name, busy, onStart, onClose }: DatingStartDialogProps) {
    const [t] = useTranslation("dating");

    return (
        <Dialog open={name !== null} onClose={onClose} size={"sm"}>
            <DialogTitle>{t("heading.start-deck")}</DialogTitle>
            <DialogDescription>{t("description.start-deck", { name: name ?? "" })}</DialogDescription>
            <DialogActions className={"flex-col! items-stretch! sm:flex-col!"}>
                <PrimaryButton disabled={busy} onClick={() => onStart("date")}>
                    {t("button.plan-date")}
                </PrimaryButton>
                <Button outline={true} disabled={busy} onClick={() => onStart("blind")}>
                    {t("button.blind-date")}
                </Button>
                <Button plain={true} disabled={busy} onClick={() => onStart("build")}>
                    {t("button.just-build")}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
