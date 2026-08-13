import { createFileRoute } from "@tanstack/react-router";
import React from "react";
import { useTranslation } from "react-i18next";
import {
    Button,
    ConfirmDialog,
    EmptyState,
    Heading,
    Table,
    TableBody,
    TableBodySkeleton,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "components";
import { Api } from "src/api/api";
import { PublicCategory } from "src/api/generated";
import { CategoryFormDialog } from "src/components/category-form-dialog";

/**
 * Category management
 *
 * @returns the page
 */
function Categories() {
    const [t] = useTranslation("admin");
    const [tg] = useTranslation();
    const [categories, setCategories] = React.useState<PublicCategory[]>();
    const [dialog, setDialog] = React.useState<{ open: boolean; editing?: PublicCategory }>({
        open: false,
    });
    const [deleting, setDeleting] = React.useState<PublicCategory>();

    const fetch = React.useCallback(() => {
        Api.admin.categories.list().then((r) => setCategories(r.categories));
    }, []);
    React.useEffect(fetch, [fetch]);

    return (
        <div className={"flex flex-col gap-6"}>
            <div className={"flex items-center justify-between"}>
                <Heading>{t("heading.categories")}</Heading>
                <Button color={"blue"} onClick={() => setDialog({ open: true })}>
                    {t("button.create-category")}
                </Button>
            </div>

            {categories !== undefined && categories.length === 0 ? (
                <EmptyState title={t("label.categories-empty")} />
            ) : (
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableHeader>{t("label.name")}</TableHeader>
                            <TableHeader />
                        </TableRow>
                    </TableHead>
                    {categories === undefined ? (
                        <TableBodySkeleton rows={3} cols={2} />
                    ) : (
                        <TableBody>
                            {categories.map((category) => (
                                <TableRow key={category.uuid}>
                                    <TableCell>{category.name}</TableCell>
                                    <TableCell className={"flex justify-end gap-2"}>
                                        <Button plain onClick={() => setDialog({ open: true, editing: category })}>
                                            {tg("button.edit")}
                                        </Button>
                                        <Button color={"red"} onClick={() => setDeleting(category)}>
                                            {tg("button.delete")}
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    )}
                </Table>
            )}

            <CategoryFormDialog
                open={dialog.open}
                editing={dialog.editing}
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
                    await Api.admin.categories.delete(deleting!.uuid);
                    setDeleting(undefined);
                    fetch();
                }}
                title={t("heading.confirm-delete-category")}
                description={t("description.confirm-delete-category", {
                    name: deleting?.name ?? "",
                })}
            />
        </div>
    );
}

export const Route = createFileRoute("/_auth/admin/categories")({
    component: Categories,
});
