import React from "react";
import { useTranslation } from "react-i18next";
import {
    Button,
    Dialog,
    DialogActions,
    DialogBody,
    DialogTitle,
    ErrorMessage,
    Field,
    FieldGroup,
    Fieldset,
    Form,
    Input,
    PrimaryButton,
    RequiredLabel,
    Textarea,
} from "components";
import { Api, UUID } from "src/api/api";
import { newsPostProblems } from "src/utils/news";

/**
 * The properties for {@link NewsPostCreateDialog}
 */
export type NewsPostCreateDialogProps = {
    /** Whether the dialog is shown */
    open: boolean;
    /** Close without creating */
    onClose: () => void;
    /** Called with the new Draft */
    onCreated: (uuid: UUID) => void;
};

/**
 * Asks for a title and a first text and creates a Draft from them
 *
 * @param props {@link NewsPostCreateDialogProps}
 *
 * @returns the dialog
 */
export function NewsPostCreateDialog(props: NewsPostCreateDialogProps) {
    const [t] = useTranslation("admin");
    const [tg] = useTranslation();
    const [title, setTitle] = React.useState("");
    const [body, setBody] = React.useState("");
    const [submitted, setSubmitted] = React.useState(false);
    const [saving, setSaving] = React.useState(false);

    React.useEffect(() => {
        setTitle("");
        setBody("");
        setSubmitted(false);
    }, [props.open]);

    const problems = submitted ? newsPostProblems(title, body) : {};

    /** Create the Draft, unless title or body would be rejected */
    async function create() {
        setSubmitted(true);
        const found = newsPostProblems(title, body);
        if (found.title || found.body) return;
        setSaving(true);
        try {
            props.onCreated(await Api.admin.newsPosts.create({ title: title.trim(), body }));
        } finally {
            setSaving(false);
        }
    }

    return (
        <Dialog open={props.open} onClose={props.onClose} size={"xl"}>
            <DialogTitle>{t("heading.create-news-post")}</DialogTitle>
            <DialogBody>
                <Form onSubmit={() => void create()}>
                    <Fieldset>
                        <FieldGroup>
                            <Field>
                                <RequiredLabel>{t("label.title")}</RequiredLabel>
                                <Input
                                    autoFocus
                                    maxLength={255}
                                    value={title}
                                    invalid={problems.title !== undefined}
                                    onChange={(e) => setTitle(e.target.value)}
                                />
                                {problems.title && <ErrorMessage>{t(`error.title-${problems.title}`)}</ErrorMessage>}
                            </Field>
                            <Field>
                                <RequiredLabel>{t("label.text")}</RequiredLabel>
                                <Textarea
                                    rows={6}
                                    value={body}
                                    invalid={problems.body !== undefined}
                                    onChange={(e) => setBody(e.target.value)}
                                />
                                {problems.body && <ErrorMessage>{t(`error.body-${problems.body}`)}</ErrorMessage>}
                            </Field>
                            <DialogActions>
                                <Button plain onClick={props.onClose}>
                                    {tg("button.cancel")}
                                </Button>
                                <PrimaryButton type={"submit"} loading={saving}>
                                    {t("button.create-draft")}
                                </PrimaryButton>
                            </DialogActions>
                        </FieldGroup>
                    </Fieldset>
                </Form>
            </DialogBody>
        </Dialog>
    );
}
