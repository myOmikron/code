import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "i18next";
import { Suspense, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import {
    type WizardDefinition,
    type WizardFieldDefinition,
    type WizardValues,
    defineWizard,
    wizardNamespace,
} from "./definition";
import { WizardFieldTypesProvider, standardWizardFieldTypes } from "./field-types";
import { type WizardRunStore, createInMemoryWizardRunStore, wizardRunKey } from "./store";
import { Wizard } from "./wizard";

/**
 * A single-step Wizard with the given fields
 *
 * @param fields The fields
 * @returns The definition
 */
function singleStep(fields: ReadonlyArray<WizardFieldDefinition>): WizardDefinition {
    return {
        id: "test",
        version: 1,
        steps: [{ id: "step", label: "label.step", sections: [{ id: "section", fields }] }],
        disableReviewStep: true,
    };
}

/**
 * Translate every i18n key of a definition to itself, in every language the tests use, so it passes the
 * definition validation and the tests can keep asserting on keys. Keeps translations a test added before.
 *
 * @param definition The Wizard definition
 */
function translateToKeys(definition: WizardDefinition) {
    const resources: Record<string, Record<string, string>> = {};
    const collect = (node: unknown) => {
        if (typeof node !== "object" || node === null) return;
        for (const [property, value] of Object.entries(node)) {
            if (["label", "description", "message"].includes(property) && typeof value === "string") {
                const [group, key] = value.split(".");
                (resources[group] ??= {})[key] = value;
            } else {
                collect(value);
            }
        }
    };
    collect(definition);
    for (const language of ["en", "de", "fr"]) {
        i18n.addResourceBundle(language, wizardNamespace(definition.id), resources, true, false);
    }
}

type HarnessProps = {
    definition: WizardDefinition;
    onSubmit: (values: Record<string, unknown>) => void;
    store?: WizardRunStore;
};

function Harness(props: HarnessProps) {
    const [step, setStep] = useState<string | undefined>(undefined);
    return (
        <WizardFieldTypesProvider types={standardWizardFieldTypes}>
            <Suspense fallback={null}>
                <Wizard
                    definition={props.definition}
                    step={step}
                    onStepChange={setStep}
                    onSubmit={async (values) => {
                        props.onSubmit(values);
                        return { ok: true };
                    }}
                    onDone={() => {}}
                    store={props.store}
                />
            </Suspense>
        </WizardFieldTypesProvider>
    );
}

/**
 * Render inside `act`, so React retries the suspended Wizard once its store has loaded
 * (outside `act`, the test environment queues that retry until the next `act`)
 */
async function renderWizard(ui: React.ReactNode) {
    let result: ReturnType<typeof render> | undefined;
    await act(async () => {
        result = render(ui);
    });
    return result!;
}

/**
 * Render a single-step Wizard
 *
 * @param fields The fields
 * @param store The store of the Wizard Run
 * @returns The submit spy and a function that clicks submit
 */
async function renderSingleStep(fields: ReadonlyArray<WizardFieldDefinition>, store?: WizardRunStore) {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const definition = singleStep(fields);
    translateToKeys(definition);
    await renderWizard(<Harness definition={definition} onSubmit={onSubmit} store={store} />);
    const submit = () => user.click(screen.getByRole("button", { name: "button.submit" }));
    return { user, onSubmit, submit };
}

describe("standard Wizard Field Types", () => {
    it("number: submits the entered number", async () => {
        const { user, onSubmit, submit } = await renderSingleStep([
            { id: "count", type: "number", label: "label.count" },
        ]);

        await user.type(await screen.findByLabelText("label.count"), "42");
        await submit();

        await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ count: 42 }));
    });

    it.each([
        { input: "1.5", value: 1.5 },
        { input: "1,5", value: 1.5 },
        { input: "-2.25", value: -2.25 },
        { input: "-2,25", value: -2.25 },
        { input: "+7", value: 7 },
        { input: "1,000", value: 1 },
    ])("number: accepts $input", async ({ input, value }) => {
        const { user, onSubmit, submit } = await renderSingleStep([
            { id: "count", type: "number", label: "label.count" },
        ]);

        await user.type(await screen.findByLabelText("label.count"), input);
        await submit();

        await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ count: value }));
    });

    it.each(["1e", "1,000.5", "1.000,5", "1.000.000", "1,000,000", "0x10", "0b11", "1e3", "Infinity", "9".repeat(400)])(
        "number: rejects %s",
        async (input) => {
            const { user, onSubmit, submit } = await renderSingleStep([
                { id: "count", type: "number", label: "label.count" },
            ]);

            await user.type(await screen.findByLabelText("label.count"), input);
            await submit();

            expect(await screen.findByText("error.invalid-number")).toBeTruthy();
            expect(onSubmit).not.toHaveBeenCalled();
        },
    );

    it("number: rejects a fraction where only whole numbers are valid", async () => {
        const { user, onSubmit, submit } = await renderSingleStep([
            { id: "count", type: "number", label: "label.count", config: { integer: true } },
        ]);

        await user.type(await screen.findByLabelText("label.count"), "1,5");
        await submit();

        expect(await screen.findByText("error.invalid-integer")).toBeTruthy();
        expect(onSubmit).not.toHaveBeenCalled();

        await user.clear(screen.getByLabelText("label.count"));
        await user.type(screen.getByLabelText("label.count"), "2");
        await submit();

        await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ count: 2 }));
    });

    it.each(["de", "fr"])("number: accepts both separators in %s", async (language) => {
        await i18n.changeLanguage(language);
        try {
            const { user, onSubmit, submit } = await renderSingleStep([
                { id: "a", type: "number", label: "label.a" },
                { id: "b", type: "number", label: "label.b" },
            ]);

            await user.type(await screen.findByLabelText("label.a"), "1.5");
            await user.type(screen.getByLabelText("label.b"), "1,5");
            await submit();

            await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ a: 1.5, b: 1.5 }));
        } finally {
            await i18n.changeLanguage("en");
        }
    });

    it("number: keeps unparsable input JSON-safe in the Wizard Run", async () => {
        const store = createInMemoryWizardRunStore();
        const definition: WizardDefinition = {
            id: "test",
            version: 1,
            steps: [
                { id: "first", label: "label.first", sections: [{ id: "a", fields: [] }] },
                {
                    id: "second",
                    label: "label.second",
                    sections: [{ id: "b", fields: [{ id: "count", type: "number", label: "label.count" }] }],
                },
            ],
            disableReviewStep: true,
        };
        translateToKeys(definition);
        const user = userEvent.setup();
        const { unmount } = await renderWizard(<Harness definition={definition} onSubmit={() => {}} store={store} />);
        await user.click(await screen.findByRole("button", { name: "button.next" }));
        await user.type(await screen.findByLabelText("label.count"), "12abc");
        await user.click(screen.getByRole("button", { name: "button.back" }));
        await screen.findByRole("button", { name: "button.next" });
        unmount();

        const stored = await store.load(wizardRunKey(definition));
        expect(JSON.parse(JSON.stringify(stored))).toEqual(stored);

        await renderWizard(<Harness definition={definition} onSubmit={() => {}} store={store} />);
        await user.click(await screen.findByRole("button", { name: "button.next" }));
        expect(await screen.findByDisplayValue("12abc")).toBeTruthy();
        await user.click(screen.getByRole("button", { name: "button.submit" }));
        expect(await screen.findByText("error.invalid-number")).toBeTruthy();
    });

    it("number: shows every digit in the i18n language for review", () => {
        const i18nFns = { t: (key: string) => key, tg: (key: string) => key };
        const review = (language: string) =>
            standardWizardFieldTypes.number.renderReview(1234.123456, {}, { ...i18nFns, language });

        expect(review("de")).toBe("1.234,123456");
        expect(review("en")).toBe("1,234.123456");
    });

    it("textarea: submits multi-line text", async () => {
        const { user, onSubmit, submit } = await renderSingleStep([
            { id: "notes", type: "textarea", label: "label.notes" },
        ]);

        const notes = await screen.findByLabelText("label.notes");
        expect(notes.tagName).toBe("TEXTAREA");
        await user.type(notes, "one{enter}two");
        await submit();

        await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ notes: "one\ntwo" }));
    });

    it.each(["checkbox", "switch"] as const)("%s: submits whether it is on", async (fieldType) => {
        const { user, onSubmit, submit } = await renderSingleStep([
            { id: "on", type: fieldType, label: "label.on" },
            { id: "off", type: fieldType, label: "label.off" },
        ]);

        await user.click(await screen.findByLabelText("label.on"));
        await submit();

        await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ on: true, off: false }));
    });

    it.each(["checkbox", "switch"] as const)("%s: a required one must be on", async (fieldType) => {
        const { user, onSubmit, submit } = await renderSingleStep([
            { id: "terms", type: fieldType, label: "label.terms", required: true },
        ]);

        await screen.findByLabelText("label.terms");
        await submit();
        expect(await screen.findByText("error.required")).toBeTruthy();
        expect(onSubmit).not.toHaveBeenCalled();

        await user.click(screen.getByLabelText("label.terms"));
        await submit();
        await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ terms: true }));
    });

    const plans = [
        { value: "basic", label: "label.plan-basic" },
        { value: "pro", label: "label.plan-pro" },
    ] as const;

    it.each(["select", "radio"] as const)(
        '%s: rejects an option with the value "", which means no choice',
        (fieldType) => {
            const Control = standardWizardFieldTypes[fieldType].component;
            const i18nFns = { t: (key: string) => key, tg: (key: string) => key, language: "en" };
            vi.spyOn(console, "error").mockImplementation(() => {});

            expect(() =>
                render(
                    <Control
                        value={null}
                        onChange={() => {}}
                        errors={[]}
                        disabled={false}
                        config={{ options: [{ value: "", label: "label.none" }, ...plans] }}
                        i18n={i18nFns}
                        icons={{}}
                    />,
                ),
            ).toThrow('must not have the value ""');
            vi.mocked(console.error).mockRestore();
        },
    );

    it("select: submits the chosen option", async () => {
        const { user, onSubmit, submit } = await renderSingleStep([
            { id: "plan", type: "select", label: "label.plan", config: { options: plans } },
        ]);

        await user.selectOptions(await screen.findByLabelText("label.plan"), "label.plan-pro");
        await submit();

        await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ plan: "pro" }));
    });

    it("radio: submits the chosen option", async () => {
        const { user, onSubmit, submit } = await renderSingleStep([
            { id: "plan", type: "radio", label: "label.plan", config: { options: plans } },
        ]);

        await user.click(await screen.findByLabelText("label.plan-basic"));
        await submit();

        await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ plan: "basic" }));
    });

    it("phone: submits a national number in E.164 of the default country", async () => {
        const { user, onSubmit, submit } = await renderSingleStep([
            { id: "phone", type: "phone", label: "label.phone" },
        ]);

        await user.type(await screen.findByLabelText("label.phone"), "0151 12345678");
        await submit();

        await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ phone: "+4915112345678" }));
    });

    it("phone: an international number selects its country", async () => {
        const { user, onSubmit, submit } = await renderSingleStep([
            { id: "phone", type: "phone", label: "label.phone" },
        ]);

        await user.type(await screen.findByLabelText("label.phone"), "0043 664 123456");
        expect(screen.getByRole("combobox", { name: "accessibility.country-code" })).toHaveProperty("value", "+43");
        await submit();

        await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ phone: "+43664123456" }));
    });

    it("phone: rejects a number that can't exist", async () => {
        const { user, onSubmit, submit } = await renderSingleStep([
            { id: "phone", type: "phone", label: "label.phone" },
        ]);

        await user.type(await screen.findByLabelText("label.phone"), "123");
        await submit();

        expect(await screen.findByText("error.invalid-phone")).toBeTruthy();
        expect(onSubmit).not.toHaveBeenCalled();
    });

    it("phone: shows the number in international format for review", () => {
        const i18nFns = { t: (key: string) => key, tg: (key: string) => key, language: "en" };

        expect(standardWizardFieldTypes.phone.renderReview("+4915112345678", {}, i18nFns)).toBe("+49 1511 2345678");
    });

    it("checkbox-tiles: submits the checked tiles in the options' order", async () => {
        const { user, onSubmit, submit } = await renderSingleStep([
            { id: "plans", type: "checkbox-tiles", label: "label.plans", config: { options: plans } },
        ]);

        await user.click(await screen.findByRole("checkbox", { name: "label.plan-pro" }));
        await user.click(screen.getByRole("checkbox", { name: "label.plan-basic" }));
        await submit();

        await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ plans: ["basic", "pro"] }));
    });

    it("radio-tiles: submits the chosen tile", async () => {
        const { user, onSubmit, submit } = await renderSingleStep([
            { id: "plan", type: "radio-tiles", label: "label.plan", config: { options: plans } },
        ]);

        await user.click(await screen.findByRole("radio", { name: "label.plan-pro" }));
        await submit();

        await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ plan: "pro" }));
    });

    it("checkbox-group: submits the checked options in their order", async () => {
        const { user, onSubmit, submit } = await renderSingleStep([
            { id: "plans", type: "checkbox-group", label: "label.plans", config: { options: plans } },
        ]);

        await user.click(await screen.findByLabelText("label.plan-pro"));
        await user.click(screen.getByLabelText("label.plan-basic"));
        await submit();

        await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ plans: ["basic", "pro"] }));
    });

    it("checkbox-group: unchecking removes the option", async () => {
        const { user, onSubmit, submit } = await renderSingleStep([
            { id: "plans", type: "checkbox-group", label: "label.plans", config: { options: plans } },
        ]);

        await user.click(await screen.findByLabelText("label.plan-pro"));
        await user.click(screen.getByLabelText("label.plan-pro"));
        await submit();

        await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ plans: [] }));
    });

    it('checkbox-group: rejects an option with the value ""', () => {
        const Control = standardWizardFieldTypes["checkbox-group"].component;
        const i18nFns = { t: (key: string) => key, tg: (key: string) => key, language: "en" };
        vi.spyOn(console, "error").mockImplementation(() => {});

        expect(() =>
            render(
                <Control
                    value={[]}
                    onChange={() => {}}
                    errors={[]}
                    disabled={false}
                    config={{ options: [{ value: "", label: "label.none" }, ...plans] }}
                    i18n={i18nFns}
                    icons={{}}
                />,
            ),
        ).toThrow('must not have the value ""');
        vi.mocked(console.error).mockRestore();
    });

    it("checkbox-group: shows the checked options' labels for review", () => {
        const i18nFns = { t: (key: string) => key, tg: (key: string) => key, language: "en" };

        expect(
            standardWizardFieldTypes["checkbox-group"].renderReview(["basic", "pro"], { options: plans }, i18nFns),
        ).toBe("label.plan-basic, label.plan-pro");
    });

    it.each(["select", "radio", "checkbox-group", "checkbox-tiles", "radio-tiles"] as const)(
        "%s: a required one needs a choice",
        async (fieldType) => {
            const { onSubmit, submit } = await renderSingleStep([
                { id: "plan", type: fieldType, label: "label.plan", required: true, config: { options: plans } },
            ]);

            await screen.findByText("label.plan");
            await submit();

            expect(await screen.findByText("error.required")).toBeTruthy();
            expect(onSubmit).not.toHaveBeenCalled();
        },
    );
});

describe("declarative rules", () => {
    it("shows an error only once typing pauses", async () => {
        const { user } = await renderSingleStep([{ id: "code", type: "text", label: "label.code", minLength: 3 }]);

        await user.type(await screen.findByLabelText("label.code"), "ab");
        expect(screen.queryByText("error.min-length")).toBeNull();

        expect(await screen.findByText("error.min-length")).toBeTruthy();
    });

    it.each([
        { rule: { minLength: 3 }, invalid: "ab", valid: "abc", message: "error.min-length" },
        { rule: { maxLength: 3 }, invalid: "abcd", valid: "abc", message: "error.max-length" },
        {
            rule: { pattern: { regex: "^[A-Z]{2}\\d+$", message: "error.ticket-format" } },
            invalid: "ab12",
            valid: "AB12",
            message: "error.ticket-format",
        },
    ])("text: $message gates submit", async ({ rule, invalid, valid, message }) => {
        const { user, onSubmit, submit } = await renderSingleStep([
            { id: "code", type: "text", label: "label.code", ...rule },
        ]);

        const input = await screen.findByLabelText("label.code");
        await user.type(input, invalid);
        await submit();
        expect(await screen.findByText(message)).toBeTruthy();
        expect(onSubmit).not.toHaveBeenCalled();

        await user.clear(input);
        await user.type(input, valid);
        await submit();
        await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ code: valid }));
    });

    it.each([
        { rule: { min: 1 }, invalid: "0", valid: 1, message: "error.min" },
        { rule: { max: 10 }, invalid: "11", valid: 10, message: "error.max" },
    ])("number: $message gates submit", async ({ rule, invalid, valid, message }) => {
        const { user, onSubmit, submit } = await renderSingleStep([
            { id: "count", type: "number", label: "label.count", ...rule },
        ]);

        const input = await screen.findByLabelText("label.count");
        await user.type(input, invalid);
        await submit();
        expect(await screen.findByText(message)).toBeTruthy();
        expect(onSubmit).not.toHaveBeenCalled();

        await user.clear(input);
        await user.type(input, String(valid));
        await submit();
        await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ count: valid }));
    });

    it("translates messages: pattern from the Wizard's namespace, the others with their bound", async () => {
        i18n.addResourceBundle("en", "wizard-test", { error: { "ticket-format": "Like AB12" } });
        i18n.addResourceBundle("en", "translation", { error: { "min-length": "At least {{min}} characters" } });
        const { user, submit } = await renderSingleStep([
            {
                id: "code",
                type: "text",
                label: "label.code",
                minLength: 5,
                pattern: { regex: "^[A-Z]{2}\\d+$", message: "error.ticket-format" },
            },
        ]);

        await user.type(await screen.findByLabelText("label.code"), "ab");
        await submit();

        expect(await screen.findByText("Like AB12")).toBeTruthy();
        expect(screen.getByText("At least 5 characters")).toBeTruthy();
        i18n.removeResourceBundle("en", "wizard-test");
        i18n.removeResourceBundle("en", "translation");
    });

    it("leaves an empty optional field alone", async () => {
        const { onSubmit, submit } = await renderSingleStep([
            { id: "code", type: "text", label: "label.code", minLength: 3 },
            { id: "count", type: "number", label: "label.count", min: 1 },
        ]);

        await screen.findByLabelText("label.code");
        await submit();

        await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ code: "", count: null }));
    });
});

function _typeChecks() {
    const wizard = defineWizard({
        id: "types",
        version: 1,
        steps: [
            {
                id: "step",
                label: "label.step",
                sections: [
                    {
                        id: "section",
                        fields: [
                            { id: "notes", type: "textarea", label: "label.notes" },
                            { id: "count", type: "number", label: "label.count" },
                            { id: "requiredCount", type: "number", label: "label.count", required: true },
                            { id: "terms", type: "checkbox", label: "label.terms" },
                            { id: "newsletter", type: "switch", label: "label.newsletter" },
                            {
                                id: "plan",
                                type: "select",
                                label: "label.plan",
                                required: true,
                                config: {
                                    options: [
                                        { value: "basic", label: "label.basic" },
                                        { value: "pro", label: "label.pro" },
                                    ],
                                },
                            },
                            {
                                id: "size",
                                type: "radio",
                                label: "label.size",
                                config: {
                                    options: [
                                        { value: "s", label: "label.s" },
                                        { value: "m", label: "label.m" },
                                    ],
                                },
                            },
                        ],
                    },
                ],
            },
        ],
    } as const);

    void wizard;
    const values = {} as WizardValues<typeof wizard>;
    const notes: string = values.notes;
    const count: number | null = values.count;
    const requiredCount: number = values.requiredCount;
    const terms: boolean = values.terms;
    const newsletter: boolean = values.newsletter;
    const plan: "basic" | "pro" = values.plan;
    const size: "s" | "m" | null = values.size;
    // @ts-expect-error `plan` is narrowed to its options
    const planString: "basic" = values.plan;
    // @ts-expect-error an optional `radio` may be unset
    const sizeSet: "s" | "m" = values.size;
    void [notes, count, requiredCount, terms, newsletter, plan, size, planString, sizeSet];

    defineWizard({
        id: "broken",
        version: 1,
        steps: [
            {
                id: "step",
                label: "label.step",
                // @ts-expect-error `select` needs its options
                sections: [{ id: "section", fields: [{ id: "plan", type: "select", label: "label.plan" }] }],
            },
        ],
    } as const);

    const step = (field: WizardFieldDefinition): WizardDefinition => singleStep([field]);
    step({
        id: "a",
        type: "textarea",
        label: "label.a",
        minLength: 1,
        maxLength: 2,
        pattern: { regex: ".", message: "error.a" },
    });
    step({ id: "a", type: "number", label: "label.a", min: 1, max: 2 });
    // @ts-expect-error length rules don't apply to numbers
    step({ id: "a", type: "number", label: "label.a", minLength: 1 });
    // @ts-expect-error number rules don't apply to text
    step({ id: "a", type: "text", label: "label.a", min: 1 });
    // @ts-expect-error no rules for checkboxes
    step({ id: "a", type: "checkbox", label: "label.a", pattern: { regex: ".", message: "error.a" } });
}
