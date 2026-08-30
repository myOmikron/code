import { XMarkIcon } from "@heroicons/react/20/solid";
import { Button } from "components";
import { useTranslation } from "react-i18next";

/**
 * The properties for {@link DialogCloseButton}
 */
export type DialogCloseButtonProps = {
    /** Closes the dialog */
    onClose: () => void;
};

/**
 * The dialog's close, up in the title row where the reader already is.
 *
 * Closing used to mean scrolling to the bottom for a button or hitting the
 * sliver of backdrop above the dialog, which on a phone is a few pixels tall.
 * With the close up here, the bottom row disappears and the whole panel
 * belongs to the content.
 *
 * Sits at the end of a `DialogTitle` laid out as a flex row:
 *
 * ```tsx
 * <DialogTitle className={"flex items-center gap-3"}>
 *     <span className={"min-w-0 flex-1 truncate"}>{t("heading.…")}</span>
 *     <DialogCloseButton onClose={close} />
 * </DialogTitle>
 * ```
 *
 * @returns the button
 */
export function DialogCloseButton({ onClose }: DialogCloseButtonProps) {
    const [tg] = useTranslation();
    return (
        <Button plain onClick={onClose} aria-label={tg("button.close")} className={"-mr-2 shrink-0"}>
            <XMarkIcon className={"size-5"} />
        </Button>
    );
}
