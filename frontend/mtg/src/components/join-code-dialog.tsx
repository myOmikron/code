import {
    Button,
    Description,
    Dialog,
    DialogActions,
    DialogBody,
    DialogTitle,
    ErrorMessage,
    Field,
    Form,
    Input,
    RequiredLabel,
} from "components";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import type { JoinLookupResponse } from "src/api/generated";
import { JoinCard, joinErrorHandlers } from "src/components/join-card";
import { handleFormError, isFormError } from "src/utils/error";

/**
 * The properties for {@link JoinCodeDialog}
 */
export type JoinCodeDialogProps = {
    /** Whether the dialog is on screen */
    open: boolean;
    /** Called when the dialog should close */
    onClose: () => void;
    /** Called once the code resolved and the join went through, with the tournament joined */
    onJoined: (tournamentUuid: string) => void;
};

/**
 * Typed code entry, from a blank field to a joined roster row.
 *
 * Two phases in one dialog: typing a code resolves it into a small preview card (what the event
 * is, whether it is even taking new players right now), and only once that card is on screen does
 * the rest happen — {@link JoinCard} owns everything from there: guest vs. account, whether the
 * viewer already has a seat, and the join itself.
 *
 * @returns the dialog
 */
export function JoinCodeDialog({ open, onClose, onJoined }: JoinCodeDialogProps) {
    const [t] = useTranslation("tournament");
    const [tg] = useTranslation();

    const [code, setCode] = useState("");
    const [lookup, setLookup] = useState<JoinLookupResponse | null>(null);
    const [lookupError, setLookupError] = useState<string | undefined>();
    const [lookingUp, setLookingUp] = useState(false);

    // The dialog stays mounted; every field starts fresh each time it opens.
    useEffect(() => {
        if (!open) return;
        setCode("");
        setLookup(null);
        setLookupError(undefined);
    }, [open]);

    /** Resolves the typed code into the preview card */
    async function doLookup() {
        setLookingUp(true);
        setLookupError(undefined);
        try {
            const response = await Api.join.lookup(code.trim());
            if (isFormError(response)) {
                setLookupError(handleFormError(response.error, joinErrorHandlers(t)).form);
                return;
            }
            setLookup(response);
        } catch (error) {
            console.error(error);
            setLookupError(t("error.join-failed"));
        } finally {
            setLookingUp(false);
        }
    }

    return (
        <Dialog open={open} onClose={onClose}>
            <DialogTitle>{t("heading.join-by-code")}</DialogTitle>
            <DialogBody>
                <div className={"flex flex-col gap-4"}>
                    <Form onSubmit={() => void doLookup()}>
                        <Field>
                            <RequiredLabel>{t("label.code")}</RequiredLabel>
                            <Description>{t("description.join-by-code")}</Description>
                            <div className={"mt-2 flex gap-2"}>
                                <Input
                                    autoFocus={true}
                                    required={true}
                                    maxLength={8}
                                    invalid={lookupError !== undefined}
                                    value={code}
                                    onChange={(event) => {
                                        setCode(event.target.value);
                                        setLookup(null);
                                        setLookupError(undefined);
                                    }}
                                    className={"font-mono tracking-widest uppercase"}
                                />
                                <Button type={"submit"} loading={lookingUp} disabled={code.trim() === ""}>
                                    {t("button.join")}
                                </Button>
                            </div>
                            {lookupError !== undefined && <ErrorMessage>{lookupError}</ErrorMessage>}
                        </Field>
                    </Form>

                    {lookup !== null && <JoinCard code={code.trim()} lookup={lookup} onJoined={onJoined} />}
                </div>
            </DialogBody>
            <DialogActions>
                <Button plain onClick={onClose}>
                    {tg("button.cancel")}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
