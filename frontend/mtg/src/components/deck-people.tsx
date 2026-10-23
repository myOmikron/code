import { CheckIcon, ChevronDownIcon, PlusIcon, TrashIcon } from "@heroicons/react/20/solid";
import {
    Badge,
    Button,
    Combobox,
    ComboboxDescription,
    ComboboxLabel,
    ComboboxOption,
    Description,
    Dropdown,
    DropdownButton,
    DropdownDescription,
    DropdownDivider,
    DropdownItem,
    DropdownLabel,
    DropdownMenu,
    ErrorMessage,
    Field,
    Listbox,
    ListboxDescription,
    ListboxLabel,
    ListboxOption,
    Subheading,
    notify,
} from "components";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import type { CollaboratorLevel, DeckCollaboratorResponse, DeckOwnerResponse } from "src/api/generated";
import { useDeckLabels } from "src/components/deck-labels";
import { isFormError } from "src/utils/error";

/** How long typing pauses before the usernames are searched */
const SEARCH_DELAY_MS = 250;

/** How many characters a username search needs, as the service counts them */
const SEARCH_MIN_CHARS = 2;

/** The roles a Collaborator can be named at, in the order they are offered */
const LEVELS: Array<CollaboratorLevel> = ["Viewer", "Editor"];

/**
 * The properties for {@link DeckPeople}
 */
export type DeckPeopleProps = {
    /** The deck whose people are shown */
    deckUuid: string;
    /** Whether the reader owns the deck and so manages its Collaborators */
    owner: boolean;
};

/**
 * Who a deck is shared with: the owner first, then its Collaborators.
 *
 * The owner adds Accounts by username, picked from a search as they type or
 * spelled out in full, changes their role and removes
 * them, each saved at once; a Collaborator reads the list.
 *
 * @returns the People section of the Share window
 */
export function DeckPeople({ deckUuid, owner }: DeckPeopleProps) {
    const [t] = useTranslation("deck");
    const [tg] = useTranslation();
    const labels = useDeckLabels();

    const [deckOwner, setDeckOwner] = useState<DeckOwnerResponse | null>(null);
    const [collaborators, setCollaborators] = useState<Array<DeckCollaboratorResponse>>([]);
    const [username, setUsername] = useState<string | null>(null);
    const [query, setQuery] = useState("");
    const [suggestions, setSuggestions] = useState<Array<string>>([]);
    const [searchLimited, setSearchLimited] = useState(false);
    const [level, setLevel] = useState<CollaboratorLevel>("Viewer");
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        setUsername(null);
        setQuery("");
        setLevel("Viewer");
        setError(null);
        setDeckOwner(null);
        setCollaborators([]);
        let gone = false;
        Api.decks.collaborators
            .list(deckUuid)
            .then((list) => {
                if (gone) return;
                setDeckOwner(list.owner);
                setCollaborators(list.collaborators);
            })
            .catch(() => undefined);
        return () => {
            gone = true;
        };
    }, [deckUuid]);

    useEffect(() => {
        const prefix = query.trim();
        if (!owner || prefix.length < SEARCH_MIN_CHARS) {
            setSuggestions([]);
            return;
        }
        let gone = false;
        const timer = window.setTimeout(() => {
            Api.decks.collaborators
                .candidates(deckUuid, prefix)
                .then((found) => {
                    if (gone || found === null) return;
                    setSuggestions(found.accounts.map((account) => account.username));
                    setSearchLimited(found.too_many_searches);
                })
                .catch(() => undefined);
        }, SEARCH_DELAY_MS);
        return () => {
            gone = true;
            window.clearTimeout(timer);
        };
    }, [deckUuid, owner, query]);

    const typed = query.trim();
    const options = typed === "" || suggestions.length > 0 ? suggestions : [typed];
    const known = username !== null && onDeck(username);

    /**
     * Whether an Account of this name owns the deck or collaborates on it
     *
     * @param name the username
     *
     * @returns whether it is on the deck already
     */
    function onDeck(name: string): boolean {
        const normalized = name.toLowerCase();
        return (
            deckOwner?.username.toLowerCase() === normalized ||
            collaborators.some((collaborator) => collaborator.username.toLowerCase() === normalized)
        );
    }

    /**
     * Reads the people again after a change
     */
    async function reload() {
        const list = await Api.decks.collaborators.list(deckUuid);
        setDeckOwner(list.owner);
        setCollaborators(list.collaborators);
    }

    /**
     * Names an Account on the deck, or changes the role it is named at
     *
     * @param name the Account's username
     * @param next the role to name it at
     *
     * @returns why it did not go through, `null` when it did
     */
    async function put(name: string, next: CollaboratorLevel): Promise<string | null> {
        setBusy(true);
        try {
            const result = await Api.decks.collaborators.put(deckUuid, name, next);
            if (isFormError(result)) {
                if (result.error.own_account) return t("error.collaborator-is-owner");
                if (result.error.too_many_unknown_usernames) return t("error.collaborator-too-many-unknown");
                return t("error.collaborator-unknown-username");
            }
            await reload();
            return null;
        } finally {
            setBusy(false);
        }
    }

    /**
     * Adds what is in the field at the picked role
     */
    async function add() {
        const name = username?.trim() ?? "";
        if (name === "" || known) return;
        const failed = await put(name, level);
        setError(failed);
        if (failed === null) {
            setUsername(null);
            setQuery("");
            notify.success(t("toast.collaborator-added", { username: name }));
        }
    }

    /**
     * Gives a Collaborator another role
     *
     * @param collaborator the Collaborator
     * @param next the role it gets
     */
    async function changeRole(collaborator: DeckCollaboratorResponse, next: CollaboratorLevel) {
        if (collaborator.level === next) return;
        const failed = await put(collaborator.username, next);
        if (failed !== null) {
            notify.error(failed);
            return;
        }
        notify.success(
            t("toast.collaborator-role-changed", {
                username: collaborator.username,
                role: labels.collaboratorLevel(next),
            }),
        );
    }

    /**
     * Takes a Collaborator off the deck; the toast carries an undo
     *
     * @param collaborator the Collaborator to remove
     */
    async function remove(collaborator: DeckCollaboratorResponse) {
        setBusy(true);
        try {
            await Api.decks.collaborators.remove(deckUuid, collaborator.account);
            await reload();
        } finally {
            setBusy(false);
        }
        const toast = notify.success(
            <span className={"flex flex-wrap items-center gap-3"}>
                {t("toast.collaborator-removed", { username: collaborator.username })}
                <button
                    type={"button"}
                    className={"font-semibold underline underline-offset-2"}
                    onClick={() => {
                        notify.dismiss(toast);
                        void undo(collaborator);
                    }}
                >
                    {tg("button.undo")}
                </button>
            </span>,
        );
    }

    /**
     * Names a Collaborator the toast just removed again, at its old role
     *
     * @param collaborator the Collaborator as it was
     */
    async function undo(collaborator: DeckCollaboratorResponse) {
        const failed = await put(collaborator.username, collaborator.level);
        if (failed !== null) notify.error(failed);
    }

    /**
     * What a role lets a Collaborator do, in one line
     *
     * @param option the role
     *
     * @returns the line
     */
    function roleDescription(option: CollaboratorLevel): string {
        return option === "Editor" ? t("description.collaborator-editor") : t("description.collaborator-viewer");
    }

    return (
        <section className={"flex flex-col gap-4"}>
            <Subheading>{tg("heading.people")}</Subheading>

            {owner && (
                <Field>
                    <div className={"flex flex-col gap-2 sm:flex-row sm:items-start"}>
                        <div className={"min-w-0 sm:flex-1"}>
                            <Combobox<string | null>
                                autoFocus={true}
                                value={username}
                                options={options}
                                displayValue={(name) => name ?? ""}
                                filter={(name, search) =>
                                    name?.toLowerCase().startsWith(search.trim().toLowerCase()) ?? false
                                }
                                placeholder={t("label.collaborator-username")}
                                aria-label={t("label.collaborator-username")}
                                invalid={error !== null}
                                onQueryChange={setQuery}
                                onChange={(name) => {
                                    setUsername(name);
                                    setError(null);
                                }}
                            >
                                {(name) => (
                                    <ComboboxOption value={name} disabled={onDeck(name)}>
                                        <ComboboxLabel>{name}</ComboboxLabel>
                                        {onDeck(name) && (
                                            <ComboboxDescription>{t("label.collaborator-on-deck")}</ComboboxDescription>
                                        )}
                                    </ComboboxOption>
                                )}
                            </Combobox>
                        </div>
                        <div className={"flex items-start gap-2"}>
                            <Listbox
                                value={level}
                                onChange={setLevel}
                                aria-label={t("label.collaborator-level")}
                                className={"min-w-0 flex-1 sm:w-36 sm:flex-none"}
                            >
                                {LEVELS.map((option) => (
                                    <ListboxOption key={option} value={option}>
                                        <ListboxLabel>{labels.collaboratorLevel(option)}</ListboxLabel>
                                        <ListboxDescription className={"not-in-[[role=option]]:hidden"}>
                                            {roleDescription(option)}
                                        </ListboxDescription>
                                    </ListboxOption>
                                ))}
                            </Listbox>
                            <Button
                                disabled={busy || username === null || known}
                                onClick={() => void add()}
                                className={"shrink-0"}
                            >
                                <PlusIcon />
                                {t("button.add-collaborator")}
                            </Button>
                        </div>
                    </div>
                    {error !== null ? (
                        <ErrorMessage>{error}</ErrorMessage>
                    ) : known ? (
                        <Description>{t("description.collaborator-already-on-deck")}</Description>
                    ) : searchLimited ? (
                        <Description>{t("description.collaborator-search-limited")}</Description>
                    ) : (
                        <Description>{t("description.collaborators")}</Description>
                    )}
                </Field>
            )}

            <ul className={"flex flex-col divide-y divide-zinc-950/5 dark:divide-white/10"}>
                {deckOwner !== null && (
                    <li className={"flex items-center gap-3 py-2"}>
                        <span className={"min-w-0 flex-1 truncate text-sm/6 text-zinc-950 dark:text-white"}>
                            {deckOwner.username}
                        </span>
                        <Badge color={"zinc"}>{t("label.deck-owner")}</Badge>
                    </li>
                )}
                {collaborators.map((collaborator) => (
                    <li key={collaborator.account} className={"flex items-center gap-3 py-2"}>
                        <span className={"min-w-0 flex-1 truncate text-sm/6 text-zinc-950 dark:text-white"}>
                            {collaborator.username}
                        </span>
                        {owner ? (
                            <Dropdown>
                                <DropdownButton plain={true} disabled={busy} aria-label={t("label.collaborator-level")}>
                                    {labels.collaboratorLevel(collaborator.level)}
                                    <ChevronDownIcon />
                                </DropdownButton>
                                <DropdownMenu anchor={"bottom end"} className={"min-w-[min(20rem,calc(100vw-2rem))]"}>
                                    {LEVELS.map((option) => (
                                        <DropdownItem
                                            key={option}
                                            onClick={() => void changeRole(collaborator, option)}
                                        >
                                            <CheckIcon
                                                className={option === collaborator.level ? undefined : "invisible"}
                                            />
                                            <DropdownLabel>{labels.collaboratorLevel(option)}</DropdownLabel>
                                            <DropdownDescription>{roleDescription(option)}</DropdownDescription>
                                        </DropdownItem>
                                    ))}
                                    <DropdownDivider />
                                    <DropdownItem onClick={() => void remove(collaborator)}>
                                        <TrashIcon />
                                        <DropdownLabel>{t("button.remove-collaborator")}</DropdownLabel>
                                    </DropdownItem>
                                </DropdownMenu>
                            </Dropdown>
                        ) : (
                            <Badge color={"zinc"}>{labels.collaboratorLevel(collaborator.level)}</Badge>
                        )}
                    </li>
                ))}
            </ul>
        </section>
    );
}
