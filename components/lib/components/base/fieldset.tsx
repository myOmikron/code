import * as Headless from "@headlessui/react";
import clsx from "clsx";
import React from "react";

/**
 * The properties for {@link Fieldset}
 */
export type FieldsetProps = {
    /** Additional CSS classes */
    className?: string;
} & Omit<Headless.FieldsetProps, "as" | "className">;

/**
 * A group of related form fields.
 *
 * @example
 * ```tsx
 * <Fieldset>
 *   <Legend>Shipping details</Legend>
 *   <FieldGroup>
 *     <Field>
 *       <Label>Street address</Label>
 *       <Input name="street_address" />
 *     </Field>
 *     <Field>
 *       <Label>Country</Label>
 *       <Select name="country">
 *         <option>Canada</option>
 *       </Select>
 *     </Field>
 *   </FieldGroup>
 * </Fieldset>
 * ```
 *
 * @see https://catalyst.tailwindui.com/docs/fieldset
 */
export function Fieldset(props: FieldsetProps) {
    const { className, ...rest } = props;
    return (
        <Headless.Fieldset
            {...rest}
            className={clsx(className, "*:data-[slot=text]:mt-1 [&>*+[data-slot=control]]:mt-6")}
        />
    );
}

/**
 * The properties for {@link Legend}
 */
export type LegendProps = {
    /** Additional CSS classes */
    className?: string;
} & Omit<Headless.LegendProps, "as" | "className">;

/**
 * The legend/heading of a {@link Fieldset}
 *
 * @see https://catalyst.tailwindui.com/docs/fieldset
 */
export function Legend(props: LegendProps) {
    const { className, ...rest } = props;
    return (
        <Headless.Legend
            data-slot="legend"
            {...rest}
            className={clsx(
                className,
                "text-base/6 font-semibold text-zinc-950 data-disabled:opacity-50 sm:text-sm/6 dark:text-white",
            )}
        />
    );
}

/**
 * A vertical group of {@link Field} items within a {@link Fieldset}
 */
export function FieldGroup(props: React.ComponentPropsWithoutRef<"div">) {
    const { className, ...rest } = props;
    return <div data-slot="control" {...rest} className={clsx(className, "space-y-8")} />;
}

/**
 * The properties for {@link Field}
 */
export type FieldProps = {
    /** Additional CSS classes */
    className?: string;
} & Omit<Headless.FieldProps, "as" | "className">;

/**
 * A single form field container with automatic label/control spacing
 *
 * @see https://catalyst.tailwindui.com/docs/fieldset
 */
export function Field(props: FieldProps) {
    const { className, ...rest } = props;
    return (
        <Headless.Field
            {...rest}
            className={clsx(
                className,
                "[&>[data-slot=label]+[data-slot=control]]:mt-3",
                "[&>[data-slot=label]+[data-slot=description]]:mt-1",
                "[&>[data-slot=description]+[data-slot=control]]:mt-3",
                "[&>[data-slot=control]+[data-slot=description]]:mt-3",
                "[&>[data-slot=control]+[data-slot=error]]:mt-3",
                "*:data-[slot=label]:font-medium",
            )}
        />
    );
}

/**
 * The properties for {@link HorizontalField}
 */
export type HorizontalFieldProps = {
    /** Additional CSS classes */
    className?: string;
    /** The field content, split by a {@link HorizontalFieldDivider} */
    children?: React.ReactNode;
} & Omit<Headless.FieldProps, "as" | "className" | "children">;

/**
 * A horizontal two-column field layout.
 *
 * Use {@link HorizontalFieldDivider} to separate the left from the right half:
 *
 * ```tsx
 * <HorizontalField>
 *     I'm on the left
 *     <HorizontalFieldDivider />
 *     I'm on the right
 * </HorizontalField>
 * ```
 */
export function HorizontalField(props: HorizontalFieldProps) {
    const { className, children, ...passThrough } = props;

    const left: Array<React.ReactNode> = [];
    const right: Array<React.ReactNode> = [];
    let seenDivider = false;
    React.Children.forEach(children, (child) => {
        if (seenDivider) {
            right.push(child);
        } else if (
            typeof child === "object" &&
            child !== null &&
            "type" in child &&
            child?.type === HorizontalFieldDivider
        ) {
            seenDivider = true;
        } else {
            left.push(child);
        }
    });

    return (
        <Headless.Field
            {...passThrough}
            className={clsx(className, "grid grid-cols-1 gap-x-16 max-lg:gap-y-3 lg:grid-cols-[2fr_3fr]")}
        >
            <div
                className={clsx(
                    "*:data-[slot=label]:font-medium",
                    "[&>[data-slot=label]+[data-slot=control]]:mt-3",
                    "[&>[data-slot=label]+[data-slot=description]]:mt-1",
                    "[&>[data-slot=description]+[data-slot=control]]:mt-3",
                    "[&>[data-slot=control]+[data-slot=description]]:mt-3",
                    "*:data-[slot=label]:font-medium",
                )}
            >
                {left}
            </div>
            <div className={clsx("[&>[data-slot=control]+[data-slot=error]]:mt-3")}>{right}</div>
        </Headless.Field>
    );
}

/** Divider for {@link HorizontalField} to split left and right content */
export function HorizontalFieldDivider(): React.ReactNode {
    throw new Error("HorizontalFieldDivider should only be rendered once in a HorizontalField");
}

/**
 * The properties for {@link Label}
 */
export type LabelProps = {
    /** Additional CSS classes */
    className?: string;
} & Omit<Headless.LabelProps, "className">;

/**
 * A form field label, used within a {@link Field}
 *
 * @see https://catalyst.tailwindui.com/docs/fieldset
 */
export function Label(props: LabelProps) {
    const { className, ...rest } = props;
    return (
        <Headless.Label
            data-slot="label"
            {...rest}
            className={clsx(
                className,
                "text-base/6 text-zinc-950 select-none data-[disabled]:opacity-50 sm:text-sm/6 dark:text-white",
            )}
        />
    );
}

/**
 * The properties for {@link RequiredLabel}
 */
export type RequiredLabelProps = {
    /** Additional CSS classes */
    className?: string;
} & Omit<Headless.LabelProps, "className">;

/**
 * A form field label with a required asterisk, used within a {@link Field}
 */
export function RequiredLabel(props: RequiredLabelProps) {
    const { className, ...rest } = props;
    return (
        <Headless.Label
            data-slot="label"
            {...rest}
            className={clsx(
                className,
                "text-base/6 text-zinc-950 select-none data-disabled:opacity-50 sm:text-sm/6 dark:text-white",
                // asterics
                "after:ml-1 after:text-red-500 after:content-['*']",
            )}
        />
    );
}

/**
 * The properties for {@link Description}
 */
export type DescriptionProps = {
    /** Additional CSS classes */
    className?: string;
} & Omit<Headless.DescriptionProps, "as" | "className">;

/**
 * Helper description text for a form field, used within a {@link Field}
 *
 * @see https://catalyst.tailwindui.com/docs/fieldset
 */
export function Description(props: DescriptionProps) {
    const { className, ...rest } = props;
    return (
        <Headless.Description
            data-slot="description"
            {...rest}
            className={clsx(
                className,
                "text-base/6 text-zinc-500 data-disabled:opacity-50 sm:text-sm/6 dark:text-zinc-400",
            )}
        />
    );
}

/**
 * The properties for {@link ErrorMessage}
 */
export type ErrorMessageProps = {
    /** Additional CSS classes */
    className?: string;
} & Omit<Headless.DescriptionProps, "as" | "className">;

/**
 * An error message for a form field, used within a {@link Field}
 *
 * @see https://catalyst.tailwindui.com/docs/fieldset
 */
export function ErrorMessage(props: ErrorMessageProps) {
    const { className, ...rest } = props;
    return (
        <Headless.Description
            data-slot="error"
            {...rest}
            className={clsx(
                className,
                "text-base/6 text-red-600 data-disabled:opacity-50 sm:text-sm/6 dark:text-red-500",
            )}
        />
    );
}
