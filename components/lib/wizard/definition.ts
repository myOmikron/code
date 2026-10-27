import type { CheckboxFieldConfig } from "./standard-field-types/checkbox";
import type { NumberFieldConfig } from "./standard-field-types/number";
import type { OptionsFieldConfig } from "./standard-field-types/options";
import type { PasswordFieldConfig } from "./standard-field-types/password";
import type { PhoneFieldConfig } from "./standard-field-types/phone";
import type { SwitchFieldConfig } from "./standard-field-types/switch";
import type { TextFieldConfig } from "./standard-field-types/text";
import type { TextareaFieldConfig } from "./standard-field-types/textarea";

/** A JSON value, the only kind of value a Wizard Field may hold (ADR-0003) */
export type JsonValue = string | number | boolean | null | Array<JsonValue> | { [key: string]: JsonValue };

/**
 * Raw input a Field Type couldn't parse, kept as the field's value so it survives a JSON round trip.
 *
 * The type's `validate` must reject it, so it never reaches `onSubmit` and is left out of {@link WizardValues}.
 */
export type WizardInvalidInput = {
    /** The input as entered */
    readonly invalid: string;
};

/**
 * Static description of every Wizard Field Type: the value it yields, the config it accepts and whether its values
 * are Secrets (`secret: true`, ADR-0004).
 *
 * Apps register product-specific Field Types by augmenting this interface:
 *
 * ```ts
 * declare module "components" {
 *     interface WizardFieldTypeMap {
 *         "api-endpoint": { value: string; config: { region: string } };
 *     }
 * }
 * ```
 */
export interface WizardFieldTypeMap {
    /** Single-line text */
    text: {
        /** The entered text */
        value: string;
        /** See {@link TextFieldConfig} */
        config: TextFieldConfig;
    };
    /** Multi-line text */
    textarea: {
        /** The entered text */
        value: string;
        /** See {@link TextareaFieldConfig} */
        config: TextareaFieldConfig;
    };
    /** A number */
    number: {
        /** The entered number, `null` while empty, {@link WizardInvalidInput} while unparsable */
        value: number | null | WizardInvalidInput;
        /** See {@link NumberFieldConfig} */
        config: NumberFieldConfig;
    };
    /** A checkbox */
    checkbox: {
        /** Whether it is checked */
        value: boolean;
        /** See {@link CheckboxFieldConfig} */
        config: CheckboxFieldConfig;
    };
    /** An on/off switch */
    switch: {
        /** Whether it is on */
        value: boolean;
        /** See {@link SwitchFieldConfig} */
        config: SwitchFieldConfig;
    };
    /** One of static options in a dropdown; `WizardValues` narrows the value to the option values */
    select: {
        /** The chosen option's value, `null` while none is chosen */
        value: string | null;
        /** See {@link OptionsFieldConfig} */
        config: OptionsFieldConfig;
    };
    /** One of static options as radio buttons; `WizardValues` narrows the value to the option values */
    radio: {
        /** The chosen option's value, `null` while none is chosen */
        value: string | null;
        /** See {@link OptionsFieldConfig} */
        config: OptionsFieldConfig;
    };
    /** Any number of static options as checkboxes; `WizardValues` narrows the values to the option values */
    "checkbox-group": {
        /** The chosen options' values, in the options' order */
        value: Array<string>;
        /** See {@link OptionsFieldConfig} */
        config: OptionsFieldConfig;
    };
    /** Any number of static options as tiles with icons; `WizardValues` narrows the values to the option values */
    "checkbox-tiles": {
        /** The chosen options' values, in the options' order */
        value: Array<string>;
        /** See {@link OptionsFieldConfig} */
        config: OptionsFieldConfig;
    };
    /** One of static options as tiles with icons; `WizardValues` narrows the value to the option values */
    "radio-tiles": {
        /** The chosen option's value, `null` while none is chosen */
        value: string | null;
        /** See {@link OptionsFieldConfig} */
        config: OptionsFieldConfig;
    };
    /** A phone number with its country's calling code */
    phone: {
        /** The number in E.164, e.g. `+4915112345678`; `""` while empty */
        value: string;
        /** See {@link PhoneFieldConfig} */
        config: PhoneFieldConfig;
    };
    /** A password, a Secret */
    password: {
        /** The entered password */
        value: string;
        /** See {@link PasswordFieldConfig} */
        config: PasswordFieldConfig;
        /** Passwords are Secrets */
        secret: true;
    };
}

/** The name of a registered Wizard Field Type */
export type WizardFieldTypeName = keyof WizardFieldTypeMap & string;

/** The value a Wizard Field of type `T` yields */
export type WizardFieldValue<T extends WizardFieldTypeName> = WizardFieldTypeMap[T]["value"];

/** The config a Wizard Field of type `T` accepts */
export type WizardFieldConfig<T extends WizardFieldTypeName> = WizardFieldTypeMap[T]["config"];

/**
 * Shows a Wizard Field, Section or Step only while an earlier field holds a value (ADR-0003).
 *
 * The condition is false while the referenced field is itself hidden.
 */
export type WizardCondition = {
    /** ID of an earlier Wizard Field */
    readonly field: string;
    /** The value the field must hold, compared structurally */
    readonly equals: JsonValue;
};

/**
 * The value of a Secret in a Wizard Run (ADR-0004): either newly entered, carrying the value, or already
 * set and unchanged, carrying no value. A stored Secret is never sent back, so whoever receives `unchanged` has to
 * resolve it from storage.
 */
export type WizardSecretValue<V> = WizardEnteredSecret<V> | WizardUnchangedSecret;

/** A Secret newly entered in this Wizard Run */
export type WizardEnteredSecret<V> = {
    /** Newly entered in this Wizard Run */
    readonly status: "entered";
    /** The entered value; the Field Type's empty value while the Secret is not set */
    readonly value: V;
};

/** A Secret that was already set before and is kept as it is; it carries no value */
export type WizardUnchangedSecret = {
    /** Already set before, kept as it is */
    readonly status: "unchanged";
};

/** The marker of a Secret Field Type in {@link WizardFieldTypeMap} */
type SecretMarker = {
    /** Values of the type are Secrets */
    secret: true;
};

/** `true` when values of the Field Type `T` are Secrets */
export type WizardFieldTypeIsSecret<T extends WizardFieldTypeName> = WizardFieldTypeMap[T] extends SecretMarker
    ? true
    : false;

/** The value `onSubmit` receives for a field of type `T`: a {@link WizardSecretValue} for Secrets */
export type WizardSubmitValue<T extends WizardFieldTypeName> =
    WizardFieldTypeIsSecret<T> extends true ? WizardSecretValue<WizardFieldValue<T>> : WizardFieldValue<T>;

/** The properties every Wizard Field has, independent of its type */
export type WizardFieldBase = {
    /** Stable ID, unique among all field IDs of the Wizard; the key of the field's value */
    readonly id: string;
    /** i18n key of the label (in the Wizard's namespace) */
    readonly label: string;
    /** i18n key of an optional description (in the Wizard's namespace) */
    readonly description?: string;
    /** The field must not be empty */
    readonly required?: boolean;
    /** Show the field only while this condition holds */
    readonly visibleWhen?: WizardCondition;
};

/** The `config` property of a field of type `T`: optional when every config property is optional */
type ConfigProperty<T extends WizardFieldTypeName> =
    {} extends WizardFieldConfig<T>
        ? {
              /** Field Type specific configuration */
              readonly config?: WizardFieldConfig<T>;
          }
        : {
              /** Field Type specific configuration */
              readonly config: WizardFieldConfig<T>;
          };

/** A `pattern` rule: the value must match a regular expression */
export type WizardPatternRule = {
    /**
     * The regular expression (JavaScript syntax, without delimiters).
     *
     * Compiled with the `u` flag, so identity escapes like `\_` or `\#` are errors; write `_` or `#`.
     * Unanchored: it passes when it matches anywhere in the value, so use `^…$` to match the whole value.
     */
    readonly regex: string;
    /** i18n key of the message shown when the value doesn't match (in the Wizard's namespace) */
    readonly message: string;
};

/** Declarative rules for text values (ADR-0003); they never apply to empty values */
export type WizardTextRules = {
    /** Minimum number of characters */
    readonly minLength?: number;
    /** Maximum number of characters */
    readonly maxLength?: number;
    /** The value must match this pattern */
    readonly pattern?: WizardPatternRule;
};

/** Declarative rules for number values (ADR-0003); they never apply to empty values */
export type WizardNumberRules = {
    /** Smallest allowed value */
    readonly min?: number;
    /** Largest allowed value */
    readonly max?: number;
};

/** Every declarative rule; which ones a field accepts depends on its type's value */
export type WizardFieldRules = WizardTextRules & WizardNumberRules;

/** The declarative rules a field of type `T` accepts, based on the type's value */
type RulesProperty<T extends WizardFieldTypeName> = [ValidValue<T>] extends [string]
    ? WizardTextRules
    : [ValidValue<T>] extends [number | null]
      ? WizardNumberRules
      : {};

/** A Wizard Field: a discriminated union over its Wizard Field Type */
export type WizardFieldDefinition = {
    [T in WizardFieldTypeName]: WizardFieldBase & {
        /** The Wizard Field Type */
        readonly type: T;
    } & ConfigProperty<T> &
        RulesProperty<T>;
}[WizardFieldTypeName];

/** A titled group of Wizard Fields within a Wizard Step */
export type WizardSectionDefinition = {
    /** Stable ID, unique among all step and section IDs of the Wizard */
    readonly id: string;
    /** i18n key of the optional title */
    readonly label?: string;
    /** i18n key of an optional description */
    readonly description?: string;
    /** Show the section only while this condition holds */
    readonly visibleWhen?: WizardCondition;
    /** The fields of this section */
    readonly fields: ReadonlyArray<WizardFieldDefinition>;
};

/** One page of a Wizard */
export type WizardStepDefinition = {
    /** Stable ID, unique among all step and section IDs of the Wizard; used in the URL (`?step=`) */
    readonly id: string;
    /** i18n key of the step's label */
    readonly label: string;
    /** i18n key of an optional description */
    readonly description?: string;
    /** Show the step only while this condition holds */
    readonly visibleWhen?: WizardCondition;
    /** The sections of this step */
    readonly sections: ReadonlyArray<WizardSectionDefinition>;
};

/** A Wizard: pure, JSON-serializable data (ADR-0003) */
export type WizardDefinition = {
    /** Stable ID; also names the i18n namespace `wizard-<id>` */
    readonly id: string;
    /** Version of the definition */
    readonly version: number;
    /** The Wizard Steps, in order */
    readonly steps: ReadonlyArray<WizardStepDefinition>;
    /** `true` disables the Review Step that is otherwise added after the last step */
    readonly disableReviewStep?: boolean;
};

/** The step ID of the generated Review Step; reserved, no Wizard Step may use it */
export const WIZARD_REVIEW_STEP_ID = "review";

/**
 * The IDs of every step a Wizard Run walks through, in order
 *
 * @param definition The Wizard definition
 * @returns The Wizard Steps' IDs, followed by {@link WIZARD_REVIEW_STEP_ID} unless the Wizard opts out
 */
export function wizardStepIds(definition: WizardDefinition): Array<string> {
    const ids = definition.steps.map((step) => step.id);
    return definition.disableReviewStep ? ids : [...ids, WIZARD_REVIEW_STEP_ID];
}

/** Every Wizard Field of a definition */
export type WizardFieldsOf<D extends WizardDefinition> = D["steps"][number]["sections"][number]["fields"][number];

/** Something with a `visibleWhen` condition */
type Conditional = {
    /** The condition */
    readonly visibleWhen: WizardCondition;
};

/** The Wizard Fields of definition `D` that are conditionally visible, directly or via their section or step */
export type WizardConditionalFieldsOf<D extends WizardDefinition> =
    | Extract<WizardFieldsOf<D>, Conditional>
    | Extract<D["steps"][number]["sections"][number], Conditional>["fields"][number]
    | Extract<D["steps"][number], Conditional>["sections"][number]["fields"][number];

/**
 * The flat values map `{ [fieldId]: value }` that `onSubmit` receives for definition `D`.
 *
 * Conditionally visible fields are optional: hidden fields are left out.
 */
export type WizardValues<D extends WizardDefinition> = {
    [F in Exclude<WizardFieldsOf<D>, WizardConditionalFieldsOf<D>> as F["id"]]: WizardSubmitValueOf<F>;
} & {
    [F in WizardConditionalFieldsOf<D> as F["id"]]?: WizardSubmitValueOf<F>;
};

/** The value `onSubmit` receives for a field: a {@link WizardSecretValue} for Secrets, else {@link WizardFieldValueOf} */
type WizardSubmitValueOf<F extends WizardFieldDefinition> =
    WizardFieldTypeIsSecret<F["type"]> extends true ? WizardSubmitValue<F["type"]> : WizardFieldValueOf<F>;

/**
 * The value a validated field yields: its type's value, narrowed to the option values for fields with static
 * `options` and without `null` for required fields
 */
type WizardFieldValueOf<F extends WizardFieldDefinition> = F extends RequiredField
    ? Exclude<NarrowedToOptions<F>, null>
    : NarrowedToOptions<F>;

/**
 * The type's valid value of a field, narrowed to the option values for fields with static `options`
 * (to a list of them for types yielding a list)
 */
type NarrowedToOptions<F extends WizardFieldDefinition> =
    F extends FieldWithOptions<infer O>
        ? ValidValue<F["type"]> extends ReadonlyArray<string>
            ? Array<O>
            : O | Exclude<ValidValue<F["type"]>, string>
        : ValidValue<F["type"]>;

/** The value of type `T` without {@link WizardInvalidInput}, which never passes validation */
type ValidValue<T extends WizardFieldTypeName> = Exclude<WizardFieldValue<T>, WizardInvalidInput>;

/** A field marked as required */
type RequiredField = {
    /** Required */
    readonly required: true;
};

/** A field whose config has static options with values of type `O` */
type FieldWithOptions<O> = {
    /** The config */
    readonly config: {
        /** The options */
        readonly options: ReadonlyArray<{
            /** The option's value */
            readonly value: O;
        }>;
    };
};

/**
 * Define a Wizard in TypeScript.
 *
 * Returns the definition unchanged; its purpose is to check it against {@link WizardDefinition} while keeping
 * the literal types needed to infer {@link WizardValues}. Pass the definition `as const`.
 *
 * @param definition The Wizard definition
 * @returns The same definition
 */
export function defineWizard<const D extends WizardDefinition>(definition: D): D {
    return definition;
}

/**
 * The i18n namespace of a Wizard
 *
 * @param wizardId The Wizard's ID
 * @returns The namespace (`wizard-<id>`)
 */
export function wizardNamespace(wizardId: string): string {
    return `wizard-${wizardId}`;
}

/**
 * All fields of a definition in order
 *
 * @param definition The Wizard definition
 * @returns Every field of every section of every step
 */
export function wizardFields(definition: WizardDefinition): Array<WizardFieldDefinition> {
    return definition.steps.flatMap(stepFields);
}

/**
 * Build a map from every field's ID to a value derived from the field
 *
 * @param definition The Wizard definition
 * @param fn Derives the value of one field
 * @returns `{ [fieldId]: fn(field) }`
 */
export function mapFields<V>(definition: WizardDefinition, fn: (field: WizardFieldDefinition) => V): Record<string, V> {
    return Object.fromEntries(wizardFields(definition).map((field) => [field.id, fn(field)]));
}

/**
 * All fields of one step in order
 *
 * @param step The Wizard Step
 * @returns Every field of every section of the step
 */
export function stepFields(step: WizardStepDefinition): Array<WizardFieldDefinition> {
    return step.sections.flatMap((section) => section.fields);
}
