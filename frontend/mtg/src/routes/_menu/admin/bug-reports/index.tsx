import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
    Button,
    EmptyState,
    FilterBar,
    FilterBarControl,
    Listbox,
    ListboxLabel,
    ListboxOption,
    Text,
} from "components";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { AdminBugReportFilter } from "src/api/generated";
import type { AdminBugReport } from "src/api/generated";
import { AdminBugReportTable } from "src/components/admin-bug-report-table";

/** The url state of the Bug report list */
type BugReportSearch = {
    /** Which Bug reports to list, the open ones when left out */
    filter?: AdminBugReportFilter;
};

export const Route = createFileRoute("/_menu/admin/bug-reports/")({
    validateSearch: (search: Record<string, unknown>): BugReportSearch => ({
        filter: Object.values(AdminBugReportFilter).find(
            (filter) => filter === search.filter && filter !== AdminBugReportFilter.Open,
        ),
    }),
    component: RouteComponent,
});

/**
 * The Bug reports, newest first, the open ones unless the filter says otherwise.
 *
 * @returns the page
 */
function RouteComponent() {
    const [t] = useTranslation("admin");
    const { filter = AdminBugReportFilter.Open } = Route.useSearch();
    const navigate = useNavigate({ from: Route.fullPath });

    const [reports, setReports] = useState<Array<AdminBugReport> | null>(null);
    const [cursor, setCursor] = useState<number | null>(null);
    const [loadingMore, setLoadingMore] = useState(false);

    useEffect(() => {
        let current = true;
        setReports(null);
        Api.admin.bugReports
            .list(filter)
            .then((page) => {
                if (!current) return;
                setReports(page.reports);
                setCursor(page.next_cursor ?? null);
            })
            .catch(() => undefined);
        return () => {
            current = false;
        };
    }, [filter]);

    /**
     * Appends the page after the last loaded Bug report
     */
    async function loadMore() {
        if (cursor === null) return;
        setLoadingMore(true);
        try {
            const page = await Api.admin.bugReports.list(filter, cursor);
            setReports((held) => [...(held ?? []), ...page.reports]);
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
                <FilterBarControl>
                    <Listbox
                        value={filter}
                        aria-label={t("label.bug-report-state")}
                        onChange={(next: AdminBugReportFilter) =>
                            void navigate({
                                search: { filter: next === AdminBugReportFilter.Open ? undefined : next },
                                replace: true,
                            })
                        }
                    >
                        <ListboxOption value={AdminBugReportFilter.Open}>
                            <ListboxLabel>{t("label.bug-report-filter-open")}</ListboxLabel>
                        </ListboxOption>
                        <ListboxOption value={AdminBugReportFilter.Done}>
                            <ListboxLabel>{t("label.bug-report-filter-done")}</ListboxLabel>
                        </ListboxOption>
                        <ListboxOption value={AdminBugReportFilter.All}>
                            <ListboxLabel>{t("label.bug-report-filter-all")}</ListboxLabel>
                        </ListboxOption>
                    </Listbox>
                </FilterBarControl>
            </FilterBar>

            {reports === null ? (
                <Text>{t("label.loading")}</Text>
            ) : reports.length === 0 ? (
                <EmptyState title={t("heading.no-bug-reports")} description={t("description.no-bug-reports")} />
            ) : (
                <>
                    <AdminBugReportTable reports={reports} />
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
