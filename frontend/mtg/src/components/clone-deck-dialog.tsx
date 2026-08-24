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
    PrimaryButton,
    RequiredLabel,
} from "components";
import { useForm } from "@tanstack/react-form";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Api, handleError } from "src/api/api";
import { Visibility } from "src/api/generated";
import type { DeckResponse } from "src/api/generated";

/**
 * The properties for {@link CloneDeckDialog}
 */
export type CloneDeckDialogProps = {
    /** Whether the dialog is on screen */
    open: boolean;
    /** The share token the deck is being read through */
    token: string;
    /** What the deck is called where it was copied from, the name offered first */
    name: string;
    /** The format it is built for, which the copy inherits */
    format: string;
    /** What it says about itself, which the copy inherits */
    description?: string | null;
    /** The colours it may play, `null` for whatever its commander allows */
    colors?: string | null;
    /** Closes the dialog */
    onClose: () => void;
    /** Called with the deck that was just made */
    onCloned: (deck: DeckResponse) => void;
};

/**
 * Taking a shared deck over as one's own.
 *
 * The copy is a deck like any other from the moment it exists: private, owned
 * by whoever asked for it, and no longer tied to the link it came from. Only
 * the slots travel, not the owner's tags, because a tag belongs to the deck it
 * was invented for.
 *
 * @returns the dialog
 */
export function CloneDeckDialog({
    open,
    token,
    name,
    format,
    description,
    colors,
    onClose,
    onCloned,
}: CloneDeckDialogProps) {
    const [t] = useTranslation("deck");
    const [tg] = useTranslation();

    const form = useForm({
        defaultValues: { name: t("label.copy-of", { name }) },
        validators: {
            onSubmitAsync: async ({ value }) => {
                const cards = await handleError(Api.shared.decks.cards(token));
                const deck = await Api.decks.create({
                    name: value.name,
                    description: description ?? null,
                    format,
                    visibility: Visibility.Private,
                });

                if (cards.cards.length > 0) {
                    await Api.decks.cards.import(deck.uuid, {
                        replace: false,
                        cards: cards.cards.map((card) => ({
                            printing: card.printing,
                            quantity: card.quantity,
                            zone: card.zone,
                            foil: card.foil,
                        })),
                    });
                }

                if (colors != null) await Api.decks.setColors(deck.uuid, colors);

                form.reset();
                onCloned(deck);
            },
        },
    });

    useEffect(() => {
        form.reset({ name: t("label.copy-of", { name }) });
    }, [name, open]);

    return (
        <Dialog open={open} onClose={onClose}>
            <DialogTitle>{t("heading.clone-deck")}</DialogTitle>
            <Form onSubmit={form.handleSubmit}>
                <DialogBody>
                    <form.Field name={"name"}>
                        {(fieldApi) => (
                            <Field>
                                <RequiredLabel>{t("label.name")}</RequiredLabel>
                                <Description>{t("description.clone-deck")}</Description>
                                <Input
                                    autoFocus={true}
                                    required={true}
                                    maxLength={255}
                                    invalid={fieldApi.state.meta.errors.length > 0}
                                    value={fieldApi.state.value}
                                    onChange={(e) => fieldApi.handleChange(e.target.value)}
                                />
                                {fieldApi.state.meta.errors.map((error) => (
                                    <ErrorMessage key={String(error)}>{String(error)}</ErrorMessage>
                                ))}
                            </Field>
                        )}
                    </form.Field>
                </DialogBody>
                <DialogActions>
                    <Button plain type={"button"} onClick={onClose}>
                        {tg("button.cancel")}
                    </Button>
                    <PrimaryButton type={"submit"} loading={form.state.isSubmitting}>
                        {t("button.clone-deck")}
                    </PrimaryButton>
                </DialogActions>
            </Form>
        </Dialog>
    );
}
