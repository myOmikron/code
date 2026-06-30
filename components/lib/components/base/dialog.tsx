import * as Headless from "@headlessui/react";
import clsx from "clsx";
import type React from "react";
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
    return (
        <Headless.Dialog {...rest}>
            <Headless.DialogBackdrop
                transition
                className="fixed inset-0 flex w-screen justify-center overflow-y-auto bg-zinc-950/25 px-2 py-2 transition duration-100 focus:outline-0 data-closed:opacity-0 data-enter:ease-out data-leave:ease-in sm:px-6 sm:py-8 lg:px-8 lg:py-16 dark:bg-zinc-950/50"
            />

            <div className="fixed inset-0 w-screen overflow-y-auto pt-6 sm:pt-0">
                <div className="grid min-h-full grid-rows-[1fr_auto] justify-items-center sm:grid-rows-[1fr_auto_3fr] sm:p-4">
                    <Headless.DialogPanel
                        transition
                        className={clsx(
                            className,
                            sizes[size],
                            "row-start-2 w-full min-w-0 rounded-t-3xl bg-white p-(--gutter) shadow-lg ring-1 ring-zinc-950/10 [--gutter:--spacing(8)] sm:mb-auto sm:rounded-2xl dark:bg-zinc-900 dark:ring-white/10 forced-colors:outline",
                            "transition duration-100 will-change-transform data-closed:translate-y-12 data-closed:opacity-0 data-enter:ease-out data-leave:ease-in sm:data-closed:translate-y-0 sm:data-closed:data-enter:scale-95",
                        )}
                    >
                        {children}
                    </Headless.DialogPanel>
                </div>
            </div>
        </Headless.Dialog>
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
                "text-lg/6 font-semibold text-balance text-zinc-950 sm:text-base/6 dark:text-white",
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
