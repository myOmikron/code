import { Button, EmptyState, Text } from "components";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import type { AdminLogEntryResponse } from "src/api/generated";
import { AdminLogTable } from "src/components/admin-log-table";

/**
 * The properties for {@link AdminLogEntries}
 */
export type AdminLogEntriesProps = {
    /** Only the entries about this Account, all of them when left out */
    account?: string;
    /** Changes whenever the caller wrote an entry, so the list is read again */
    version?: number;
};

/**
 * The Admin log, newest first, read page by page
 *
 * "Load more" appends the next page by cursor, like the Account list.
 *
 * @returns the entries
 */
export function AdminLogEntries({ account, version }: AdminLogEntriesProps) {
    const [t] = useTranslation("admin");

    const [entries, setEntries] = useState<Array<AdminLogEntryResponse> | null>(null);
    const [cursor, setCursor] = useState<string | null>(null);
    const [loadingMore, setLoadingMore] = useState(false);

    useEffect(() => {
        let current = true;
        Api.admin.log
            .list({ account })
            .then((page) => {
                if (!current) return;
                setEntries(page.entries);
                setCursor(page.next_cursor ?? null);
            })
            .catch(() => undefined);
        return () => {
            current = false;
        };
    }, [account, version]);

    /**
     * Appends the page after the last loaded entry
     */
    async function loadMore() {
        if (cursor === null) return;
        setLoadingMore(true);
        try {
            const page = await Api.admin.log.list({ account, after: cursor });
            setEntries((held) => [...(held ?? []), ...page.entries]);
            setCursor(page.next_cursor ?? null);
        } catch {
            return;
        } finally {
            setLoadingMore(false);
        }
    }

    if (entries === null) return <Text>{t("label.loading")}</Text>;
    if (entries.length === 0) {
        return <EmptyState title={t("heading.no-log-entries")} description={t("description.no-log-entries")} />;
    }

    return (
        <div className={"flex flex-col gap-6"}>
            <AdminLogTable entries={entries} showAccount={account === undefined} />
            {cursor !== null && (
                <div className={"flex justify-center"}>
                    <Button outline={true} disabled={loadingMore} onClick={loadMore}>
                        {t("button.load-more")}
                    </Button>
                </div>
            )}
        </div>
    );
}
