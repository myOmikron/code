import {
    Button,
    Dialog,
    DialogActions,
    DialogBody,
    DialogTitle,
    ErrorMessage,
    Field,
    Input,
    Label,
    PrimaryButton,
} from "components";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import type { TournamentParticipantResponse } from "src/api/generated";
import { isFormError } from "src/utils/error";

/**
 * The properties for {@link FixedTableDialog}
 */
export type FixedTableDialogProps = {
    /** The tournament the player belongs to */
    tournamentUuid: string;
    /** Whose table to pin, `null` while closed */
    participant: TournamentParticipantResponse | null;
    /** Called when the dialog should close */
    onClose: () => void;
    /** Called after the pin changed */
    onSaved: () => void | Promise<void>;
};

/**
 * Pins a player to one table
 *
 * @returns the dialog
 */
export function FixedTableDialog({ tournamentUuid, participant, onClose, onSaved }: FixedTableDialogProps) {
    const [t] = useTranslation("tournament");
    const [tg] = useTranslation();
    const [typed, setTyped] = useState("");
    const [error, setError] = useState<string | undefined>();
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setTyped(participant?.fixed_table != null ? String(participant.fixed_table) : "");
        setError(undefined);
    }, [participant]);

    if (participant === null) return null;

    /**
     * Writes the pin
     *
     * @param table the table, `null` to release
     */
    async function save(table: number | null) {
        if (participant === null) return;
        setSaving(true);
        try {
            const response = await Api.tournaments.participants.setFixedTable(tournamentUuid, participant.uuid, table);
            if (isFormError(response)) {
                setError(
                    response.error.taken_by != null
                        ? t("error.table-taken", { number: table, name: response.error.taken_by })
                        : t("error.invalid-table"),
                );
                return;
            }
            onClose();
            await onSaved();
        } finally {
            setSaving(false);
        }
    }

    const number = Number(typed);
    const valid = typed.trim() !== "" && Number.isInteger(number) && number >= 1 && number <= 999;

    return (
        <Dialog open={true} onClose={onClose} size={"sm"}>
            <DialogTitle>{t("heading.fixed-table", { name: participant.display_name })}</DialogTitle>
            <DialogBody>
                <form
                    id={"fixed-table-form"}
                    onSubmit={(event) => {
                        event.preventDefault();
                        if (valid) void save(number);
                    }}
                >
                    <Field>
                        <Label>{t("label.fixed-table-number")}</Label>
                        <Input
                            type={"number"}
                            inputMode={"numeric"}
                            min={1}
                            max={999}
                            autoFocus={true}
                            value={typed}
                            invalid={error !== undefined}
                            onChange={(event) => {
                                setTyped(event.target.value);
                                setError(undefined);
                            }}
                        />
                        {error !== undefined && <ErrorMessage>{error}</ErrorMessage>}
                    </Field>
                </form>
            </DialogBody>
            <DialogActions>
                {participant.fixed_table != null && (
                    <Button plain={true} disabled={saving} onClick={() => void save(null)}>
                        {t("button.release-table")}
                    </Button>
                )}
                <Button plain={true} onClick={onClose}>
                    {tg("button.cancel")}
                </Button>
                <PrimaryButton type={"submit"} form={"fixed-table-form"} disabled={saving || !valid}>
                    {t("button.save")}
                </PrimaryButton>
            </DialogActions>
        </Dialog>
    );
}
