import * as Headless from "@headlessui/react";
import { XMarkIcon } from "@heroicons/react/20/solid";
import clsx from "clsx";
import type React from "react";
import { useTranslation } from "react-i18next";
import { useSheetDrag } from "./sheet-drag";
import { Text } from "./text";

const sizes = {
    xs: "sm:max-w-xs",
    sm: "sm:max-w-sm",
    md: "sm:max-w-md",
    lg: "sm:max-w-lg",
    xl: "sm:max-w-xl",
    "2xl": "sm:max-w-2xl",
    "3xl": "sm:max-w-3xl",
    "4xl": "sm:max-w-4xl",
    "5xl": "sm:max-w-5xl",
    "6xl": "sm:max-w-6xl",
};

/**
 * The properties for {@link Dialog} (without children)
 */
export type DialogProps = {
    /** The maximum width of the dialog */
    size?: keyof typeof sizes;
    /** Additional CSS classes */
    className?: string;
    /** Callback when the dialog is closed */
    onClose: () => void;
} & Omit<Headless.DialogProps, "className">;

/**
 * The properties for {@link Dialog} (with children)
 */
export type RawDialogProps = {
    /** The maximum width of the dialog */
    size?: keyof typeof sizes;
    /** Additional CSS classes */
    className?: string;
    /** The dialog content */
    children?: React.ReactNode;
    /** Callback when the dialog is closed */
    onClose: () => void;
} & Omit<Headless.DialogProps, "className">;

/**
 * A modal dialog overlay. Create a custom component for each dialog in your
 * app. Dialog components must always be rendered (not conditionally mounted)
 * so that i18n and other async resources stay loaded inside a Suspense boundary.
 * Control visibility via the `open` prop, or use a content-or-undefined prop
 * pattern where `open={!!prop}`.
 *
 * On a phone it is a bottom sheet that grows with its content up to nearly the
 * whole screen and closes with a swipe down.
 *
 * @example
 * ```tsx
 * // --- Define a custom dialog component ---
 * type DeleteProjectDialogProps = {
 *   onClose: () => void;
 *   onDelete: () => void;
 *   /** The project to delete, or undefined to hide the dialog *\/
 *   project?: Project;
 * };
 *
 * function DeleteProjectDialog(props: DeleteProjectDialogProps) {
 *   const [t] = useTranslation("dialog-delete-project");
 *   return (
 *     <Dialog open={!!props.project} onClose={props.onClose}>
 *       <DialogTitle>{t("heading.delete", { name: props.project?.name })}</DialogTitle>
 *       <DialogDescription>{t("description.delete")}</DialogDescription>
 *       <DialogActions>
 *         <Button plain onClick={props.onClose}>Cancel</Button>
 *         <Button color="red" onClick={props.onDelete}>Delete</Button>
 *       </DialogActions>
 *     </Dialog>
 *   );
 * }
 *
 * // --- Usage: always render, never conditionally mount ---
 * function Page() {
 *   const [project, setProject] = useState<Project>();
 *   return (
 *     <Suspense>
 *       <DeleteProjectDialog
 *         project={project}
 *         onClose={() => setProject(undefined)}
 *         onDelete={() => { deleteProject(project!); setProject(undefined); }}
 *       />
 *     </Suspense>
 *   );
 * }
 * ```
 *
 * @see https://catalyst.tailwindui.com/docs/dialog
 */
export function Dialog(props: RawDialogProps) {
    const { size = "lg", className, children, ...rest } = props;
    const sheet = useSheetDrag(rest.onClose);
    return (
        <Headless.Dialog {...rest}>
            <Headless.DialogBackdrop
                ref={sheet.backdrop}
                transition
                className="fixed inset-0 flex w-screen justify-center overflow-y-auto bg-zinc-950/25 px-2 py-2 transition duration-100 focus:outline-0 data-closed:opacity-0 data-enter:ease-out data-leave:ease-in sm:px-6 sm:py-8 lg:px-8 lg:py-16 dark:bg-zinc-950/50"
            />

            <div className="fixed inset-0 w-screen overflow-y-auto pt-6 sm:pt-0">
                <div className="grid min-h-full grid-rows-[1fr_auto] justify-items-center sm:grid-rows-[1fr_auto_3fr] sm:p-4">
                    <Headless.DialogPanel
                        ref={sheet.panel}
                        transition
                        className={clsx(
                            className,
                            sizes[size],
                            "row-start-2 w-full min-w-0 rounded-t-3xl bg-white p-(--gutter) shadow-lg ring-1 ring-zinc-950/10 [--gutter:--spacing(8)] sm:mb-auto sm:rounded-2xl dark:bg-zinc-900 dark:ring-white/10 forced-colors:outline",
                            "max-sm:pb-[max(var(--gutter),calc(env(safe-area-inset-bottom)+0.75rem))]",
                            "max-h-[85dvh] overflow-y-auto overscroll-contain max-sm:max-h-[calc(100dvh-2.5rem-env(safe-area-inset-top))]",
                            "transition duration-100 will-change-transform data-closed:translate-y-12 data-closed:opacity-0 data-enter:ease-out data-leave:ease-in sm:data-closed:translate-y-0 sm:data-closed:data-enter:scale-95",
                        )}
                    >
                        <SheetHandle />
                        <DialogCloseButton onClose={rest.onClose} />
                        {children}
                    </Headless.DialogPanel>
                </div>
            </div>
        </Headless.Dialog>
    );
}

/**
 * The grab handle atop a {@link Dialog} while it is a phone's bottom sheet.
 * Decorative: the close button stays the accessible way out.
 *
 * @returns The handle
 */
function SheetHandle() {
    return (
        <div aria-hidden className="relative h-0 sm:hidden pointer-fine:hidden">
            <div
                data-sheet-handle
                className="absolute inset-x-0 -top-(--gutter) mx-auto flex h-(--gutter) w-24 touch-none justify-center pt-2"
            >
                <div className="h-1 w-9 rounded-full bg-zinc-300 dark:bg-zinc-600" />
            </div>
        </div>
    );
}

/**
 * The properties for {@link DialogCloseButton}
 */
export type DialogCloseButtonProps = {
    /** Callback when the button is pressed */
    onClose: () => void;
};

/**
 * The X in the top right corner of a {@link Dialog} or an `Alert`, next to
 * whatever close button the dialog keeps at the bottom. Sticky, so it stays
 * in reach while a long dialog scrolls; the panel needs a `--gutter`.
 */
export function DialogCloseButton(props: DialogCloseButtonProps) {
    const [tg] = useTranslation();
    return (
        <div className="sticky top-0 z-10 h-0">
            <Headless.Button
                onClick={props.onClose}
                aria-label={tg("button.close", { defaultValue: "Close" })}
                className="absolute -top-[calc(var(--gutter)-0.75rem)] -right-[calc(var(--gutter)-0.75rem)] rounded-full bg-white p-1.5 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-950 focus:outline-hidden data-focus:outline-2 data-focus:outline-offset-2 data-focus:outline-blue-500 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white pointer-coarse:p-2"
            >
                <XMarkIcon className="size-5" />
            </Headless.Button>
        </div>
    );
}

/**
 * The properties for {@link DialogTitle}
 */
export type DialogTitleProps = {
    /** Additional CSS classes */
    className?: string;
} & Omit<Headless.DialogTitleProps, "as" | "className">;

/**
 * The title of a {@link Dialog}
 */
export function DialogTitle(props: DialogTitleProps) {
    const { className, ...rest } = props;
    return (
        <Headless.DialogTitle
            {...rest}
            className={clsx(
                className,
                // Clear of the close button in the corner
                "pr-6 text-lg/6 font-semibold text-balance text-zinc-950 sm:text-base/6 dark:text-white",
            )}
        />
    );
}

/**
 * The properties for {@link DialogDescription}
 */
export type DialogDescriptionProps = {
    /** Additional CSS classes */
    className?: string;
} & Omit<Headless.DescriptionProps<typeof Text>, "as" | "className">;

/**
 * The description text of a {@link Dialog}
 */
export function DialogDescription(props: DialogDescriptionProps) {
    const { className, ...rest } = props;
    return <Headless.Description as={Text} {...rest} className={clsx(className, "mt-2 text-pretty")} />;
}

/**
 * The body content area of a {@link Dialog}
 */
export function DialogBody(props: React.ComponentPropsWithoutRef<"div">) {
    const { className, ...rest } = props;
    return <div {...rest} className={clsx(className, "mt-6")} />;
}

/**
 * The action buttons area of a {@link Dialog}
 */
export function DialogActions(props: React.ComponentPropsWithoutRef<"div">) {
    const { className, ...rest } = props;
    return (
        <div
            {...rest}
            className={clsx(
                className,
                "mt-8 flex flex-col-reverse items-center justify-end gap-3 *:w-full sm:flex-row sm:*:w-auto",
            )}
        />
    );
}
