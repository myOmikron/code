import { MagnifyingGlassIcon } from "@heroicons/react/20/solid";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
    Button,
    EmptyState,
    FilterBar,
    FilterBarControl,
    FilterBarSearch,
    Input,
    InputGroup,
    Listbox,
    ListboxLabel,
    ListboxOption,
    Text,
} from "components";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { Role } from "src/api/generated";
import type { AdminAccount } from "src/api/generated";
import { AdminAccountTable } from "src/components/admin-account-table";

/** The url state of the Account list */
type AccountSearch = {
    /** Prefix of the username or the email */
    q?: string;
    /** Only Accounts with this Role */
    role?: Role;
};

/** How long typing has to pause before the list is asked again */
const SEARCH_DEBOUNCE_MS = 250;

export const Route = createFileRoute("/_menu/admin/accounts/")({
    validateSearch: (search: Record<string, unknown>): AccountSearch => ({
        q: typeof search.q === "string" && search.q !== "" ? search.q : undefined,
        role: Object.values(Role).find((role) => role === search.role),
    }),
    component: RouteComponent,
});

/**
 * Every Account, newest first, searchable by username or email and filterable by Role.
 *
 * Pages by cursor: "load more" appends the next page instead of numbering pages, so the
 * cost of a page does not grow with how far down the list it sits.
 *
 * @returns the page
 */
function RouteComponent() {
    const [t] = useTranslation("admin");
    const { q, role } = Route.useSearch();
    const navigate = useNavigate({ from: Route.fullPath });

    const [typed, setTyped] = useState(q ?? "");
    const [accounts, setAccounts] = useState<Array<AdminAccount> | null>(null);
    const [cursor, setCursor] = useState<string | null>(null);
    const [loadingMore, setLoadingMore] = useState(false);

    useEffect(() => {
        const search = typed.trim() === "" ? undefined : typed.trim();
        if (search === q) return;
        const timer = setTimeout(() => {
            void navigate({ search: (held) => ({ ...held, q: search }), replace: true });
        }, SEARCH_DEBOUNCE_MS);
        return () => clearTimeout(timer);
    }, [typed, q, navigate]);

    useEffect(() => {
        let current = true;
        setAccounts(null);
        Api.admin.accounts
            .list({ search: q, role })
            .then((page) => {
                if (!current) return;
                setAccounts(page.accounts);
                setCursor(page.next_cursor ?? null);
            })
            .catch(() => undefined);
        return () => {
            current = false;
        };
    }, [q, role]);

    /**
     * Appends the page after the last loaded Account
     */
    async function loadMore() {
        if (cursor === null) return;
        setLoadingMore(true);
        try {
            const page = await Api.admin.accounts.list({ search: q, role, after: cursor });
            setAccounts((held) => [...(held ?? []), ...page.accounts]);
            setCursor(page.next_cursor ?? null);
        } catch {
            return;
        } finally {
            setLoadingMore(false);
        }
    }

    return (
        <div className={"flex flex-col gap-6"}>
            <FilterBar>
                <FilterBarSearch>
                    <InputGroup>
                        <MagnifyingGlassIcon data-slot={"icon"} />
                        <Input
                            type={"search"}
                            value={typed}
                            placeholder={t("label.search")}
                            aria-label={t("label.search")}
                            onChange={(event) => setTyped(event.target.value)}
                        />
                    </InputGroup>
                </FilterBarSearch>
                <FilterBarControl>
                    <Listbox
                        value={role ?? "all"}
                        aria-label={t("label.role")}
                        onChange={(next: Role | "all") =>
                            void navigate({
                                search: (held) => ({ ...held, role: next === "all" ? undefined : next }),
                                replace: true,
                            })
                        }
                    >
                        <ListboxOption value={"all"}>
                            <ListboxLabel>{t("label.role-all")}</ListboxLabel>
                        </ListboxOption>
                        <ListboxOption value={Role.Member}>
                            <ListboxLabel>{t("label.role-member")}</ListboxLabel>
                        </ListboxOption>
                        <ListboxOption value={Role.Admin}>
                            <ListboxLabel>{t("label.role-admin")}</ListboxLabel>
                        </ListboxOption>
                    </Listbox>
                </FilterBarControl>
            </FilterBar>

            {accounts === null ? (
                <Text>{t("label.loading")}</Text>
            ) : accounts.length === 0 ? (
                <EmptyState title={t("heading.no-accounts")} description={t("description.no-accounts")} />
            ) : (
                <>
                    <AdminAccountTable accounts={accounts} />
                    {cursor !== null && (
                        <div className={"flex justify-center"}>
                            <Button outline={true} disabled={loadingMore} onClick={loadMore}>
                                {t("button.load-more")}
                            </Button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
