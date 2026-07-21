import { createFileRoute } from "@tanstack/react-router";
import React from "react";
import { useTranslation } from "react-i18next";
import {
    Button,
    ConfirmDialog,
    EmptyState,
    Heading,
    Switch,
    Table,
    TableBody,
    TableBodySkeleton,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "components";
import { PhotoIcon } from "@heroicons/react/24/outline";
import { Api, itemImageUrl } from "src/api/api";
import { AdminItem, PublicCategory } from "src/api/generated";
import { ItemFormDialog } from "src/components/item-form-dialog";
import { formatPrice } from "src/utils/price";

/**
 * Item management (includes inactive items)
 *
 * @returns the page
 */
function Items() {
    const [t] = useTranslation("admin");
    const [tg] = useTranslation();
    const [items, setItems] = React.useState<AdminItem[]>();
    const [categories, setCategories] = React.useState<PublicCategory[]>([]);
    const [dialog, setDialog] = React.useState<{ open: boolean; editing?: AdminItem }>({
        open: false,
    });
    const [deleting, setDeleting] = React.useState<AdminItem>();

    const fetch = React.useCallback(() => {
        Api.admin.items.list().then((r) => setItems(r.items));
        Api.admin.categories.list().then((r) => setCategories(r.categories));
    }, []);
    React.useEffect(fetch, [fetch]);

    /**
     * Toggle an item's active flag directly from the table
     *
     * @param item the item to toggle
     * @param active the new state
     */
    async function toggleActive(item: AdminItem, active: boolean) {
        await Api.admin.items.update(item.uuid, {
            name: item.name,
            price_cents: item.price_cents,
            additional_info: item.additional_info ?? null,
            category: item.category ?? null,
            active,
        });
        fetch();
    }

    return (
        <div className={"flex flex-col gap-6"}>
            <div className={"flex items-center justify-between"}>
                <Heading>{t("heading.items")}</Heading>
                <Button color={"blue"} onClick={() => setDialog({ open: true })}>
                    {t("button.create-item")}
                </Button>
            </div>

            {items !== undefined && items.length === 0 ? (
                <EmptyState title={t("label.items-empty")} />
            ) : (
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableHeader className={"w-16"} />
                            <TableHeader>{t("label.name")}</TableHeader>
                            <TableHeader>{t("label.price")}</TableHeader>
                            <TableHeader>{t("label.category")}</TableHeader>
                            <TableHeader>{t("label.active")}</TableHeader>
                            <TableHeader />
                        </TableRow>
                    </TableHead>
                    {items === undefined ? (
                        <TableBodySkeleton rows={4} cols={6} />
                    ) : (
                        <TableBody>
                            {items.map((item) => (
                                <TableRow key={item.uuid}>
                                    <TableCell>
                                        <div
                                            className={
                                                "size-10 overflow-hidden rounded-[var(--radius-control)] bg-[var(--surface-muted)]"
                                            }
                                        >
                                            {item.image_version != null ? (
                                                <img
                                                    src={itemImageUrl(item.uuid, item.image_version)}
                                                    alt={""}
                                                    className={"size-full object-cover"}
                                                />
                                            ) : (
                                                <div
                                                    className={
                                                        "flex size-full items-center justify-center text-zinc-300 dark:text-zinc-700"
                                                    }
                                                >
                                                    <PhotoIcon className={"size-5"} />
                                                </div>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell>{item.name}</TableCell>
                                    <TableCell>{formatPrice(item.price_cents)}</TableCell>
                                    <TableCell>
                                        {categories.find((c) => c.uuid === item.category)?.name ?? "—"}
                                    </TableCell>
                                    <TableCell>
                                        <Switch
                                            color={"blue"}
                                            checked={item.active}
                                            onChange={(active) => void toggleActive(item, active)}
                                        />
                                    </TableCell>
                                    <TableCell className={"flex justify-end gap-2"}>
                                        <Button plain onClick={() => setDialog({ open: true, editing: item })}>
                                            {tg("button.edit")}
                                        </Button>
                                        <Button color={"red"} onClick={() => setDeleting(item)}>
                                            {tg("button.delete")}
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    )}
                </Table>
            )}

            <ItemFormDialog
                open={dialog.open}
                editing={dialog.editing}
                categories={categories}
                onClose={() => setDialog({ open: false })}
                onSaved={() => {
                    setDialog({ open: false });
                    fetch();
                }}
            />
            <ConfirmDialog
                open={deleting !== undefined}
                onClose={() => setDeleting(undefined)}
                onConfirm={async () => {
                    await Api.admin.items.delete(deleting!.uuid);
                    setDeleting(undefined);
                    fetch();
                }}
                title={t("heading.confirm-delete-item")}
                description={t("description.confirm-delete-item", { name: deleting?.name ?? "" })}
            />
        </div>
    );
}

export const Route = createFileRoute("/_auth/admin/items")({
    component: Items,
});
