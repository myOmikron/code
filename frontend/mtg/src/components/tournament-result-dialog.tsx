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
import type { BestOf, MatchResponse, SetResultErrors, SetResultRequest } from "src/api/generated";
import { PrimaryButton } from "src/components/primary-button";
import { isFormError } from "src/utils/error";
import { MAX_DRAWN_GAMES, gamesToWin } from "src/utils/tournament-rounds";

/**
 * The properties for {@link TournamentResultDialog}
 */
export type TournamentResultDialogProps = {
    /** The Match whose Result is set; the dialog is open while it is not `null` */
    played: MatchResponse | null;
    /** How many Games the Match is played to */
    bestOf: BestOf;
    /** Called when the dialog should close without having saved anything */
    onClose: () => void;
    /** Sends the Result to the service */
    save: (result: SetResultRequest) => Promise<unknown>;
    /** Called after the Result was saved */
    onSaved: () => Promise<void>;
};

/**
 * Dialog for an Organizer to set or correct the game score of a one-on-one Match.
 *
 * @returns the dialog
 */
export function TournamentResultDialog({ played, bestOf, onClose, save, onSaved }: TournamentResultDialogProps) {
    const [t] = useTranslation("tournament");
    const [tg] = useTranslation();
    const [first, setFirst] = useState(0);
    const [second, setSecond] = useState(0);
    const [drawn, setDrawn] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        setFirst(played?.result?.games_won[0] ?? 0);
        setSecond(played?.result?.games_won[1] ?? 0);
        setDrawn(played?.result?.games_drawn ?? 0);
        setError(null);
    }, [played]);

    const wins = Array.from({ length: gamesToWin(bestOf) + 1 }, (_, games) => games);
    const draws = Array.from({ length: MAX_DRAWN_GAMES + 1 }, (_, games) => games);

    /**
     * Saves the score, saying why when it was refused
     */
    async function submit() {
        setBusy(true);
        try {
            const result = await save({ games_won: [first, second], games_drawn: drawn });
            if (isFormError<unknown, { result: "Err"; error: SetResultErrors }>(result)) {
                setError(result.error.not_started ? t("error.round-not-started") : t("error.invalid-score"));
                return;
            }
            await onSaved();
        } finally {
            setBusy(false);
        }
    }

    const seats = played?.seats ?? [];

    return (
        <Dialog open={played !== null} onClose={onClose}>
            <DialogTitle>{t("heading.set-result", { table: played?.table_number ?? "" })}</DialogTitle>
            <form
                onSubmit={(event) => {
                    event.preventDefault();
                    void submit();
                }}
            >
                <DialogBody>
                    <FieldGroup>
                        <GamesField label={seats[0]?.name ?? ""} value={first} options={wins} onChange={setFirst} />
                        <GamesField label={seats[1]?.name ?? ""} value={second} options={wins} onChange={setSecond} />
                        <GamesField label={t("label.games-drawn")} value={drawn} options={draws} onChange={setDrawn} />
                        {error !== null ? (
                            <ErrorMessage>{error}</ErrorMessage>
                        ) : (
                            <Description>{t("description.set-result")}</Description>
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

/**
 * The properties for {@link GamesField}
 */
type GamesFieldProps = {
    /** Whose games, or which */
    label: string;
    /** The games chosen */
    value: number;
    /** The numbers to choose from */
    options: Array<number>;
    /** Called with the number chosen */
    onChange: (games: number) => void;
};

/**
 * A number of games to pick from a short list
 *
 * @returns the field
 */
function GamesField({ label, value, options, onChange }: GamesFieldProps) {
    return (
        <Field>
            <Label>{label}</Label>
            <Listbox<number> value={value} onChange={onChange}>
                {options.map((games) => (
                    <ListboxOption key={games} value={games}>
                        <ListboxLabel>{games}</ListboxLabel>
                    </ListboxOption>
                ))}
            </Listbox>
        </Field>
    );
}
