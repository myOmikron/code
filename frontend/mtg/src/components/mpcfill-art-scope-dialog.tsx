import { Alert, AlertActions, AlertDescription, AlertTitle, Button, Checkbox, CheckboxField, Label } from "components";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PrimaryButton } from "src/components/primary-button";

/**
 * The properties for {@link MpcFillArtScopeDialog}
 */
export type MpcFillArtScopeDialogProps = {
    /** The card face whose art changes, `null` to keep the dialog closed */
    face: string | null;
    /** How many other groups of the order hold it */
    others: number;
    /** Takes the answer: whether every group changes, and whether to keep asking */
    onAnswer: (everywhere: boolean, remember: boolean) => void;
    /** Closes the dialog without changing the art */
    onClose: () => void;
};

/**
 * Whether new art for a card is taken for every deck of the order that holds it.
 *
 * @returns the dialog
 */
export function MpcFillArtScopeDialog({ face, others, onAnswer, onClose }: MpcFillArtScopeDialogProps) {
    const [t] = useTranslation("game-utils");
    const [remember, setRemember] = useState(false);

    /**
     * Hands the answer on
     *
     * @param everywhere whether every group changes
     */
    function answer(everywhere: boolean) {
        onAnswer(everywhere, remember);
        setRemember(false);
    }

    return (
        <Alert open={face !== null} onClose={onClose}>
            <AlertTitle>{t("heading.art-everywhere")}</AlertTitle>
            <AlertDescription>{t("description.art-everywhere", { name: face ?? "", count: others })}</AlertDescription>
            <CheckboxField className={"mt-4"}>
                <Checkbox color={"lime"} checked={remember} onChange={setRemember} />
                <Label>{t("label.dont-ask-again")}</Label>
            </CheckboxField>
            <AlertActions>
                <Button plain={true} onClick={() => answer(false)}>
                    {t("button.art-this-deck")}
                </Button>
                <PrimaryButton onClick={() => answer(true)}>{t("button.art-every-deck")}</PrimaryButton>
            </AlertActions>
        </Alert>
    );
}
