import React from "react";
import { useTranslation } from "react-i18next";
import { Button, Dialog, DialogActions, DialogBody, DialogTitle } from "components";
import { PublicItem } from "src/api/generated";

/** Properties for {@link ItemInfoDialog}. */
export type ItemInfoDialogProps = {
    /** Item whose additional information is displayed; unset closes the dialog. */
    item?: PublicItem;
    /** Close the dialog. */
    onClose: () => void;
};

/**
 * Displays customer-facing product details such as allergens.
 *
 * @param props dialog properties
 * @returns the product information dialog
 */
export function ItemInfoDialog(props: ItemInfoDialogProps) {
    const [t] = useTranslation("shop");

    return (
        <Dialog open={props.item !== undefined} onClose={props.onClose} size={"sm"}>
            <DialogTitle>{t("heading.item-info", { name: props.item?.name ?? "" })}</DialogTitle>
            <DialogBody>
                <p className={"text-base/7 whitespace-pre-wrap text-zinc-700 dark:text-zinc-200"}>
                    {props.item?.additional_info}
                </p>
            </DialogBody>
            <DialogActions>
                <Button color={"blue"} onClick={props.onClose}>
                    {t("button.close")}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
