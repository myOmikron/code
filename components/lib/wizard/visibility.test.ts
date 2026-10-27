import { describe, expect, it } from "vitest";
import { defineWizard } from "./definition";
import { visibleSteps } from "./visibility";

const wizard = defineWizard({
    id: "visibility",
    version: 1,
    steps: [
        {
            id: "kind",
            label: "label.kind",
            sections: [
                {
                    id: "kind-section",
                    fields: [
                        { id: "kind", type: "text", label: "label.kind" },
                        {
                            id: "vat",
                            type: "text",
                            label: "label.vat",
                            visibleWhen: { field: "kind", equals: "company" },
                        },
                    ],
                },
                {
                    id: "vat-details",
                    visibleWhen: { field: "vat", equals: "EU" },
                    fields: [{ id: "country", type: "text", label: "label.country" }],
                },
            ],
        },
        {
            id: "company",
            label: "label.company",
            visibleWhen: { field: "kind", equals: "company" },
            sections: [{ id: "company-section", fields: [{ id: "name", type: "text", label: "label.name" }] }],
        },
        {
            id: "done",
            label: "label.done",
            sections: [{ id: "done-section", fields: [{ id: "note", type: "text", label: "label.note" }] }],
        },
    ],
} as const);

/**
 * The visible steps, sections and fields as nested IDs
 *
 * @param values The current values
 * @returns `{ [stepId]: { [sectionId]: fieldIds } }`
 */
function shape(values: Record<string, unknown>) {
    return Object.fromEntries(
        visibleSteps(wizard, values).map((step) => [
            step.id,
            Object.fromEntries(step.sections.map((s) => [s.id, s.fields.map((f) => f.id)])),
        ]),
    );
}

describe("visibleSteps", () => {
    it("leaves out steps, sections and fields whose condition doesn't hold", () => {
        expect(shape({ kind: "person", vat: "EU" })).toEqual({
            kind: { "kind-section": ["kind"] },
            done: { "done-section": ["note"] },
        });
    });

    it("includes steps, sections and fields whose condition holds", () => {
        expect(shape({ kind: "company", vat: "EU" })).toEqual({
            kind: { "kind-section": ["kind", "vat"], "vat-details": ["country"] },
            company: { "company-section": ["name"] },
            done: { "done-section": ["note"] },
        });
    });

    it("compares structured values by content", () => {
        const structured = defineWizard({
            ...wizard,
            steps: [
                {
                    id: "only",
                    label: "label.only",
                    sections: [
                        {
                            id: "only-section",
                            fields: [
                                { id: "a", type: "text", label: "label.a" },
                                {
                                    id: "b",
                                    type: "text",
                                    label: "label.b",
                                    visibleWhen: { field: "a", equals: { x: [1] } },
                                },
                            ],
                        },
                    ],
                },
            ],
        } as const);

        const fields = (values: Record<string, unknown>) =>
            visibleSteps(structured, values).flatMap((s) => s.sections.flatMap((x) => x.fields.map((f) => f.id)));
        expect(fields({ a: { x: [1] } })).toEqual(["a", "b"]);
        expect(fields({ a: { x: [2] } })).toEqual(["a"]);
    });
});
