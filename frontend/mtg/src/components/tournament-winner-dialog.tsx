import {
    Button,
    Description,
    Dialog,
    DialogActions,
    DialogBody,
    DialogTitle,
    ErrorMessage,
    Field,
    FieldGroup,
    Label,
    Listbox,
    ListboxLabel,
    ListboxOption,
} from "components";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { MatchResponse, SetResultRequest } from "src/api/generated";
import { PrimaryButton } from "src/components/primary-button";
import { isFormError } from "src/utils/error";
import { singleGameResult, winnerSeat } from "src/utils/tournament-rounds";

/** The choice for a Match nobody won */
const DRAW = -1;

/**
 * The properties for {@link TournamentWinnerDialog}
 */
export type TournamentWinnerDialogProps = {
    /** The Match whose Result is set; the dialog is open while it is not `null` */
    played: MatchResponse | null;
    /** Editable suggestion from explicitly recorded Game outcomes. */
    initialResult?: SetResultRequest | null;
    /** Called when the dialog should close without having saved anything */
    onClose: () => void;
    /** The dialog's title */
    title: string;
    /** The hint under the choice */
    description: string;
    /** Sends the Result to the service */
    save: (result: SetResultRequest) => Promise<unknown>;
    /** Says why the service refused the Result, given its form errors */
    explain: (error: Record<string, boolean>) => string;
    /** Called after the Result was saved */
    onSaved: () => Promise<void>;
};

/**
 * Dialog for the Result of a multiplayer Match, its winner or a draw: an
 * Organizer sets or corrects it, a Participant reports it.
 *
 * @returns the dialog
 */
export function TournamentWinnerDialog({
    played,
    initialResult,
    onClose,
    title,
    description,
    save,
    explain,
    onSaved,
}: TournamentWinnerDialogProps) {
    const [t] = useTranslation("tournament");
    const [tg] = useTranslation();
    const [winner, setWinner] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        const suggested = played?.result ?? initialResult;
        setWinner(suggested == null ? 0 : (winnerSeat(suggested) ?? DRAW));
        setError(null);
    }, [played, initialResult]);

    const seats = played?.seats ?? [];

    /**
     * Saves the winner or the draw, saying why when it was refused
     */
    async function submit() {
        setBusy(true);
        try {
            const result = await save(singleGameResult(seats.length, winner === DRAW ? null : winner));
            if (isFormError<unknown, { result: "Err"; error: Record<string, boolean> }>(result)) {
                setError(explain(result.error));
                return;
            }
            await onSaved();
        } finally {
            setBusy(false);
        }
    }

    return (
        <Dialog open={played !== null} onClose={onClose}>
            <DialogTitle>{title}</DialogTitle>
            <form
                onSubmit={(event) => {
                    event.preventDefault();
                    void submit();
                }}
            >
                <DialogBody>
                    <FieldGroup>
                        <Field>
                            <Label>{t("label.winner")}</Label>
                            <Listbox<number> value={winner} onChange={setWinner}>
                                {seats.map((seat, index) => (
                                    <ListboxOption key={seat.participant} value={index}>
                                        <ListboxLabel>{seat.name}</ListboxLabel>
                                    </ListboxOption>
                                ))}
                                <ListboxOption value={DRAW}>
                                    <ListboxLabel>{t("label.draw")}</ListboxLabel>
                                </ListboxOption>
                            </Listbox>
                        </Field>
                        {error !== null ? (
                            <ErrorMessage>{error}</ErrorMessage>
                        ) : (
                            <Description>{description}</Description>
                        )}
                    </FieldGroup>
                </DialogBody>
                <DialogActions>
                    <Button plain onClick={onClose}>
                        {tg("button.cancel")}
                    </Button>
                    <PrimaryButton type={"submit"} disabled={busy}>
                        {t("button.save-result")}
                    </PrimaryButton>
                </DialogActions>
            </form>
        </Dialog>
    );
}
