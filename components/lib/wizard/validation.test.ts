import { describe, expect, it } from "vitest";
import type { WizardDefinition, WizardFieldDefinition, WizardStepDefinition } from "./definition";
import { standardWizardFieldTypes } from "./field-types";
import { type WizardDefinitionEnvironment, validateWizardDefinition } from "./validation";

/** An environment where every key is translated, only the standard Field Types and a `windows` icon exist */
const environment: WizardDefinitionEnvironment = {
    fieldTypes: standardWizardFieldTypes,
    icons: { windows: () => null },
    hasTranslation: () => true,
};

/**
 * A one-section step
 *
 * @param id The step ID
 * @param fields The fields of its only section
 * @param sectionId The ID of its only section
 * @returns The step
 */
function step(id: string, fields: Array<WizardFieldDefinition>, sectionId = `${id}-section`): WizardStepDefinition {
    return { id, label: `label.step-${id}`, sections: [{ id: sectionId, fields }] };
}

/**
 * A text field
 *
 * @param id The field ID
 * @returns The field
 */
function text(id: string): WizardFieldDefinition {
    return { id, type: "text", label: `label.${id}` };
}

/**
 * A definition with the given steps
 *
 * @param steps The steps
 * @returns The definition
 */
function wizard(...steps: Array<WizardStepDefinition>): WizardDefinition {
    return { id: "test", version: 1, steps };
}

describe("validateWizardDefinition", () => {
    it("accepts a valid definition", () => {
        expect(validateWizardDefinition(wizard(step("a", [text("x")]), step("b", [text("y")])), environment)).toEqual(
            [],
        );
    });

    it("reports fields of an unknown Wizard Field Type", () => {
        const color = { id: "favorite", type: "color", label: "label.favorite" } as unknown as WizardFieldDefinition;

        expect(validateWizardDefinition(wizard(step("a", [color])), environment)).toEqual([
            {
                check: "unknown-field-type",
                message: 'Wizard Field "favorite" has the unknown Wizard Field Type "color"',
            },
        ]);
    });

    it("reports a Wizard without steps", () => {
        expect(validateWizardDefinition(wizard(), environment)).toEqual([
            { check: "no-steps", message: "The Wizard has no Wizard Steps" },
        ]);
    });

    it("reports a step ID used more than once", () => {
        expect(
            validateWizardDefinition(wizard(step("a", [text("x")], "s1"), step("a", [text("y")], "s2")), environment),
        ).toEqual([{ check: "duplicate-step-or-section-id", message: 'Wizard Step/Section ID "a" is used 2 times' }]);
    });

    it("reports a section ID that is also used by a step, as both share one ID space", () => {
        expect(
            validateWizardDefinition(wizard(step("a", [text("x")], "b"), step("b", [text("y")], "c")), environment),
        ).toEqual([{ check: "duplicate-step-or-section-id", message: 'Wizard Step/Section ID "b" is used 2 times' }]);
    });

    it("reports a step or section using the Review Step's reserved ID", () => {
        expect(
            validateWizardDefinition(
                wizard(step("review", [text("x")]), step("b", [text("y")], "review")),
                environment,
            ),
        ).toEqual([
            {
                check: "duplicate-step-or-section-id",
                message: 'Wizard Step/Section ID "review" is used 2 times',
            },
            { check: "reserved-review-step-id", message: 'Wizard Step "review" uses the reserved Review Step ID' },
            { check: "reserved-review-step-id", message: 'Wizard Section "review" uses the reserved Review Step ID' },
        ]);
    });

    it("reports the reserved Review Step ID even when the Wizard opts out of the Review Step", () => {
        expect(
            validateWizardDefinition(
                { ...wizard(step("a", [text("x")], "review")), disableReviewStep: true },
                environment,
            ),
        ).toEqual([
            { check: "reserved-review-step-id", message: 'Wizard Section "review" uses the reserved Review Step ID' },
        ]);
    });

    it("reports a field ID used more than once, even across steps", () => {
        expect(
            validateWizardDefinition(wizard(step("a", [text("x"), text("x")]), step("b", [text("x")])), environment),
        ).toEqual([{ check: "duplicate-field-id", message: 'Wizard Field ID "x" is used 3 times' }]);
    });

    it("reports every i18n key of steps, sections and fields missing from the Wizard's namespace", () => {
        const definition: WizardDefinition = {
            id: "test",
            version: 1,
            steps: [
                {
                    id: "a",
                    label: "label.step",
                    description: "description.step",
                    sections: [
                        {
                            id: "s",
                            label: "heading.section",
                            description: "description.section",
                            fields: [{ id: "x", type: "text", label: "label.x", description: "description.x" }],
                        },
                    ],
                },
            ],
        };
        const translated = new Set(["label.step", "heading.section", "label.x"]);

        expect(
            validateWizardDefinition(definition, { ...environment, hasTranslation: (key) => translated.has(key) }),
        ).toEqual([
            { check: "missing-translation", message: 'Wizard Step "a" uses the missing i18n key "description.step"' },
            {
                check: "missing-translation",
                message: 'Wizard Section "s" uses the missing i18n key "description.section"',
            },
            { check: "missing-translation", message: 'Wizard Field "x" uses the missing i18n key "description.x"' },
        ]);
    });

    it.each(["select", "radio"] as const)("reports a missing i18n key of a %s option's label", (type) => {
        const plan: WizardFieldDefinition = {
            id: "plan",
            type,
            label: "label.plan",
            config: {
                options: [
                    { value: "basic", label: "label.plan-basic" },
                    { value: "pro", label: "label.plan-pro" },
                ],
            },
        };

        expect(
            validateWizardDefinition(wizard(step("a", [plan])), {
                ...environment,
                hasTranslation: (key) => key !== "label.plan-pro",
            }),
        ).toEqual([
            {
                check: "missing-translation",
                message: 'Wizard Field "plan" uses the missing i18n key "label.plan-pro"',
            },
        ]);
    });

    it("reports a missing i18n key of a pattern's message", () => {
        const code: WizardFieldDefinition = {
            id: "code",
            type: "text",
            label: "label.code",
            pattern: { regex: "^[A-Z]+$", message: "error.code-format" },
        };

        expect(
            validateWizardDefinition(wizard(step("a", [code])), {
                ...environment,
                hasTranslation: (key) => key !== "error.code-format",
            }),
        ).toEqual([
            {
                check: "missing-translation",
                message: 'Wizard Field "code" uses the missing i18n key "error.code-format"',
            },
        ]);
    });

    it.each([
        { regex: "^[A-Z", why: "an unterminated class" },
        { regex: "^\\_$", why: "an identity escape, which only the u flag rejects" },
    ])("reports a pattern whose regex doesn't compile: $why", ({ regex }) => {
        const code: WizardFieldDefinition = {
            id: "code",
            type: "text",
            label: "label.code",
            pattern: { regex, message: "error.code-format" },
        };

        expect(validateWizardDefinition(wizard(step("a", [code])), environment)).toEqual([
            {
                check: "invalid-pattern",
                message: expect.stringMatching(/^Wizard Field "code" has a pattern that doesn't compile: /),
            },
        ]);
    });

    it.each(["select", "radio"] as const)('reports a %s option with the value "", which means no choice', (type) => {
        const plan: WizardFieldDefinition = {
            id: "plan",
            type,
            label: "label.plan",
            config: {
                options: [
                    { value: "", label: "label.plan-none" },
                    { value: "pro", label: "label.plan-pro" },
                ],
            },
        };

        expect(validateWizardDefinition(wizard(step("a", [plan])), environment)).toEqual([
            {
                check: "empty-option-value",
                message: 'Wizard Field "plan" has an option with the value "", which means "nothing chosen"',
            },
        ]);
    });

    it("reports options naming an icon the app hasn't registered", () => {
        const os: WizardFieldDefinition = {
            id: "os",
            type: "checkbox-tiles",
            label: "label.os",
            config: {
                options: [
                    { value: "windows", label: "label.windows", icon: "windows" },
                    { value: "linux", label: "label.linux", icon: "tux" },
                    { value: "bsd", label: "label.bsd" },
                ],
            },
        };

        expect(validateWizardDefinition(wizard(step("a", [os])), environment)).toEqual([
            {
                check: "unknown-icon",
                message: 'Wizard Field "os" uses the unknown icon "tux" for option "linux"',
            },
        ]);
    });

    it("accepts visibleWhen conditions that reference earlier fields", () => {
        const later: WizardStepDefinition = {
            id: "b",
            label: "label.step-b",
            visibleWhen: { field: "y", equals: "yes" },
            sections: [{ id: "b-section", visibleWhen: { field: "x", equals: 1 }, fields: [text("z")] }],
        };
        const definition = wizard(
            step("a", [text("x"), { ...text("y"), visibleWhen: { field: "x", equals: "yes" } }]),
            later,
        );

        expect(validateWizardDefinition(definition, environment)).toEqual([]);
    });

    it("reports visibleWhen conditions that reference unknown, later or their own fields", () => {
        const definition: WizardDefinition = {
            id: "test",
            version: 1,
            steps: [
                {
                    id: "a",
                    label: "label.a",
                    visibleWhen: { field: "x", equals: "yes" },
                    sections: [
                        {
                            id: "s",
                            visibleWhen: { field: "nope", equals: "yes" },
                            fields: [
                                { ...text("x"), visibleWhen: { field: "x", equals: "yes" } },
                                { ...text("y"), visibleWhen: { field: "z", equals: "yes" } },
                            ],
                        },
                    ],
                },
                step("b", [text("z")]),
            ],
        };

        expect(validateWizardDefinition(definition, environment)).toEqual([
            {
                check: "visible-when-reference",
                message: 'Wizard Step "a" has a visibleWhen referencing the Wizard Field "x", which is not earlier',
            },
            {
                check: "visible-when-reference",
                message: 'Wizard Section "s" has a visibleWhen referencing the unknown Wizard Field "nope"',
            },
            { check: "visible-when-reference", message: 'Wizard Field "x" has a visibleWhen referencing itself' },
            {
                check: "visible-when-reference",
                message: 'Wizard Field "y" has a visibleWhen referencing the Wizard Field "z", which is not earlier',
            },
        ]);
    });

    it("reports all errors at once", () => {
        const color = { id: "x", type: "color", label: "label.x" } as unknown as WizardFieldDefinition;
        const errors = validateWizardDefinition(
            wizard(step("a", [color, text("x")], "s1"), step("a", [text("y")], "s2")),
            {
                ...environment,
                hasTranslation: (key) => key !== "label.y",
            },
        );

        expect(errors.map((e) => e.check)).toEqual([
            "unknown-field-type",
            "duplicate-step-or-section-id",
            "duplicate-field-id",
            "missing-translation",
        ]);
    });
});
