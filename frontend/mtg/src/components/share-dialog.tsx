import { ArrowPathIcon, ArrowRightStartOnRectangleIcon, CheckIcon, ClipboardIcon } from "@heroicons/react/20/solid";
import {
    Button,
    Description,
    Dialog,
    DialogActions,
    DialogBody,
    DialogTitle,
    Input,
    Label,
    Radio,
    RadioField,
    RadioGroup,
    Subheading,
    notify,
} from "components";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { Visibility } from "src/api/generated";
import { DeckPeople } from "src/components/deck-people";
import { publicLink, shareLink } from "src/utils/share-link";
import type { ShareKind } from "src/utils/share-link";

/** How long the copy button stays ticked after a successful copy */
const COPIED_FEEDBACK_MS = 1500;

/** The writes General access makes, per kind of thing shared */
const ACCESS: Record<
    ShareKind,
    {
        setVisibility: (uuid: string, visibility: Visibility) => Promise<unknown>;
        shareToken: (uuid: string) => Promise<string | null>;
        rotate: (uuid: string) => Promise<string>;
    }
> = {
    decks: {
        setVisibility: Api.decks.setVisibility,
        shareToken: async (uuid) => (await Api.decks.get(uuid)).share_token ?? null,
        rotate: async (uuid) => (await Api.decks.rotateShareToken(uuid)).share_token,
    },
    collections: {
        setVisibility: Api.collections.setVisibility,
        shareToken: async (uuid) => (await Api.collections.get(uuid)).share_token ?? null,
        rotate: async (uuid) => (await Api.collections.rotateShareToken(uuid)).share_token,
    },
};

/** The Visibilities in the order they are offered */
const VISIBILITIES: Array<Visibility> = [Visibility.Private, Visibility.Unlisted, Visibility.Public];

/**
 * What is being shared, as the page behind the dialog knows it
 */
export type ShareSubject = {
    /** Whether a deck or a collection, which decides the links and the People section */
    kind: ShareKind;
    /** Which one it is */
    uuid: string;
    /** Who can see it today */
    visibility: Visibility;
    /** The secret of its Share link, `null` while it is not Unlisted */
    shareToken: string | null;
    /** Whether the reader owns it; a Collaborator gets the read-only People view */
    owner: boolean;
};

/**
 * The properties for {@link ShareDialog}
 */
export type ShareDialogProps = {
    /** What to share, or `null` to keep the dialog closed */
    subject: ShareSubject | null;
    /** One sentence on what holding the Share link reveals */
    linkDescription: ReactNode;
    /** Called when the dialog should close */
    onClose: () => void;
    /** Called after the Visibility or the Share link changed */
    onChanged: () => void | Promise<void>;
    /** Offered to a Collaborator: leaving the deck, confirmed by the caller */
    onLeave?: () => void;
};

/**
 * The one Share window: who a deck is shared with, and who else can see it.
 *
 * Decks get the People section (the owner manages them, a Collaborator reads
 * them) and General access; collections only the latter.
 *
 * @returns the dialog
 */
export function ShareDialog({ subject, linkDescription, onClose, onChanged, onLeave }: ShareDialogProps) {
    const [tg] = useTranslation();

    const [visibility, setVisibility] = useState<Visibility>(Visibility.Private);
    const [shareToken, setShareToken] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [copied, setCopied] = useState(false);

    const showing = subject === null ? null : `${subject.kind}:${subject.uuid}`;
    useEffect(() => {
        setVisibility(subject?.visibility ?? Visibility.Private);
        setShareToken(subject?.shareToken ?? null);
        setCopied(false);
    }, [showing]);

    const owner = subject?.owner ?? false;
    const link =
        subject === null
            ? null
            : visibility === Visibility.Unlisted && shareToken !== null
              ? shareLink(subject.kind, shareToken)
              : visibility === Visibility.Public
                ? publicLink(subject.kind, subject.uuid)
                : null;

    /**
     * Saves a new Visibility, learning the Share link it minted
     *
     * @param next the Visibility to switch to
     */
    async function choose(next: Visibility) {
        if (subject === null || next === visibility) return;
        setBusy(true);
        try {
            const access = ACCESS[subject.kind];
            await access.setVisibility(subject.uuid, next);
            const token = next === Visibility.Unlisted ? await access.shareToken(subject.uuid) : null;
            setVisibility(next);
            setShareToken(token);
            notify.success(tg("toast.visibility-changed"));
            await onChanged();
        } finally {
            setBusy(false);
        }
    }

    /**
     * Mints a fresh Share link, stopping the one handed out so far
     */
    async function rotate() {
        if (subject === null) return;
        setBusy(true);
        try {
            setShareToken(await ACCESS[subject.kind].rotate(subject.uuid));
            notify.success(tg("toast.share-link-rotated"));
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

    /**
     * What a Visibility is called in the Share window
     *
     * @param option the Visibility
     *
     * @returns its label
     */
    function accessLabel(option: Visibility): string {
        switch (option) {
            case Visibility.Private:
                return tg("label.access-private");
            case Visibility.Unlisted:
                return tg("label.access-unlisted");
            case Visibility.Public:
                return tg("label.access-public");
        }
    }

    /**
     * What choosing a Visibility means, and what it ends for good
     *
     * @param option the Visibility offered
     *
     * @returns the lines under the option
     */
    function consequences(option: Visibility): ReactNode {
        const what =
            option === Visibility.Private
                ? subject?.kind === "decks"
                    ? tg("description.access-private-people")
                    : tg("description.access-private")
                : option === Visibility.Unlisted
                  ? tg("description.access-unlisted")
                  : tg("description.access-public");
        const endsLink = visibility === Visibility.Unlisted && option !== Visibility.Unlisted && shareToken !== null;
        return (
            <>
                {what}
                {endsLink && (
                    <span className={"mt-1 block text-amber-700 dark:text-amber-400"}>
                        {tg("description.access-ends-link")}
                    </span>
                )}
            </>
        );
    }

    return (
        <Dialog open={subject !== null} onClose={onClose} size={"xl"}>
            <DialogTitle>{owner ? tg("heading.share") : tg("heading.people")}</DialogTitle>
            <DialogBody>
                <div className={"flex flex-col gap-8"}>
                    {subject?.kind === "decks" && <DeckPeople deckUuid={subject.uuid} owner={owner} />}

                    {owner && (
                        <section className={"flex flex-col gap-4"}>
                            <Subheading>{tg("heading.general-access")}</Subheading>
                            <RadioGroup
                                value={visibility}
                                onChange={(next: string) => {
                                    const picked = VISIBILITIES.find((option) => option === next);
                                    if (picked !== undefined) void choose(picked);
                                }}
                                disabled={busy}
                                aria-label={tg("heading.general-access")}
                            >
                                {VISIBILITIES.map((option) => (
                                    <RadioField key={option}>
                                        <Radio value={option} color={"lime"} />
                                        <Label>{accessLabel(option)}</Label>
                                        <Description>{consequences(option)}</Description>
                                    </RadioField>
                                ))}
                            </RadioGroup>

                            {link !== null && (
                                <div className={"flex flex-col gap-2"}>
                                    <div className={"flex gap-2"}>
                                        <Input
                                            readOnly={true}
                                            value={link}
                                            aria-label={tg("label.share-link")}
                                            onFocus={(event) => event.target.select()}
                                            className={"min-w-0 flex-1"}
                                        />
                                        <Button outline={true} onClick={() => void copy()} className={"shrink-0"}>
                                            {copied ? <CheckIcon /> : <ClipboardIcon />}
                                            {tg("button.copy-share-link")}
                                        </Button>
                                        {visibility === Visibility.Unlisted && (
                                            <Button
                                                outline={true}
                                                disabled={busy}
                                                onClick={() => void rotate()}
                                                aria-label={tg("button.new-share-link")}
                                                title={tg("button.new-share-link")}
                                                className={"shrink-0"}
                                            >
                                                <ArrowPathIcon />
                                            </Button>
                                        )}
                                    </div>
                                    {visibility === Visibility.Unlisted && <Description>{linkDescription}</Description>}
                                </div>
                            )}
                        </section>
                    )}
                </div>
            </DialogBody>
            <DialogActions>
                {!owner && onLeave !== undefined && (
                    <Button color={"red"} onClick={onLeave} className={"sm:mr-auto"}>
                        <ArrowRightStartOnRectangleIcon />
                        {tg("button.leave-deck")}
                    </Button>
                )}
                <Button plain onClick={onClose}>
                    {tg("button.close")}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
