import {
    ArrowPathIcon,
    ArrowTopRightOnSquareIcon,
    CheckIcon,
    ClipboardIcon,
    LinkIcon,
} from "@heroicons/react/20/solid";
import {
    Button,
    Description,
    Dialog,
    DialogActions,
    DialogBody,
    DialogTitle,
    Divider,
    Field,
    Input,
    Label,
    PrimaryButton,
    Text,
    notify,
} from "components";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { shareLink } from "src/utils/share-link";
import { Visibility } from "src/api/generated";
import type { CollectionResponse } from "src/api/generated";

/** How long the copy button stays ticked after a successful copy */
const COPIED_FEEDBACK_MS = 1500;

/**
 * The properties for {@link ShareCollectionDialog}
 */
export type ShareCollectionDialogProps = {
    /** The collection whose link is being handed out, or `null` to keep the dialog closed */
    collection: CollectionResponse | null;
    /** Called when the dialog should close */
    onClose: () => void;
    /** Called after the link was created, replaced or withdrawn */
    onChanged: () => void | Promise<void>;
};

/**
 * The link a collection is shared through: shown, copied, replaced, withdrawn.
 *
 * @returns the dialog
 */
export function ShareCollectionDialog({ collection, onClose, onChanged }: ShareCollectionDialogProps) {
    const [t] = useTranslation("collection");
    const [tg] = useTranslation();

    const [shareToken, setShareToken] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        setShareToken(collection?.share_token ?? null);
        setCopied(false);
    }, [collection]);

    const link = shareToken === null ? null : shareLink("collections", shareToken);

    /**
     * Opens the collection to anyone holding the link, which mints the secret
     */
    async function enable() {
        if (collection === null) return;

        setBusy(true);
        try {
            await Api.collections.setVisibility(collection.uuid, Visibility.Unlisted);
            const updated = await Api.collections.get(collection.uuid);
            setShareToken(updated.share_token ?? null);
            notify.success(t("toast.share-link-created"));
            await onChanged();
        } finally {
            setBusy(false);
        }
    }

    /**
     * Mints a fresh secret, which stops every link handed out so far
     */
    async function rotate() {
        if (collection === null) return;

        setBusy(true);
        try {
            const { share_token: token } = await Api.collections.rotateShareToken(collection.uuid);
            setShareToken(token);
            notify.success(t("toast.share-link-rotated"));
            await onChanged();
        } finally {
            setBusy(false);
        }
    }

    /**
     * Takes the collection back to private, which drops the secret with it
     */
    async function revoke() {
        if (collection === null) return;

        setBusy(true);
        try {
            await Api.collections.setVisibility(collection.uuid, Visibility.Private);
            setShareToken(null);
            notify.success(t("toast.share-link-revoked"));
            await onChanged();
        } finally {
            setBusy(false);
        }
    }

    /**
     * Puts the link on the clipboard
     */
    async function copy() {
        if (link === null) return;

        try {
            await navigator.clipboard.writeText(link);
            setCopied(true);
            notify.success(t("toast.share-link-copied"));
            window.setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
        } catch {
            notify.error(t("toast.share-link-copy-failed"));
        }
    }

    return (
        <Dialog open={collection !== null} onClose={onClose}>
            <DialogTitle>{t("heading.share-collection")}</DialogTitle>
            <DialogBody>
                {link === null ? (
                    <div className={"flex flex-col gap-4"}>
                        <Text>{t("description.share-link-none")}</Text>
                        {collection?.visibility === Visibility.Public && (
                            <Text>{t("description.share-link-replaces-public")}</Text>
                        )}
                        <div>
                            <PrimaryButton disabled={busy} onClick={() => void enable()}>
                                <LinkIcon />
                                {t("button.create-share-link")}
                            </PrimaryButton>
                        </div>
                    </div>
                ) : (
                    <div className={"flex flex-col gap-6"}>
                        <Field>
                            <Label>{t("label.share-link")}</Label>
                            <div className={"flex flex-col gap-2 sm:flex-row sm:items-start"}>
                                <Input
                                    readOnly={true}
                                    value={link}
                                    aria-label={t("label.share-link")}
                                    onFocus={(event) => event.target.select()}
                                    className={"min-w-0 sm:flex-1"}
                                />
                                <div className={"flex shrink-0 gap-2"}>
                                    <Button outline={true} onClick={() => void copy()}>
                                        {copied ? <CheckIcon /> : <ClipboardIcon />}
                                        {t("button.copy-share-link")}
                                    </Button>
                                    <Button
                                        outline={true}
                                        external={true}
                                        href={link}
                                        target={"_blank"}
                                        aria-label={t("accessibility.open-share-link")}
                                    >
                                        <ArrowTopRightOnSquareIcon />
                                    </Button>
                                </div>
                            </div>
                            <Description>{t("description.share-link")}</Description>
                        </Field>

                        <Divider />

                        <div className={"flex flex-col gap-3"}>
                            <div className={"flex flex-wrap gap-2"}>
                                <Button outline={true} disabled={busy} onClick={() => void rotate()}>
                                    <ArrowPathIcon />
                                    {t("button.new-share-link")}
                                </Button>
                                <Button color={"red"} disabled={busy} onClick={() => void revoke()}>
                                    {t("button.revoke-share-link")}
                                </Button>
                            </div>
                            <Description>{t("description.share-link-rotate")}</Description>
                        </div>
                    </div>
                )}
            </DialogBody>
            <DialogActions>
                <Button plain onClick={onClose}>
                    {tg("button.close")}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
