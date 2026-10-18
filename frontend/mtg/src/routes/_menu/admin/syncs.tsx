import { createFileRoute } from "@tanstack/react-router";
import { DescriptionDetails, DescriptionTerm, Text } from "components";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { AdminSyncPanel } from "src/components/admin-sync-panel";
import { formatDateTime, formatFullDay } from "src/utils/format";
import { useLoaded } from "src/utils/use-loaded";

export const Route = createFileRoute("/_menu/admin/syncs")({
    component: RouteComponent,
});

/**
 * The state of the catalog and price guide syncs. Status only: the syncs run in their own
 * containers and cannot be started from here.
 *
 * @returns the page
 */
function RouteComponent() {
    const [t] = useTranslation("admin");
    const { data: syncs } = useLoaded(() => Api.admin.syncs.get(), []);

    if (syncs === null) return <Text>{t("label.loading")}</Text>;

    const catalogStamp = syncs.catalog.stamp;
    const priceStamp = syncs.price_guide.stamp;

    return (
        <div className={"flex flex-col gap-10"}>
            <Text>{t("description.syncs")}</Text>
            <AdminSyncPanel
                title={t("heading.catalog-sync")}
                stamp={
                    catalogStamp === null || catalogStamp === undefined ? null : (
                        <>
                            <DescriptionTerm>{t("label.stamp")}</DescriptionTerm>
                            <DescriptionDetails>{catalogStamp.bulk_updated_at}</DescriptionDetails>
                            <DescriptionTerm>{t("label.read-at")}</DescriptionTerm>
                            <DescriptionDetails>{formatDateTime(catalogStamp.synced_at)}</DescriptionDetails>
                        </>
                    )
                }
                runs={syncs.catalog.runs}
            />
            <AdminSyncPanel
                title={t("heading.price-guide-sync")}
                stamp={
                    priceStamp === null || priceStamp === undefined ? null : (
                        <>
                            <DescriptionTerm>{t("label.stamp")}</DescriptionTerm>
                            <DescriptionDetails>{priceStamp.etag}</DescriptionDetails>
                            <DescriptionTerm>{t("label.prices-of")}</DescriptionTerm>
                            <DescriptionDetails>{formatFullDay(priceStamp.day)}</DescriptionDetails>
                        </>
                    )
                }
                runs={syncs.price_guide.runs}
            />
        </div>
    );
}
