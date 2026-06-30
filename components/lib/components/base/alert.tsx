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
 * The properties for {@link Alert}
 */
export type AlertProps = {
    /** The maximum width of the alert dialog */
    size?: keyof typeof sizes;
    /** Additional CSS classes */
    className?: string;
    /** The alert content */
    children: React.ReactNode;
} & Omit<Headless.DialogProps, "as" | "className">;

/**
 * A confirmation dialog for important actions. Like {@link Dialog}, create a
 * custom component for each alert and always render it (never conditionally
 * mount) so async resources stay loaded inside a Suspense boundary.
 *
 * @example
 * ```tsx
 * type ConfirmDeleteAlertProps = {
 *   open: boolean;
 *   onClose: () => void;
 *   onConfirm: () => void;
 * };
 *
 * function ConfirmDeleteAlert(props: ConfirmDeleteAlertProps) {
 *   const [t] = useTranslation();
 *   return (
 *     <Alert open={props.open} onClose={props.onClose}>
 *       <AlertTitle>{t("alert.confirm-delete")}</AlertTitle>
 *       <AlertDescription>{t("alert.confirm-delete-description")}</AlertDescription>
 *       <AlertActions>
 *         <Button plain onClick={props.onClose}>Cancel</Button>
 *         <Button color="red" onClick={props.onConfirm}>Delete</Button>
 *       </AlertActions>
 *     </Alert>
 *   );
 * }
 * ```
 *
 * @see https://catalyst.tailwindui.com/docs/alert
 */
export function Alert(props: AlertProps) {
    const { size = "md", className, children, ...rest } = props;
    return (
        <Headless.Dialog {...rest}>
            <Headless.DialogBackdrop
                transition
                className="fixed inset-0 flex w-screen justify-center overflow-y-auto bg-zinc-950/15 px-2 py-2 transition duration-100 focus:outline-0 data-closed:opacity-0 data-enter:ease-out data-leave:ease-in sm:px-6 sm:py-8 lg:px-8 lg:py-16 dark:bg-zinc-950/50"
            />

            <div className="fixed inset-0 w-screen overflow-y-auto pt-6 sm:pt-0">
                <div className="grid min-h-full grid-rows-[1fr_auto_1fr] justify-items-center p-8 sm:grid-rows-[1fr_auto_3fr] sm:p-4">
                    <Headless.DialogPanel
                        transition
                        className={clsx(
                            className,
                            sizes[size],
                            "row-start-2 w-full rounded-2xl bg-white p-8 shadow-lg ring-1 ring-zinc-950/10 sm:rounded-2xl sm:p-6 dark:bg-zinc-900 dark:ring-white/10 forced-colors:outline",
                            "transition duration-100 will-change-transform data-closed:opacity-0 data-enter:ease-out data-closed:data-enter:scale-95 data-leave:ease-in",
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
 * The properties for {@link AlertTitle}
 */
export type AlertTitleProps = {
    /** Additional CSS classes */
    className?: string;
} & Omit<Headless.DialogTitleProps, "as" | "className">;

/**
 * The title of an {@link Alert}
 */
export function AlertTitle(props: AlertTitleProps) {
    const { className, ...rest } = props;
    return (
        <Headless.DialogTitle
            {...rest}
            className={clsx(
                className,
                "text-center text-base/6 font-semibold text-balance text-zinc-950 sm:text-left sm:text-sm/6 sm:text-wrap dark:text-white",
            )}
        />
    );
}

/**
 * The properties for {@link AlertDescription}
 */
export type AlertDescriptionProps = {
    /** Additional CSS classes */
    className?: string;
} & Omit<Headless.DescriptionProps<typeof Text>, "as" | "className">;

/**
 * The description text of an {@link Alert}
 */
export function AlertDescription(props: AlertDescriptionProps) {
    const { className, ...rest } = props;
    return (
        <Headless.Description
            as={Text}
            {...rest}
            className={clsx(className, "mt-2 text-center text-pretty sm:text-left")}
        />
    );
}

/**
 * The body content area of an {@link Alert}
 */
export function AlertBody(props: React.ComponentPropsWithoutRef<"div">) {
    const { className, ...rest } = props;
    return <div {...rest} className={clsx(className, "mt-4")} />;
}

/**
 * The action buttons area of an {@link Alert}
 */
export function AlertActions(props: React.ComponentPropsWithoutRef<"div">) {
    const { className, ...rest } = props;
    return (
        <div
            {...rest}
            className={clsx(
                className,
                "mt-6 flex flex-col-reverse items-center justify-end gap-3 *:w-full sm:mt-4 sm:flex-row sm:*:w-auto",
            )}
        />
    );
}
