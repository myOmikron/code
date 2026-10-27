import React, { createContext, useContext, useMemo } from "react";
import type { WizardFieldConfig, WizardFieldTypeIsSecret, WizardFieldTypeName, WizardFieldValue } from "./definition";
import { checkboxFieldType } from "./standard-field-types/checkbox";
import { numberFieldType } from "./standard-field-types/number";
import { passwordFieldType } from "./standard-field-types/password";
import { radioFieldType } from "./standard-field-types/radio";
import { checkboxGroupFieldType } from "./standard-field-types/checkbox-group";
import { checkboxTilesFieldType } from "./standard-field-types/checkbox-tiles";
import { radioTilesFieldType } from "./standard-field-types/radio-tiles";
import { phoneFieldType } from "./standard-field-types/phone";
import { selectFieldType } from "./standard-field-types/select";
import { switchFieldType } from "./standard-field-types/switch";
import { textFieldType } from "./standard-field-types/text";
import { textareaFieldType } from "./standard-field-types/textarea";

/**
 * The properties every Wizard Field Type component receives.
 *
 * The component renders only the control; the Wizard renders label, description and error messages around it.
 */
export type WizardFieldComponentProps<V, C> = {
    /** The current value */
    value: V;
    /** Report a new value */
    onChange: (value: V) => void;
    /** Translated error messages of the current value; empty when valid */
    errors: Array<string>;
    /** The field can't be edited right now */
    disabled: boolean;
    /** The field's config from the definition */
    config: C;
    /** The i18n context, e.g. to translate option labels from the config */
    i18n: WizardFieldI18n;
    /** The app's icons, to look up icon names from the config */
    icons: WizardIconRegistry;
};

/** An icon a Wizard definition can name, drawn in `currentColor` */
export type WizardIcon = React.ComponentType<React.SVGProps<SVGSVGElement>>;

/**
 * The icons Wizard definitions can name, by name, provided at app level like the Field Types: a definition is pure
 * data, so it names an icon (e.g. an option's `icon: "windows"`) instead of embedding it (ADR-0003)
 */
export type WizardIconRegistry = Readonly<Record<string, WizardIcon>>;

/** Translates an i18n key of one namespace */
export type WizardTranslate = (key: string) => string;

/** The i18n context a Field Type's control and Review Step rendering get */
export type WizardFieldI18n = {
    /** Translate a key of the Wizard's namespace */
    t: WizardTranslate;
    /** Translate a key of the general namespace */
    tg: WizardTranslate;
    /** The current i18n language, e.g. for number formatting */
    language: string;
};

/** The behavior every Wizard Field Type has, Secret or not */
type WizardFieldTypeBase<V, C> = {
    /** Renders the control */
    component: React.ComponentType<WizardFieldComponentProps<V, C>>;
    /** The value of a field nobody has touched yet */
    defaultValue: V;
    /**
     * The type's own validation, run in addition to the declarative rules; only called for non-empty values
     * (`false` and `[]` count as empty, see `isEmptyValue`).
     *
     * Returns i18n keys of the general namespace, empty when valid.
     */
    validate: (value: V, config: C) => Array<string> | Promise<Array<string>>;
    /**
     * Show errors only once the user tried to leave the step, then while typing as usual. For controls whose
     * value is incomplete while it is filled in, e.g. a list of entries with required parts.
     */
    deferValidation?: boolean;
};

/** A Field Type whose values are not Secrets */
type WizardPlainFieldType<V, C> = WizardFieldTypeBase<V, C> & {
    /** Renders a value for the Review Step */
    renderReview: (value: V, config: C, i18n: WizardFieldI18n) => React.ReactNode;
    /** Values of this type are not Secrets */
    secret: false;
};

/** A Field Type whose values are Secrets; the Review Step shows them only as "set" or "not set" */
type WizardSecretFieldType<V, C> = WizardFieldTypeBase<V, C> & {
    /** Values of this type are Secrets (ADR-0004) */
    secret: true;
};

/**
 * The behavior of a Wizard Field Type, looked up by name in the registry (ADR-0003).
 *
 * `S` is `true` for a Secret type (ADR-0004), which then has no `renderReview`.
 */
export type WizardFieldType<V, C, S extends boolean = false> = S extends true
    ? WizardSecretFieldType<V, C>
    : WizardPlainFieldType<V, C>;

/** Any Field Type, as the Wizard engine handles it */
export type AnyWizardFieldType = WizardFieldType<unknown, unknown, boolean>;

/** The Field Type implementation for the type named `T`; its `secret` flag follows `WizardFieldTypeMap` */
export type WizardFieldTypeFor<T extends WizardFieldTypeName> = WizardFieldType<
    WizardFieldValue<T>,
    WizardFieldConfig<T>,
    WizardFieldTypeIsSecret<T>
>;

/** The Field Type registry: implementations by type name, provided at app level */
export type WizardFieldTypeRegistry = {
    readonly [T in WizardFieldTypeName]?: WizardFieldTypeFor<T>;
};

/** The standard Wizard Field Types; spread them into the app's registry */
export const standardWizardFieldTypes = {
    text: textFieldType,
    textarea: textareaFieldType,
    password: passwordFieldType,
    number: numberFieldType,
    checkbox: checkboxFieldType,
    switch: switchFieldType,
    select: selectFieldType,
    radio: radioFieldType,
    "checkbox-group": checkboxGroupFieldType,
    phone: phoneFieldType,
    "checkbox-tiles": checkboxTilesFieldType,
    "radio-tiles": radioTilesFieldType,
} satisfies WizardFieldTypeRegistry;

/** The color of a Wizard's primary buttons and its checked controls (switches, checkboxes, radios) */
export type WizardAccent =
    | "red"
    | "orange"
    | "amber"
    | "yellow"
    | "lime"
    | "green"
    | "emerald"
    | "teal"
    | "cyan"
    | "sky"
    | "blue"
    | "indigo"
    | "violet"
    | "purple"
    | "fuchsia"
    | "pink"
    | "rose";

/** What {@link WizardFieldTypesProvider} provides */
type WizardRegistries = {
    /** The Field Types */
    types: WizardFieldTypeRegistry;
    /** The icons */
    icons: WizardIconRegistry;
    /** The accent color */
    accent: WizardAccent;
};

const WizardRegistriesContext = createContext<WizardRegistries>({ types: {}, icons: {}, accent: "blue" });

/**
 * The properties for {@link WizardFieldTypesProvider}
 */
export type WizardFieldTypesProviderProps = {
    /** The registry, e.g. `{ ...standardWizardFieldTypes, "api-endpoint": apiEndpointFieldType }` */
    types: WizardFieldTypeRegistry;
    /** The icons definitions can name, e.g. `{ windows: WindowsIcon }`; none by default */
    icons?: WizardIconRegistry;
    /** The app's accent color, matching its brand; `blue` by default */
    accent?: WizardAccent;
    /** The app */
    children: React.ReactNode;
};

/**
 * Provide the Field Type and icon registries to every Wizard below
 */
export function WizardFieldTypesProvider(props: WizardFieldTypesProviderProps) {
    const { types, icons = NO_ICONS, accent = "blue" } = props;
    const value = useMemo(() => ({ types, icons, accent }), [types, icons, accent]);
    return <WizardRegistriesContext.Provider value={value}>{props.children}</WizardRegistriesContext.Provider>;
}

/** The icon registry of an app without icons */
const NO_ICONS: WizardIconRegistry = {};

/**
 * The Field Type registry provided by {@link WizardFieldTypesProvider}
 *
 * @returns The registry
 */
export function useWizardFieldTypes(): WizardFieldTypeRegistry {
    return useContext(WizardRegistriesContext).types;
}

/**
 * The icon registry provided by {@link WizardFieldTypesProvider}
 *
 * @returns The registry
 */
export function useWizardIcons(): WizardIconRegistry {
    return useContext(WizardRegistriesContext).icons;
}

/**
 * The accent color provided by {@link WizardFieldTypesProvider}
 *
 * @returns The accent color
 */
export function useWizardAccent(): WizardAccent {
    return useContext(WizardRegistriesContext).accent;
}
