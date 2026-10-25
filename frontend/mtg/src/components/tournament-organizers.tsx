import { useNavigate } from "@tanstack/react-router";
import { ArrowRightStartOnRectangleIcon, PlusIcon, TrashIcon, XMarkIcon } from "@heroicons/react/20/solid";
import {
    Badge,
    Button,
    ConfirmDialog,
    Description,
    ErrorMessage,
    Field,
    Input,
    Label,
    Subheading,
    Text,
    notify,
} from "components";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { OrganizerRole } from "src/api/generated";
import type { OrganizerResponse, TournamentResponse } from "src/api/generated";
import { useAccount } from "src/context/account";
import { isFormError } from "src/utils/error";
import { useLoaded } from "src/utils/use-loaded";

/**
 * The properties for {@link TournamentOrganizers}
 */
export type TournamentOrganizersProps = {
    /** The Tournament whose Organizers are shown */
    tournament: TournamentResponse;
    /** The part the reader plays in running it */
    role: OrganizerRole;
};

/**
 * Who runs a Tournament: the Owner, the Co-organizers and a pending handover.
 *
 * Every Organizer names Co-organizers by username. The Owner takes off any of
 * them and offers the Tournament to another Account; a Co-organizer leaves.
 *
 * @returns the Organizers tab
 */
export function TournamentOrganizers({ tournament, role }: TournamentOrganizersProps) {
    const [t] = useTranslation("tournament");
    const { account } = useAccount();
    const navigate = useNavigate();
    const organizers = useLoaded(() => Api.tournaments.organizers.list(tournament.uuid), [tournament.uuid]);

    const [username, setUsername] = useState("");
    const [addError, setAddError] = useState<string | null>(null);
    const [heir, setHeir] = useState("");
    const [offerError, setOfferError] = useState<string | null>(null);
    const [leaving, setLeaving] = useState(false);
    const [busy, setBusy] = useState(false);

    const owner = role === OrganizerRole.Owner;
    const list = organizers.data;

    /**
     * Names the Account in the field a Co-organizer
     */
    async function add() {
        const name = username.trim();
        if (name === "") return;
        setBusy(true);
        try {
            const result = await Api.tournaments.organizers.add(tournament.uuid, name);
            if (isFormError(result)) {
                if (result.error.owner) setAddError(t("error.co-organizer-is-owner"));
                else if (result.error.already_co_organizer) setAddError(t("error.co-organizer-already"));
                else if (result.error.too_many_unknown_usernames) setAddError(t("error.too-many-unknown-usernames"));
                else setAddError(t("error.unknown-username"));
                return;
            }
            setUsername("");
            setAddError(null);
            notify.success(t("toast.co-organizer-added", { username: result.username }));
            organizers.reload();
        } finally {
            setBusy(false);
        }
    }

    /**
     * Takes a Co-organizer off the Tournament, as its Owner
     *
     * @param co the Co-organizer
     */
    async function remove(co: OrganizerResponse) {
        setBusy(true);
        try {
            await Api.tournaments.organizers.remove(tournament.uuid, co.account);
            notify.success(t("toast.co-organizer-removed", { username: co.username }));
            organizers.reload();
        } finally {
            setBusy(false);
        }
    }

    /**
     * Takes the reader off the Co-organizers, after the confirmation was accepted
     */
    async function leave() {
        if (account === null) return;
        await Api.tournaments.organizers.remove(tournament.uuid, account.uuid);
        setLeaving(false);
        notify.success(t("toast.co-organizer-left"));
        await navigate({ to: "/tournaments/mine" });
    }

    /**
     * Offers the Tournament to the Account in the field
     */
    async function offer() {
        const name = heir.trim();
        if (name === "") return;
        setBusy(true);
        try {
            const result = await Api.tournaments.handover.offer(tournament.uuid, name);
            if (isFormError(result)) {
                if (result.error.own_account) setOfferError(t("error.handover-to-self"));
                else if (result.error.too_many_unknown_usernames) setOfferError(t("error.too-many-unknown-usernames"));
                else setOfferError(t("error.unknown-username"));
                return;
            }
            setHeir("");
            setOfferError(null);
            notify.success(t("toast.handover-offered", { username: result.username }));
            organizers.reload();
        } finally {
            setBusy(false);
        }
    }

    /**
     * Withdraws the pending offer
     */
    async function withdraw() {
        setBusy(true);
        try {
            await Api.tournaments.handover.withdraw(tournament.uuid);
            notify.success(t("toast.handover-withdrawn"));
            organizers.reload();
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className={"flex flex-col gap-10"}>
            <section className={"flex flex-col gap-4"}>
                <Subheading>{t("heading.organizers")}</Subheading>

                <Field>
                    <Label>{t("label.co-organizer-username")}</Label>
                    <div className={"mt-2 flex flex-col gap-2 sm:flex-row sm:items-start"}>
                        <Input
                            className={"min-w-0 sm:flex-1"}
                            maxLength={32}
                            value={username}
                            invalid={addError !== null}
                            onChange={(event) => {
                                setUsername(event.target.value);
                                setAddError(null);
                            }}
                            onKeyDown={(event) => {
                                if (event.key === "Enter") void add();
                            }}
                        />
                        <Button
                            className={"shrink-0"}
                            disabled={busy || username.trim() === ""}
                            onClick={() => void add()}
                        >
                            <PlusIcon />
                            {t("button.add-co-organizer")}
                        </Button>
                    </div>
                    {addError !== null ? (
                        <ErrorMessage>{addError}</ErrorMessage>
                    ) : (
                        <Description>{t("description.co-organizers")}</Description>
                    )}
                </Field>

                {list !== null && (
                    <ul className={"flex flex-col divide-y divide-zinc-950/5 dark:divide-white/10"}>
                        <li className={"flex items-center gap-3 py-2"}>
                            <span className={"min-w-0 flex-1 truncate text-sm/6 text-zinc-950 dark:text-white"}>
                                {list.owner?.username ?? t("label.tombstone")}
                            </span>
                            <Badge color={"sky"}>{t("label.role-owner")}</Badge>
                        </li>
                        {list.co_organizers.map((co) => (
                            <li key={co.account} className={"flex items-center gap-3 py-2"}>
                                <span className={"min-w-0 flex-1 truncate text-sm/6 text-zinc-950 dark:text-white"}>
                                    {co.username}
                                </span>
                                <Badge color={"zinc"}>{t("label.role-co-organizer")}</Badge>
                                {owner && (
                                    <Button
                                        plain={true}
                                        disabled={busy}
                                        aria-label={t("accessibility.remove-co-organizer", {
                                            username: co.username,
                                        })}
                                        onClick={() => void remove(co)}
                                    >
                                        <TrashIcon />
                                    </Button>
                                )}
                                {!owner && co.account === account?.uuid && (
                                    <Button plain={true} disabled={busy} onClick={() => setLeaving(true)}>
                                        <ArrowRightStartOnRectangleIcon />
                                        {t("button.leave-tournament")}
                                    </Button>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            {owner && list !== null && (
                <section className={"flex flex-col gap-4"}>
                    <Subheading>{t("heading.handover")}</Subheading>
                    {list.handover != null ? (
                        <div className={"flex flex-col gap-3 sm:flex-row sm:items-center"}>
                            <Text className={"min-w-0 flex-1"}>
                                {t("description.handover-pending", { username: list.handover.username })}
                            </Text>
                            <Button outline={true} disabled={busy} onClick={() => void withdraw()}>
                                <XMarkIcon />
                                {t("button.withdraw-handover")}
                            </Button>
                        </div>
                    ) : (
                        <Field>
                            <Label>{t("label.handover-username")}</Label>
                            <div className={"mt-2 flex flex-col gap-2 sm:flex-row sm:items-start"}>
                                <Input
                                    className={"min-w-0 sm:flex-1"}
                                    maxLength={32}
                                    value={heir}
                                    invalid={offerError !== null}
                                    onChange={(event) => {
                                        setHeir(event.target.value);
                                        setOfferError(null);
                                    }}
                                    onKeyDown={(event) => {
                                        if (event.key === "Enter") void offer();
                                    }}
                                />
                                <Button
                                    className={"shrink-0"}
                                    outline={true}
                                    disabled={busy || heir.trim() === ""}
                                    onClick={() => void offer()}
                                >
                                    {t("button.offer-handover")}
                                </Button>
                            </div>
                            {offerError !== null ? (
                                <ErrorMessage>{offerError}</ErrorMessage>
                            ) : (
                                <Description>{t("description.handover")}</Description>
                            )}
                        </Field>
                    )}
                </section>
            )}

            <ConfirmDialog
                open={leaving}
                onClose={() => setLeaving(false)}
                onConfirm={leave}
                title={t("heading.leave-tournament")}
                description={t("description.leave-tournament", { name: tournament.name })}
                confirmLabel={t("button.leave-tournament")}
            />
        </div>
    );
}
