import { Link, createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import {
    GlobeAltIcon,
    LinkIcon,
    LockClosedIcon,
    PencilSquareIcon,
    RectangleStackIcon,
    TrashIcon,
} from "@heroicons/react/20/solid";
import type { BadgeProps } from "components";
import {
    Alert,
    AlertActions,
    AlertDescription,
    AlertTitle,
    Badge,
    BadgeButton,
    Button,
    Dropdown,
    DropdownButton,
    DropdownDescription,
    DropdownItem,
    DropdownLabel,
    DropdownMenu,
    EmptyState,
    Heading,
    PrimaryButton,
    StackedList,
    StackedListFlexRow,
    Text,
    notify,
} from "components";
import { useState } from "react";
import type { ComponentType } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { Visibility } from "src/api/generated";
import type { DeckResponse } from "src/api/generated";
import { DeckDialog } from "src/components/deck-dialog";
import { useDeckLabels } from "src/components/deck-labels";
import { RequireAccount } from "src/components/require-account";
import { ShareDialog } from "src/components/share-dialog";
import { deckShareTarget } from "src/utils/share-targets";

/** How each visibility is shown */
const VISIBILITY_BADGE: Record<
    Visibility,
    {
        color: BadgeProps["color"];
        Icon: ComponentType<{ className?: string }>;
        key: string;
        descriptionKey: string;
    }
> = {
    Public: {
        color: "green",
        Icon: GlobeAltIcon,
        key: "label.visibility-public",
        descriptionKey: "description.visibility-public",
    },
    Unlisted: {
        color: "amber",
        Icon: LinkIcon,
        key: "label.visibility-unlisted",
        descriptionKey: "description.visibility-unlisted",
    },
    Private: {
        color: "zinc",
        Icon: LockClosedIcon,
        key: "label.visibility-private",
        descriptionKey: "description.visibility-private",
    },
};

/** Menu order, from closed to open */
const VISIBILITY_ORDER: Visibility[] = [Visibility.Private, Visibility.Unlisted, Visibility.Public];

export const Route = createFileRoute("/_menu/decks/")({
    loader: async () => {
        const [decks, offered] = await Promise.all([Api.decks.list(), Api.decks.formats()]);
        return { decks, formats: offered.formats };
    },
    component: RouteComponent,
});

/**
 * The account's decks.
 *
 * @returns the page
 */
function RouteComponent() {
    const [t] = useTranslation("deck");
    const [tg] = useTranslation();
    const { decks, formats } = Route.useLoaderData();
    const router = useRouter();
    const navigate = useNavigate();
    const labels = useDeckLabels();
    const [dialog, setDialog] = useState<{ deck: DeckResponse | null } | null>(null);
    const [sharing, setSharing] = useState<DeckResponse | null>(null);
    const [confirming, setConfirming] = useState<DeckResponse | null>(null);

    /**
     * Re-runs the loader after a write
     *
     * @returns a promise resolving once the loader has finished
     */
    const refresh = () => router.invalidate();

    /**
     * Writes a deck's visibility straight from the badge menu
     *
     * @param deck the deck to change
     * @param visibility the visibility to switch to
     */
    async function changeVisibility(deck: DeckResponse, visibility: Visibility) {
        if (deck.visibility === visibility) return;
        await Api.decks.setVisibility(deck.uuid, visibility);
        notify.success(t("toast.visibility-changed"));
        await refresh();
    }

    /**
     * Deletes a deck after the confirmation was accepted
     *
     * @param deck the deck to delete
     */
    async function remove(deck: DeckResponse) {
        setConfirming(null);
        await Api.decks.delete(deck.uuid);
        notify.success(t("toast.deck-deleted"));
        await refresh();
    }

    return (
        <RequireAccount>
            <div className={"flex flex-col gap-6"}>
                <div className={"flex flex-wrap items-start justify-between gap-3"}>
                    <div className={"flex flex-col gap-2"}>
                        <Heading>{t("heading.decks")}</Heading>
                        <Text>{t("description.decks")}</Text>
                    </div>
                    <PrimaryButton onClick={() => setDialog({ deck: null })}>{t("button.create-deck")}</PrimaryButton>
                </div>

                {decks.length === 0 ? (
                    <EmptyState
                        icon={<RectangleStackIcon />}
                        title={t("heading.no-decks")}
                        description={t("description.no-decks")}
                    />
                ) : (
                    <StackedList>
                        {decks.map((deck) => {
                            const badge = VISIBILITY_BADGE[deck.visibility];
                            return (
                                <StackedListFlexRow key={deck.uuid}>
                                    <RectangleStackIcon
                                        className={"mt-1 size-5 shrink-0 text-zinc-400 dark:text-zinc-500"}
                                    />
                                    <div className={"flex min-w-0 flex-1 flex-col gap-1.5"}>
                                        <Link
                                            to={"/decks/$deckUuid/cards"}
                                            params={{ deckUuid: deck.uuid }}
                                            className={
                                                "block truncate font-semibold text-zinc-950 hover:underline dark:text-white"
                                            }
                                        >
                                            {deck.name}
                                        </Link>
                                        {deck.description != null && deck.description !== "" && (
                                            <Text className={"line-clamp-2"}>{deck.description}</Text>
                                        )}
                                        <div className={"flex flex-wrap items-center gap-2"}>
                                            <Badge color={"blue"}>{labels.format(deck.format)}</Badge>
                                            <Dropdown>
                                                <DropdownButton
                                                    as={BadgeButton}
                                                    color={badge.color}
                                                    aria-label={t("accessibility.change-visibility", {
                                                        name: deck.name,
                                                    })}
                                                >
                                                    <badge.Icon className={"size-3"} />
                                                    {t(badge.key)}
                                                </DropdownButton>
                                                <DropdownMenu anchor={"bottom start"}>
                                                    {VISIBILITY_ORDER.map((visibility) => {
                                                        const option = VISIBILITY_BADGE[visibility];
                                                        return (
                                                            <DropdownItem
                                                                key={visibility}
                                                                onClick={() => void changeVisibility(deck, visibility)}
                                                            >
                                                                <option.Icon />
                                                                <DropdownLabel>{t(option.key)}</DropdownLabel>
                                                                <DropdownDescription>
                                                                    {t(option.descriptionKey)}
                                                                </DropdownDescription>
                                                            </DropdownItem>
                                                        );
                                                    })}
                                                </DropdownMenu>
                                            </Dropdown>
                                        </div>
                                    </div>
                                    <div className={"flex items-center gap-1"}>
                                        <Button
                                            plain
                                            aria-label={t("accessibility.share-deck", { name: deck.name })}
                                            onClick={() => setSharing(deck)}
                                        >
                                            <LinkIcon className={"size-5"} />
                                        </Button>
                                        <Button
                                            plain
                                            aria-label={t("accessibility.edit-deck", { name: deck.name })}
                                            onClick={() => setDialog({ deck })}
                                        >
                                            <PencilSquareIcon className={"size-5"} />
                                        </Button>
                                        <Button
                                            plain
                                            aria-label={t("accessibility.delete-deck", { name: deck.name })}
                                            onClick={() => setConfirming(deck)}
                                        >
                                            <TrashIcon className={"size-5"} />
                                        </Button>
                                    </div>
                                </StackedListFlexRow>
                            );
                        })}
                    </StackedList>
                )}

                <DeckDialog
                    open={dialog !== null}
                    deck={dialog?.deck ?? null}
                    formats={formats}
                    onClose={() => setDialog(null)}
                    onSaved={(created) => {
                        setDialog(null);
                        notify.success(created !== null ? t("toast.deck-created") : t("toast.deck-updated"));
                        if (created !== null) {
                            void navigate({ to: "/decks/$deckUuid/cards", params: { deckUuid: created.uuid } });
                            return;
                        }
                        void refresh();
                    }}
                />

                <ShareDialog
                    target={sharing === null ? null : deckShareTarget(sharing)}
                    description={t("description.share-link")}
                    onClose={() => setSharing(null)}
                    onChanged={refresh}
                />

                <Alert open={confirming !== null} onClose={() => setConfirming(null)}>
                    <AlertTitle>{t("heading.delete-deck")}</AlertTitle>
                    <AlertDescription>
                        {t("description.delete-deck", { name: confirming?.name ?? "" })}
                    </AlertDescription>
                    <AlertActions>
                        <Button plain onClick={() => setConfirming(null)}>
                            {tg("button.cancel")}
                        </Button>
                        <Button color={"red"} onClick={() => void (confirming && remove(confirming))}>
                            {t("button.delete-deck")}
                        </Button>
                    </AlertActions>
                </Alert>
            </div>
        </RequireAccount>
    );
}
