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
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { shareLink } from "src/utils/share-link";
import type { ShareKind } from "src/utils/share-link";

/** How long the copy button stays ticked after a successful copy */
const COPIED_FEEDBACK_MS = 1500;

/**
 * What is being shared, and how it is opened, replaced and withdrawn
 */
export type ShareTarget = {
    /** What kind of thing this is, which decides the shape of the link */
    kind: ShareKind;
    /** The secret it is shared through, or `null` while it is not shared */
    shareToken: string | null;
    /** Whether it is public today, which creating a link would end */
    isPublic: boolean;
    /** Opens it to anyone holding the link; answers with the minted secret */
    enable: () => Promise<string | null>;
    /** Mints a fresh secret, stopping every link handed out so far */
    rotate: () => Promise<string>;
    /** Takes it back to private, which drops the secret */
    revoke: () => Promise<void>;
};

/**
 * The properties for {@link ShareDialog}
 */
export type ShareDialogProps = {
    /** What to share, or `null` to keep the dialog closed */
    target: ShareTarget | null;
    /** One sentence on what holding this link reveals */
    description: ReactNode;
    /** Called when the dialog should close */
    onClose: () => void;
    /** Called after the link was created, replaced or withdrawn */
    onChanged: () => void | Promise<void>;
};

/**
 * The link something is shared through: shown, copied, replaced, withdrawn.
 *
 * @returns the dialog
 */
export function ShareDialog({ target, description, onClose, onChanged }: ShareDialogProps) {
    const [tg] = useTranslation();

    const [shareToken, setShareToken] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        setShareToken(target?.shareToken ?? null);
        setCopied(false);
    }, [target]);

    const link = target === null || shareToken === null ? null : shareLink(target.kind, shareToken);

    /**
     * Runs one of the target's writes, then lets the page behind catch up
     *
     * @param write what to run
     * @param toast what to say once it went through
     */
    async function run(write: () => Promise<string | null | void>, toast: string) {
        setBusy(true);
        try {
            const token = await write();
            setShareToken(typeof token === "string" ? token : null);
            notify.success(toast);
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
            notify.success(tg("toast.share-link-copied"));
            window.setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
        } catch {
            notify.error(tg("toast.share-link-copy-failed"));
        }
    }

    return (
        <Dialog open={target !== null} onClose={onClose}>
            <DialogTitle>{tg("heading.share")}</DialogTitle>
            <DialogBody>
                {link === null ? (
                    <div className={"flex flex-col gap-4"}>
                        <Text>{tg("description.share-link-none")}</Text>
                        {target?.isPublic === true && <Text>{tg("description.share-link-replaces-public")}</Text>}
                        <div>
                            <PrimaryButton
                                disabled={busy}
                                onClick={() =>
                                    void (target !== null && run(target.enable, tg("toast.share-link-created")))
                                }
                            >
                                <LinkIcon />
                                {tg("button.create-share-link")}
                            </PrimaryButton>
                        </div>
                    </div>
                ) : (
                    <div className={"flex flex-col gap-6"}>
                        <Field>
                            <Label>{tg("label.share-link")}</Label>
                            <div className={"flex flex-col gap-2 sm:flex-row sm:items-start"}>
                                <Input
                                    readOnly={true}
                                    value={link}
                                    aria-label={tg("label.share-link")}
                                    onFocus={(event) => event.target.select()}
                                    className={"min-w-0 sm:flex-1"}
                                />
                                <div className={"flex shrink-0 gap-2"}>
                                    <Button outline={true} onClick={() => void copy()}>
                                        {copied ? <CheckIcon /> : <ClipboardIcon />}
                                        {tg("button.copy-share-link")}
                                    </Button>
                                    <Button
                                        outline={true}
                                        external={true}
                                        href={link}
                                        target={"_blank"}
                                        aria-label={tg("accessibility.open-share-link")}
                                    >
                                        <ArrowTopRightOnSquareIcon />
                                    </Button>
                                </div>
                            </div>
                            <Description>{description}</Description>
                        </Field>

                        <Divider />

                        <div className={"flex flex-col gap-3"}>
                            <div className={"flex flex-wrap gap-2"}>
                                <Button
                                    outline={true}
                                    disabled={busy}
                                    onClick={() =>
                                        void (target !== null && run(target.rotate, tg("toast.share-link-rotated")))
                                    }
                                >
                                    <ArrowPathIcon />
                                    {tg("button.new-share-link")}
                                </Button>
                                <Button
                                    color={"red"}
                                    disabled={busy}
                                    onClick={() =>
                                        void (target !== null && run(target.revoke, tg("toast.share-link-revoked")))
                                    }
                                >
                                    {tg("button.revoke-share-link")}
                                </Button>
                            </div>
                            <Description>{tg("description.share-link-rotate")}</Description>
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
