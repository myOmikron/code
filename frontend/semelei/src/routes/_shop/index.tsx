import { ArrowRightIcon, CheckCircleIcon, ClockIcon } from "@heroicons/react/20/solid";
import { createFileRoute } from "@tanstack/react-router";
import React from "react";
import { useTranslation } from "react-i18next";
import { EmptyState, Link, Skeleton, Subheading } from "components";
import { Api } from "src/api/api";
import { ListCategoriesResponse, ListItemsResponse, PublicItem } from "src/api/generated";
import { ItemCard } from "src/components/item-card";
import { ItemInfoDialog } from "src/components/item-info-dialog";
import { formatDate } from "src/utils/dates";
import { RememberedOrder, loadRememberedOrders } from "src/utils/orders-storage";

/** Catalog data loaded from the public API. */
type CatalogData = {
    /** All categories. */
    categories: ListCategoriesResponse;
    /** All orderable items. */
    items: ListItemsResponse;
};

/** A populated section in the product catalog. */
type CatalogGroup = {
    /** Stable anchor target. */
    id: string;
    /** Visible category name. */
    name: string;
    /** Products in the category. */
    items: PublicItem[];
};

/**
 * Public ordering catalog, grouped by category, plus recent customer orders.
 *
 * @returns the catalog page
 */
function Catalog() {
    const [t] = useTranslation("shop");
    const [data, setData] = React.useState<CatalogData>();
    const [myOrders] = React.useState<RememberedOrder[]>(loadRememberedOrders);
    const [infoItem, setInfoItem] = React.useState<PublicItem>();

    React.useEffect(() => {
        Promise.all([Api.shop.categories(), Api.shop.items()]).then(([categories, items]) =>
            setData({ categories, items }),
        );
    }, []);

    if (!data) {
        return (
            <div className={"flex flex-col gap-8"}>
                <Skeleton variant={"card"} height={220} />
                <div className={"grid grid-cols-2 gap-4 sm:grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] sm:gap-5"}>
                    {Array.from({ length: 8 }).map((_, index) => (
                        <Skeleton key={index} variant={"card"} height={260} />
                    ))}
                </div>
            </div>
        );
    }

    const groups: CatalogGroup[] = data.categories.categories
        .map((category) => ({
            id: `category-${category.uuid}`,
            name: category.name,
            items: data.items.items.filter((item) => item.category === category.uuid),
        }))
        .filter((group) => group.items.length > 0);
    const uncategorized = data.items.items.filter((item) => !item.category);
    if (uncategorized.length > 0) {
        groups.push({ id: "category-other", name: t("label.uncategorized"), items: uncategorized });
    }

    return (
        <div className={"flex flex-col gap-10 sm:gap-12"}>
            <section className={"border-b border-zinc-950/10 py-6 sm:py-8 dark:border-white/10"}>
                <div className={"max-w-3xl"}>
                    <h1 className={"text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl dark:text-white"}>
                        {t("heading.catalog")}
                    </h1>
                    <p className={"mt-3 max-w-2xl text-lg/8 text-zinc-600 dark:text-zinc-300"}>
                        {t("description.catalog")}
                    </p>
                    <div
                        className={
                            "mt-5 flex flex-col gap-3 text-base text-zinc-700 sm:flex-row sm:gap-8 dark:text-zinc-200"
                        }
                    >
                        <span className={"inline-flex items-center gap-2.5"}>
                            <CheckCircleIcon className={"size-5 shrink-0 text-blue-600 dark:text-blue-400"} />
                            {t("label.order-online")}
                        </span>
                        <span className={"inline-flex items-center gap-2.5"}>
                            <CheckCircleIcon className={"size-5 shrink-0 text-blue-600 dark:text-blue-400"} />
                            {t("label.pay-on-pickup")}
                        </span>
                    </div>
                </div>
            </section>

            {myOrders.length > 0 && (
                <section className={"flex flex-col gap-4"}>
                    <div className={"flex items-center justify-between"}>
                        <Subheading className={"text-base!"}>{t("heading.my-orders")}</Subheading>
                        <span className={"text-xs font-medium text-zinc-400 dark:text-zinc-500"}>
                            {t("label.recent-orders")}
                        </span>
                    </div>
                    <div className={"-mx-1 flex gap-3 overflow-x-auto px-1 pb-2"}>
                        {myOrders.map((order) => (
                            <Link
                                key={order.pickupCode}
                                href={"/order/$pickupCode"}
                                params={{ pickupCode: order.pickupCode }}
                                className={
                                    "group flex min-w-60 items-center gap-3 rounded-2xl border border-zinc-950/5 bg-[var(--surface-card)] p-4 shadow-[var(--shadow-card-sm)] transition-all hover:-translate-y-0.5 hover:border-blue-500/25 hover:shadow-[var(--shadow-card-md)] dark:border-white/10"
                                }
                            >
                                <span
                                    className={
                                        "flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300"
                                    }
                                >
                                    <ClockIcon className={"size-5"} />
                                </span>
                                <span className={"min-w-0 flex-1"}>
                                    <span
                                        className={
                                            "block font-mono text-sm font-semibold tracking-wider text-zinc-950 dark:text-white"
                                        }
                                    >
                                        {order.pickupCode}
                                    </span>
                                    <span className={"mt-0.5 block truncate text-xs text-zinc-500 dark:text-zinc-400"}>
                                        {t("label.pickup-on", { date: formatDate(order.pickupDate) })}
                                    </span>
                                </span>
                                <ArrowRightIcon
                                    className={
                                        "size-4 shrink-0 text-zinc-300 transition-transform group-hover:translate-x-0.5 dark:text-zinc-600"
                                    }
                                />
                            </Link>
                        ))}
                    </div>
                </section>
            )}

            {groups.length === 0 ? (
                <EmptyState title={t("label.catalog-empty")} />
            ) : (
                <>
                    {groups.length > 1 && (
                        <nav className={"-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0"}>
                            {groups.map((group) => (
                                <a
                                    key={group.id}
                                    href={`#${group.id}`}
                                    className={
                                        "shrink-0 rounded-full border border-zinc-950/8 bg-[var(--surface-card)] px-4 py-2 text-sm font-medium text-zinc-700 shadow-[var(--shadow-card-sm)] transition-colors hover:border-zinc-950/15 hover:text-zinc-950 dark:border-white/10 dark:text-zinc-300 dark:hover:border-white/20 dark:hover:text-white"
                                    }
                                >
                                    {group.name}
                                </a>
                            ))}
                        </nav>
                    )}

                    <div className={"flex flex-col gap-12"}>
                        {groups.map((group) => (
                            <section key={group.id} id={group.id} className={"scroll-mt-6"}>
                                <div className={"mb-5 flex items-end justify-between gap-4"}>
                                    <div>
                                        <h2
                                            className={
                                                "text-xl font-semibold tracking-tight text-zinc-950 dark:text-white"
                                            }
                                        >
                                            {group.name}
                                        </h2>
                                        <p className={"mt-1 text-sm text-zinc-500 dark:text-zinc-400"}>
                                            {t("label.product-count", { count: group.items.length })}
                                        </p>
                                    </div>
                                </div>
                                <div
                                    className={
                                        "grid grid-cols-2 gap-4 sm:grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] sm:gap-5"
                                    }
                                >
                                    {group.items.map((item) => (
                                        <ItemCard key={item.uuid} item={item} onShowInfo={() => setInfoItem(item)} />
                                    ))}
                                </div>
                            </section>
                        ))}
                    </div>
                </>
            )}
            <ItemInfoDialog item={infoItem} onClose={() => setInfoItem(undefined)} />
        </div>
    );
}

export const Route = createFileRoute("/_shop/")({
    component: Catalog,
});
