import { useId } from "react";
import { Button } from "../components/base/button";
import { DescriptionDetails, DescriptionList, DescriptionTerm } from "../components/base/description-list";
import { Subheading } from "../components/base/heading";
import type React from "react";
import type { WizardFieldDefinition, WizardStepDefinition } from "./definition";
import type { AnyWizardFieldType, WizardFieldI18n } from "./field-types";
import { secretReviewKey } from "./secret";

/** One Wizard Field as shown on the Review Step */
export type WizardReviewField = {
    /** The field's definition */
    field: WizardFieldDefinition;
    /** The field's type from the registry */
    fieldType: AnyWizardFieldType;
    /** The field's current value */
    value: unknown;
};

/** One Wizard Step's values as shown on the Review Step */
export type WizardReviewStepEntry = {
    /** The Wizard Step */
    step: WizardStepDefinition;
    /** The step's fields, in order */
    fields: Array<WizardReviewField>;
};

/**
 * The properties for {@link WizardReview}
 */
export type WizardReviewProps = {
    /** The Wizard Steps to summarize, in order */
    steps: Array<WizardReviewStepEntry>;
    /** Jump to a step to change its values */
    onEdit: (stepId: string) => void;
    /** Editing isn't possible right now */
    disabled: boolean;
    /** The i18n context, also passed to the Field Types' `renderReview` */
    i18n: WizardFieldI18n;
};

/**
 * The content of the Review Step: every entered value grouped by Wizard Step, each with an "Edit" jump
 */
export function WizardReview(props: WizardReviewProps) {
    const { steps, ...rest } = props;
    return (
        <div className={"flex flex-col gap-8"}>
            {steps.map((entry) => (
                <WizardReviewStepSummary key={entry.step.id} {...rest} entry={entry} />
            ))}
        </div>
    );
}

/**
 * The properties for {@link WizardReviewStepSummary}
 */
type WizardReviewStepSummaryProps = Omit<WizardReviewProps, "steps"> & {
    /** The step to summarize */
    entry: WizardReviewStepEntry;
};

/**
 * The block on the Review Step that summarizes one Wizard Step's values
 */
function WizardReviewStepSummary(props: WizardReviewStepSummaryProps) {
    const { entry, i18n } = props;
    const { t } = i18n;
    const headingId = useId();
    return (
        <section aria-labelledby={headingId} className={"flex flex-col gap-2"}>
            <div className={"flex items-center justify-between gap-4"}>
                <Subheading level={3} id={headingId}>
                    {t(entry.step.label)}
                </Subheading>
                <Button plain={true} disabled={props.disabled} onClick={() => props.onEdit(entry.step.id)}>
                    {i18n.tg("button.edit")}
                </Button>
            </div>
            <DescriptionList>
                {entry.fields
                    .filter(isShown)
                    .map((reviewField) => [
                        <DescriptionTerm key={`${reviewField.field.id}-term`}>
                            {t(reviewField.field.label)}
                        </DescriptionTerm>,
                        <DescriptionDetails key={`${reviewField.field.id}-details`}>
                            {reviewValue(reviewField, i18n)}
                        </DescriptionDetails>,
                    ])}
            </DescriptionList>
        </section>
    );
}

/**
 * Whether a field gets a row on the Review Step
 *
 * @param reviewField The field with its type and value
 * @returns `false` for a field left empty, e.g. an unused "Others", except for Secrets, which show "not set"
 */
function isShown(reviewField: WizardReviewField): boolean {
    const { fieldType, value } = reviewField;
    if (fieldType.secret) return true;
    if (typeof value === "string") return value.trim() !== "";
    if (Array.isArray(value)) return value.length > 0;
    return value !== undefined && value !== null;
}

/**
 * Render a field's value for the Review Step
 *
 * @param reviewField The field with its type and value
 * @param i18n The i18n context
 * @returns Only "set" or "not set" for Secrets (ADR-0004), otherwise the Field Type's rendering
 */
function reviewValue(reviewField: WizardReviewField, i18n: WizardFieldI18n): React.ReactNode {
    const { field, fieldType, value } = reviewField;
    return fieldType.secret ? i18n.tg(secretReviewKey(value)) : fieldType.renderReview(value, field.config ?? {}, i18n);
}
