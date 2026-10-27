import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n, { type BackendModule } from "i18next";
import { Suspense, useState } from "react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";
import { defineWizard, type WizardDefinition, type WizardSecretValue, type WizardValues } from "./definition";
import { standardWizardFieldTypes, type WizardFieldTypeRegistry, WizardFieldTypesProvider } from "./field-types";
import { createInMemoryWizardRunStore, type WizardLoadedRunState, type WizardRunStore } from "./store";
import { Wizard, type WizardScreen, type WizardStepChangeOptions, type WizardSubmitResult } from "./wizard";

const contactWizard = defineWizard({
    id: "contact",
    version: 1,
    steps: [
        {
            id: "person",
            label: "label.step-person",
            sections: [
                {
                    id: "person-name",
                    label: "heading.name",
                    fields: [{ id: "name", type: "text", label: "label.name", required: true }],
                },
            ],
        },
        {
            id: "address",
            label: "label.step-address",
            sections: [
                {
                    id: "address-city",
                    label: "heading.address",
                    fields: [{ id: "city", type: "text", label: "label.city" }],
                },
            ],
        },
    ],
} as const);

const accessWizard = defineWizard({
    id: "access",
    version: 1,
    steps: [
        {
            id: "credentials",
            label: "label.step-credentials",
            sections: [
                {
                    id: "credentials-login",
                    fields: [
                        { id: "user", type: "text", label: "label.user" },
                        { id: "password", type: "password", label: "label.password", required: true },
                        { id: "token", type: "password", label: "label.token" },
                    ],
                },
            ],
        },
    ],
} as const);

/** A Secret on a later step, like an API key */
const apiWizard = defineWizard({
    id: "api",
    version: 1,
    steps: [
        {
            id: "company",
            label: "label.step-company",
            sections: [
                {
                    id: "company-name",
                    fields: [{ id: "companyName", type: "text", label: "label.company-name", required: true }],
                },
            ],
        },
        {
            id: "access",
            label: "label.step-access",
            sections: [
                {
                    id: "access-key",
                    fields: [{ id: "apiKey", type: "password", label: "label.api-key", required: true }],
                },
            ],
        },
    ],
} as const);
i18n.addResourceBundle("en", "wizard-api", {
    label: {
        "step-company": "label.step-company",
        "step-access": "label.step-access",
        "company-name": "label.company-name",
        "api-key": "label.api-key",
    },
});

const contactWizardWithoutReview = defineWizard({ ...contactWizard, disableReviewStep: true } as const);

const contactTranslations = {
    heading: { name: "heading.name", address: "heading.address" },
    label: {
        "step-person": "label.step-person",
        "step-address": "label.step-address",
        name: "label.name",
        city: "label.city",
    },
};
i18n.addResourceBundle("en", "wizard-contact", contactTranslations);

const accessTranslations = {
    label: {
        "step-credentials": "label.step-credentials",
        user: "label.user",
        password: "label.password",
        token: "label.token",
    },
};
i18n.addResourceBundle("en", "wizard-access", accessTranslations);

/** Three steps, each with one required field */
const threeStepWizard = defineWizard({
    id: "three",
    version: 1,
    steps: (["a", "b", "c"] as const).map((id) => ({
        id,
        label: `label.step-${id}`,
        sections: [{ id: `section-${id}`, fields: [{ id, type: "text", label: `label.${id}`, required: true }] }],
    })),
});
i18n.addResourceBundle("en", "wizard-three", {
    label: Object.fromEntries(
        ["a", "b", "c"].flatMap((id) => [
            [`step-${id}`, `label.step-${id}`],
            [id, `label.${id}`],
        ]),
    ),
});

const GREETING: WizardScreen = { heading: "Hello", description: "Let's begin", button: "Start" };
const DONE: WizardScreen = { heading: "All set", description: "Thanks", button: "Continue" };

type HarnessProps = {
    /** The Wizard to run instead of the contact Wizard */
    definition?: WizardDefinition;
    types?: WizardFieldTypeRegistry;
    onStepChange?: (step: string, options: WizardStepChangeOptions) => void;
    /** Receives the values of whichever Wizard runs */
    onSubmit?: (values: never) => Promise<WizardSubmitResult>;
    onDone?: () => void;
    greeting?: WizardScreen;
    done?: WizardScreen;
    store?: WizardRunStore;
    /** Pass a new in-memory store on every render, like `store={createInMemoryWizardRunStore()}` */
    inlineStore?: boolean;
    initialStep?: string;
    /** Rendered while the Wizard suspends */
    fallback?: React.ReactNode;
};

function Harness(props: HarnessProps) {
    const [step, setStep] = useState<string | undefined>(props.initialStep);
    return (
        <WizardFieldTypesProvider types={props.types ?? standardWizardFieldTypes}>
            <Suspense fallback={props.fallback ?? null}>
                <Wizard
                    definition={(props.definition ?? contactWizard) as typeof contactWizard}
                    step={step}
                    onStepChange={(next, options) => {
                        props.onStepChange?.(next, options);
                        setStep(next);
                    }}
                    onSubmit={
                        (props.onSubmit ?? (async () => ({ ok: true }))) as (
                            values: WizardValues<typeof contactWizard>,
                        ) => Promise<WizardSubmitResult<typeof contactWizard>>
                    }
                    onDone={props.onDone ?? (() => {})}
                    greeting={props.greeting}
                    done={props.done}
                    store={props.inlineStore ? createInMemoryWizardRunStore() : props.store}
                    unsavedChangesGuard={(dirty) => <output aria-label={"guard"}>{dirty ? "dirty" : "clean"}</output>}
                />
            </Suspense>
        </WizardFieldTypesProvider>
    );
}

/**
 * Fill in both steps of the contact wizard and submit from the Review Step
 */
async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>) {
    await user.type(await screen.findByLabelText("label.name"), "Alice");
    await user.click(screen.getByRole("button", { name: "button.next" }));
    await user.type(await screen.findByLabelText("label.city"), "Berlin");
    await user.click(screen.getByRole("button", { name: "button.next" }));
    await user.click(await screen.findByRole("button", { name: "button.submit" }));
}

/**
 * The `data-state` of every step in the StepBar
 */
function stepStates() {
    return within(screen.getByRole("navigation"))
        .getAllByRole("listitem")
        .map((item) => item.getAttribute("data-state"));
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

describe("Wizard", () => {
    it("shows every definition error instead of a Wizard with an unknown Field Type", async () => {
        await renderWizard(<Harness types={{}} />);

        expect(await screen.findByRole("heading", { name: "heading.wizard-invalid" })).toBeTruthy();
        expect(screen.getByText('Wizard Field "name" has the unknown Wizard Field Type "text"')).toBeTruthy();
        expect(screen.getByText('Wizard Field "city" has the unknown Wizard Field Type "text"')).toBeTruthy();
        expect(screen.queryByRole("button", { name: "button.next" })).toBeNull();
    });

    it("shows the error page instead of crashing on a Wizard without steps", async () => {
        await renderWizard(
            <WizardFieldTypesProvider types={standardWizardFieldTypes}>
                <Suspense fallback={null}>
                    <Wizard
                        definition={{ id: "empty", version: 1, steps: [] }}
                        step={undefined}
                        onStepChange={() => {}}
                        onSubmit={async () => ({ ok: true })}
                        onDone={() => {}}
                    />
                </Suspense>
            </WizardFieldTypesProvider>,
        );

        expect(await screen.findByRole("heading", { name: "heading.wizard-invalid" })).toBeTruthy();
        expect(screen.getByText("The Wizard has no Wizard Steps")).toBeTruthy();
    });

    it("shows missing i18n keys after switching to a language that lacks them", async () => {
        await renderWizard(<Harness />);
        await screen.findByLabelText("label.name");

        try {
            await act(() => i18n.changeLanguage("de"));

            expect(await screen.findByRole("heading", { name: "heading.wizard-invalid" })).toBeTruthy();
            expect(screen.getByText('Wizard Field "name" uses the missing i18n key "label.name"')).toBeTruthy();
        } finally {
            await act(() => i18n.changeLanguage("en"));
        }
    });

    it("suspends until its i18n namespace has loaded, then validates the definition against it", async () => {
        let release = () => {};
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });
        const backend: BackendModule = {
            type: "backend",
            init: () => {},
            read: (_language, requestedNamespace, callback) => {
                if (requestedNamespace === "wizard-contact") gate.then(() => callback(null, contactTranslations));
                else callback(null, {});
            },
        };
        const instance = i18n.createInstance();
        await instance.use(backend).init({ lng: "en", ns: [], interpolation: { escapeValue: false } });

        await renderWizard(
            <I18nextProvider i18n={instance}>
                <Harness fallback={"loading"} />
            </I18nextProvider>,
        );

        expect(screen.getByText("loading")).toBeTruthy();
        expect(screen.queryByRole("heading", { name: "heading.wizard-invalid" })).toBeNull();

        await act(async () => release());

        expect(await screen.findByLabelText("label.name")).toBeTruthy();
        expect(screen.queryByRole("heading", { name: "heading.wizard-invalid" })).toBeNull();
    });

    it("moves to the next step after filling in the current one", async () => {
        const user = userEvent.setup();
        const onStepChange = vi.fn();
        await renderWizard(<Harness onStepChange={onStepChange} />);

        await user.type(await screen.findByLabelText("label.name"), "Alice");
        await user.click(screen.getByRole("button", { name: "button.next" }));

        expect(onStepChange).toHaveBeenLastCalledWith("address", { replace: false });
        expect(await screen.findByLabelText("label.city")).toBeTruthy();
    });

    it("keeps the user on the step while a required field is empty", async () => {
        const user = userEvent.setup();
        const onStepChange = vi.fn();
        await renderWizard(<Harness onStepChange={onStepChange} />);

        await user.click(await screen.findByRole("button", { name: "button.next" }));

        expect(await screen.findByText("error.required")).toBeTruthy();
        expect(onStepChange).not.toHaveBeenCalled();

        await user.type(screen.getByLabelText("label.name"), "Alice");
        expect(screen.queryByText("error.required")).toBeNull();
        await user.click(screen.getByRole("button", { name: "button.next" }));
        expect(onStepChange).toHaveBeenLastCalledWith("address", { replace: false });
    });

    it("keeps the user on the step while the Field Type rejects a value", async () => {
        const user = userEvent.setup();
        const onStepChange = vi.fn();
        const types: WizardFieldTypeRegistry = {
            text: {
                ...standardWizardFieldTypes.text,
                validate: async (value) => (value === "Mallory" ? ["error.not-allowed"] : []),
            },
        };
        await renderWizard(<Harness types={types} onStepChange={onStepChange} />);

        await user.type(await screen.findByLabelText("label.name"), "Mallory");
        await user.click(screen.getByRole("button", { name: "button.next" }));

        expect(await screen.findByText("error.not-allowed")).toBeTruthy();
        expect(onStepChange).not.toHaveBeenCalled();
    });

    it("shows errors of a Field Type with deferValidation only once the user tried to continue", async () => {
        const user = userEvent.setup();
        const types: WizardFieldTypeRegistry = {
            text: {
                ...standardWizardFieldTypes.text,
                validate: async (value) => (value === "Mallory" ? ["error.not-allowed"] : []),
                deferValidation: true,
            },
        };
        await renderWizard(<Harness types={types} />);

        const name = await screen.findByLabelText("label.name");
        await user.type(name, "Mallory");
        await new Promise((resolve) => setTimeout(resolve, 600));
        expect(screen.queryByText("error.not-allowed")).toBeNull();

        await user.click(screen.getByRole("button", { name: "button.next" }));
        expect(await screen.findByText("error.not-allowed")).toBeTruthy();

        await user.clear(name);
        await user.type(name, "Alice");
        await waitFor(() => expect(screen.queryByText("error.not-allowed")).toBeNull());
    });

    it("submits the flat values map and then reports done", async () => {
        const user = userEvent.setup();
        const calls: Array<string> = [];
        const onSubmit = vi.fn(async () => {
            calls.push("submit");
            return { ok: true } as const;
        });
        const onDone = vi.fn(() => calls.push("done"));
        await renderWizard(<Harness onSubmit={onSubmit} onDone={onDone} />);

        await user.type(await screen.findByLabelText("label.name"), "Alice");
        await user.click(screen.getByRole("button", { name: "button.next" }));
        await user.type(await screen.findByLabelText("label.city"), "Berlin");
        await user.click(screen.getByRole("button", { name: "button.next" }));
        await user.click(await screen.findByRole("button", { name: "button.submit" }));

        await waitFor(() => expect(onDone).toHaveBeenCalled());
        expect(onSubmit).toHaveBeenCalledWith({ name: "Alice", city: "Berlin" });
        expect(calls).toEqual(["submit", "done"]);
    });

    it("shows the greeting first and reports no step until the user starts", async () => {
        const user = userEvent.setup();
        const onStepChange = vi.fn();
        await renderWizard(<Harness greeting={GREETING} onStepChange={onStepChange} />);

        expect(await screen.findByRole("heading", { name: "Hello" })).toBeTruthy();
        expect(screen.queryByLabelText("label.name")).toBeNull();
        expect(onStepChange).not.toHaveBeenCalled();

        await user.click(screen.getByRole("button", { name: "Start" }));
        expect(await screen.findByLabelText("label.name")).toBeTruthy();
    });

    it("skips the greeting when a step is requested", async () => {
        await renderWizard(<Harness greeting={GREETING} initialStep={"person"} />);

        expect(await screen.findByLabelText("label.name")).toBeTruthy();
        expect(screen.queryByRole("heading", { name: "Hello" })).toBeNull();
    });

    it("skips the greeting when the loaded Wizard Run has a completed step", async () => {
        const store = createInMemoryWizardRunStore();
        await store.save(
            { wizardId: "contact", version: 1 },
            { values: { name: { value: "Alice", secret: false } }, completedSteps: ["person"], currentStep: "address" },
        );
        await renderWizard(<Harness greeting={GREETING} store={store} />);

        expect(await screen.findByLabelText("label.city")).toBeTruthy();
        expect(screen.queryByRole("heading", { name: "Hello" })).toBeNull();
    });

    it("shows the done screen after submit and reports done only when the user leaves it", async () => {
        const user = userEvent.setup();
        const onDone = vi.fn();
        await renderWizard(<Harness done={DONE} onDone={onDone} />);

        await fillAndSubmit(user);

        expect(await screen.findByRole("heading", { name: "All set" })).toBeTruthy();
        expect(screen.getByLabelText("guard").textContent).toBe("clean");
        expect(onDone).not.toHaveBeenCalled();

        await user.click(screen.getByRole("button", { name: "Continue" }));
        expect(onDone).toHaveBeenCalledOnce();
    });

    it("jumps to the first step with a field error from submit and marks the field", async () => {
        const user = userEvent.setup();
        const onStepChange = vi.fn();
        const onDone = vi.fn();
        const onSubmit = async (): Promise<WizardSubmitResult<typeof contactWizard>> => ({
            ok: false,
            errors: [
                { field: "city", key: "error.unknown-city", namespace: "wizard" },
                { field: "name", key: "error.name-taken", namespace: "wizard" },
            ],
        });
        await renderWizard(<Harness onStepChange={onStepChange} onSubmit={onSubmit} onDone={onDone} />);

        await fillAndSubmit(user);

        expect(await screen.findByText("error.name-taken")).toBeTruthy();
        expect(screen.getByLabelText("label.name")).toBeTruthy();
        expect(onStepChange).toHaveBeenLastCalledWith("person", { replace: false });
        expect(onDone).not.toHaveBeenCalled();

        await user.click(screen.getByRole("button", { name: "button.next" }));
        expect(await screen.findByText("error.unknown-city")).toBeTruthy();
    });

    it("shows general submit errors on the Review Step, where submit happens", async () => {
        const user = userEvent.setup();
        const onStepChange = vi.fn();
        const onSubmit = async (): Promise<WizardSubmitResult<typeof contactWizard>> => ({
            ok: false,
            errors: [{ key: "error.backend-down", namespace: "general" }],
        });
        await renderWizard(<Harness onStepChange={onStepChange} onSubmit={onSubmit} />);

        await fillAndSubmit(user);

        expect(await screen.findByText("error.backend-down")).toBeTruthy();
        expect(onStepChange).toHaveBeenLastCalledWith("review", { replace: false });
        expect(stepStates()).toEqual(["finished", "finished", "active"]);

        await user.click(screen.getByRole("button", { name: "button.back" }));
        await screen.findByLabelText("label.city");
        expect(screen.queryByText("error.backend-down")).toBeNull();
        expect(stepStates()).toEqual(["finished", "active", "error"]);
    });

    it("shows general submit errors on the last step when the Wizard opts out of the Review Step", async () => {
        const user = userEvent.setup();
        const onSubmit = async (): Promise<WizardSubmitResult<typeof contactWizard>> => ({
            ok: false,
            errors: [{ key: "error.backend-down", namespace: "general" }],
        });
        await renderWizard(<Harness definition={contactWizardWithoutReview} onSubmit={onSubmit} />);

        await user.type(await screen.findByLabelText("label.name"), "Alice");
        await user.click(screen.getByRole("button", { name: "button.next" }));
        await user.type(await screen.findByLabelText("label.city"), "Berlin");
        await user.click(screen.getByRole("button", { name: "button.submit" }));

        expect(await screen.findByText("error.backend-down")).toBeTruthy();
        await user.click(screen.getByRole("button", { name: "button.back" }));
        await screen.findByLabelText("label.name");
        expect(screen.queryByText("error.backend-down")).toBeNull();
        expect(stepStates()).toEqual(["active", "error"]);
    });

    it("adds a Review Step as the last step that shows every value and holds Submit", async () => {
        const user = userEvent.setup();
        const onStepChange = vi.fn();
        await renderWizard(<Harness onStepChange={onStepChange} />);

        await user.type(await screen.findByLabelText("label.name"), "Alice");
        await user.click(screen.getByRole("button", { name: "button.next" }));
        await user.type(await screen.findByLabelText("label.city"), "Berlin");
        expect(screen.queryByRole("button", { name: "button.submit" })).toBeNull();
        await user.click(screen.getByRole("button", { name: "button.next" }));

        expect(onStepChange).toHaveBeenLastCalledWith("review", { replace: false });
        const person = await screen.findByRole("region", { name: "label.step-person" });
        expect(within(person).getByText("label.name")).toBeTruthy();
        expect(within(person).getByText("Alice")).toBeTruthy();
        const address = screen.getByRole("region", { name: "label.step-address" });
        expect(within(address).getByText("Berlin")).toBeTruthy();
        expect(screen.getByRole("button", { name: "button.submit" })).toBeTruthy();
        expect(
            within(screen.getByRole("navigation"))
                .getAllByRole("listitem")
                .map((item) => item.textContent),
        ).toEqual(["label.step-person", "label.step-address", "label.review"]);
    });

    it("renders each value on the Review Step through its Field Type", async () => {
        const user = userEvent.setup();
        const types: WizardFieldTypeRegistry = {
            text: { ...standardWizardFieldTypes.text, renderReview: (value) => `«${value}»` },
        };
        await renderWizard(<Harness types={types} />);

        await user.type(await screen.findByLabelText("label.name"), "Alice");
        await user.click(screen.getByRole("button", { name: "button.next" }));
        await user.type(await screen.findByLabelText("label.city"), "Berlin");
        await user.click(screen.getByRole("button", { name: "button.next" }));

        expect(await screen.findByText("«Alice»")).toBeTruthy();
        expect(screen.getByText("«Berlin»")).toBeTruthy();
    });

    it("leaves fields that were left empty off the Review Step", async () => {
        const user = userEvent.setup();
        await renderWizard(<Harness />);

        await user.type(await screen.findByLabelText("label.name"), "Alice");
        await user.click(screen.getByRole("button", { name: "button.next" }));
        await user.click(await screen.findByRole("button", { name: "button.next" }));

        const address = await screen.findByRole("region", { name: "label.step-address" });
        expect(within(address).queryByText("label.city")).toBeNull();
        expect(within(address).getByRole("button", { name: "button.edit" })).toBeTruthy();
    });

    it("submits from the last regular step when the Wizard opts out of the Review Step", async () => {
        const user = userEvent.setup();
        const onSubmit = vi.fn(async () => ({ ok: true }) as const);
        await renderWizard(<Harness definition={contactWizardWithoutReview} onSubmit={onSubmit} />);

        await user.type(await screen.findByLabelText("label.name"), "Alice");
        await user.click(screen.getByRole("button", { name: "button.next" }));
        await user.type(await screen.findByLabelText("label.city"), "Berlin");
        await user.click(screen.getByRole("button", { name: "button.submit" }));

        await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ name: "Alice", city: "Berlin" }));
        expect(within(screen.getByRole("navigation")).getAllByRole("listitem")).toHaveLength(2);
    });

    it("jumps from the Review Step to a step and back without re-entering values", async () => {
        const user = userEvent.setup();
        const onStepChange = vi.fn();
        const onSubmit = vi.fn(async () => ({ ok: true }) as const);
        await renderWizard(<Harness onStepChange={onStepChange} onSubmit={onSubmit} />);

        await user.type(await screen.findByLabelText("label.name"), "Alice");
        await user.click(screen.getByRole("button", { name: "button.next" }));
        await user.type(await screen.findByLabelText("label.city"), "Berlin");
        await user.click(screen.getByRole("button", { name: "button.next" }));

        const person = await screen.findByRole("region", { name: "label.step-person" });
        await user.click(within(person).getByRole("button", { name: "button.edit" }));
        expect(onStepChange).toHaveBeenLastCalledWith("person", { replace: false });
        const name = await screen.findByLabelText("label.name");
        await user.clear(name);
        await user.type(name, "Bob");
        await user.click(screen.getByRole("button", { name: "button.next" }));
        expect(await screen.findByDisplayValue("Berlin")).toBeTruthy();
        await user.click(screen.getByRole("button", { name: "button.next" }));

        expect(await screen.findByText("Bob")).toBeTruthy();
        await user.click(screen.getByRole("button", { name: "button.submit" }));
        await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ name: "Bob", city: "Berlin" }));
    });

    it("jumps back to the Review Step through the StepBar after editing a step", async () => {
        const user = userEvent.setup();
        const onStepChange = vi.fn();
        await renderWizard(<Harness onStepChange={onStepChange} />);

        await user.type(await screen.findByLabelText("label.name"), "Alice");
        await user.click(screen.getByRole("button", { name: "button.next" }));
        await user.type(await screen.findByLabelText("label.city"), "Berlin");
        await user.click(screen.getByRole("button", { name: "button.next" }));
        const person = await screen.findByRole("region", { name: "label.step-person" });
        await user.click(within(person).getByRole("button", { name: "button.edit" }));
        const name = await screen.findByLabelText("label.name");
        await user.clear(name);
        await user.type(name, "Bob");
        await user.click(within(screen.getByRole("navigation")).getByRole("button", { name: "label.review" }));

        expect(await screen.findByText("Bob")).toBeTruthy();
        expect(onStepChange).toHaveBeenLastCalledWith("review", { replace: false });
    });

    it("doesn't offer the Review Step in the StepBar before every step is completed", async () => {
        const user = userEvent.setup();
        await renderWizard(<Harness />);

        await user.type(await screen.findByLabelText("label.name"), "Alice");
        await user.click(screen.getByRole("button", { name: "button.next" }));
        await screen.findByLabelText("label.city");

        expect(within(screen.getByRole("navigation")).queryByRole("button", { name: "label.review" })).toBeNull();
    });

    it("keeps entered values when going back", async () => {
        const user = userEvent.setup();
        await renderWizard(<Harness />);

        await user.type(await screen.findByLabelText("label.name"), "Alice");
        await user.click(screen.getByRole("button", { name: "button.next" }));
        await user.click(await screen.findByRole("button", { name: "button.back" }));

        expect(await screen.findByDisplayValue("Alice")).toBeTruthy();
    });

    it("shows each step as finished, active or pending in the StepBar", async () => {
        const user = userEvent.setup();
        await renderWizard(<Harness />);

        const name = await screen.findByLabelText("label.name");
        expect(stepStates()).toEqual(["active", "pending", "pending"]);
        await user.type(name, "Alice");
        await user.click(screen.getByRole("button", { name: "button.next" }));
        await screen.findByLabelText("label.city");
        expect(stepStates()).toEqual(["finished", "active", "pending"]);
    });

    it("only lets the user select visited steps in the StepBar", async () => {
        const user = userEvent.setup();
        await renderWizard(<Harness />);

        const stepBar = () => within(screen.getByRole("navigation"));
        await user.type(await screen.findByLabelText("label.name"), "Alice");
        expect(stepBar().queryByRole("button", { name: "label.step-address" })).toBeNull();

        await user.click(screen.getByRole("button", { name: "button.next" }));
        await screen.findByLabelText("label.city");
        expect(stepBar().getByRole("button", { name: "label.step-person" })).toBeTruthy();
    });

    it("keeps values of later steps when jumping back and forth through the StepBar", async () => {
        const user = userEvent.setup();
        const onStepChange = vi.fn();
        await renderWizard(<Harness onStepChange={onStepChange} />);

        const stepBar = () => within(screen.getByRole("navigation"));
        await user.type(await screen.findByLabelText("label.name"), "Alice");
        await user.click(screen.getByRole("button", { name: "button.next" }));
        await user.type(await screen.findByLabelText("label.city"), "Berlin");

        await user.click(stepBar().getByRole("button", { name: "label.step-person" }));
        expect(await screen.findByDisplayValue("Alice")).toBeTruthy();
        await user.click(stepBar().getByRole("button", { name: "label.step-address" }));

        expect(await screen.findByDisplayValue("Berlin")).toBeTruthy();
        expect(onStepChange.mock.calls).toEqual([
            ["address", { replace: false }],
            ["person", { replace: false }],
            ["address", { replace: false }],
        ]);
    });

    it("does not jump forward through the StepBar while the current step is invalid", async () => {
        const user = userEvent.setup();
        const onStepChange = vi.fn();
        await renderWizard(<Harness onStepChange={onStepChange} />);

        const stepBar = () => within(screen.getByRole("navigation"));
        await user.type(await screen.findByLabelText("label.name"), "Alice");
        await user.click(screen.getByRole("button", { name: "button.next" }));
        await user.click(await stepBar().findByRole("button", { name: "label.step-person" }));
        await user.clear(await screen.findByLabelText("label.name"));
        await user.click(stepBar().getByRole("button", { name: "label.step-address" }));

        expect(await screen.findByText("error.required")).toBeTruthy();
        expect(onStepChange).toHaveBeenLastCalledWith("person", { replace: false });
    });

    it("does not let the StepBar skip a step that was left invalid by going back", async () => {
        const user = userEvent.setup();
        await renderWizard(<Harness definition={threeStepWizard} />);

        const stepBar = () => within(screen.getByRole("navigation"));
        await user.type(await screen.findByLabelText("label.a"), "A");
        await user.click(screen.getByRole("button", { name: "button.next" }));
        await user.type(await screen.findByLabelText("label.b"), "B");
        await user.click(screen.getByRole("button", { name: "button.next" }));
        await screen.findByLabelText("label.c");

        await user.click(stepBar().getByRole("button", { name: "label.step-b" }));
        await user.clear(await screen.findByLabelText("label.b"));
        await user.click(screen.getByRole("button", { name: "button.back" }));
        await screen.findByLabelText("label.a");

        expect(stepBar().getByRole("button", { name: "label.step-b" })).toBeTruthy();
        expect(stepBar().queryByRole("button", { name: "label.step-c" })).toBeNull();
    });

    it("shows steps with submit errors in the error state of the StepBar", async () => {
        const user = userEvent.setup();
        const onSubmit = async (): Promise<WizardSubmitResult<typeof contactWizard>> => ({
            ok: false,
            errors: [
                { field: "name", key: "error.name-taken", namespace: "wizard" },
                { field: "city", key: "error.unknown-city", namespace: "wizard" },
            ],
        });
        await renderWizard(<Harness onSubmit={onSubmit} />);

        await fillAndSubmit(user);
        await screen.findByText("error.name-taken");

        expect(stepStates()).toEqual(["active", "error", "pending"]);
    });

    it("clears a field's submit error once its value changes", async () => {
        const user = userEvent.setup();
        const onSubmit = async (): Promise<WizardSubmitResult<typeof contactWizard>> => ({
            ok: false,
            errors: [{ field: "city", key: "error.unknown-city", namespace: "wizard" }],
        });
        await renderWizard(<Harness onSubmit={onSubmit} />);

        await fillAndSubmit(user);
        await screen.findByText("error.unknown-city");
        await user.click(screen.getByRole("button", { name: "button.back" }));
        await screen.findByLabelText("label.name");
        expect(stepStates()).toEqual(["active", "error", "pending"]);

        await user.click(screen.getByRole("button", { name: "button.next" }));
        await user.type(await screen.findByLabelText("label.city"), "x");

        expect(screen.queryByText("error.unknown-city")).toBeNull();
        expect(stepStates()).toEqual(["finished", "active", "pending"]);
    });

    it("announces the error state of a step to screen readers", async () => {
        const user = userEvent.setup();
        const onSubmit = async (): Promise<WizardSubmitResult<typeof contactWizard>> => ({
            ok: false,
            errors: [{ field: "city", key: "error.unknown-city", namespace: "wizard" }],
        });
        await renderWizard(<Harness onSubmit={onSubmit} />);

        await fillAndSubmit(user);
        await screen.findByText("error.unknown-city");
        await user.click(screen.getByRole("button", { name: "button.back" }));
        await screen.findByLabelText("label.name");

        const address = within(screen.getByRole("navigation")).getAllByRole("listitem")[1];
        expect(address.getAttribute("data-state")).toBe("error");
        expect(within(address).getByText("accessibility.step-error")).toBeTruthy();
        await user.click(within(address).getByRole("button"));
        expect(await screen.findByText("error.unknown-city")).toBeTruthy();
    });

    it("treats a submit error for an unknown field as a general error", async () => {
        const user = userEvent.setup();
        const onStepChange = vi.fn();
        const onSubmit = async () =>
            ({
                ok: false,
                errors: [{ field: "street", key: "error.unknown-street", namespace: "wizard" }],
            }) as unknown as WizardSubmitResult<typeof contactWizard>;
        await renderWizard(<Harness onStepChange={onStepChange} onSubmit={onSubmit} />);

        await fillAndSubmit(user);

        expect(await screen.findByText("error.unknown-street")).toBeTruthy();
        expect(onStepChange).toHaveBeenLastCalledWith("review", { replace: false });
        expect(stepStates()).toEqual(["finished", "finished", "active"]);
    });

    it("stays on the submit step for a field error on it", async () => {
        const user = userEvent.setup();
        const onStepChange = vi.fn();
        const onSubmit = async (): Promise<WizardSubmitResult<typeof contactWizard>> => ({
            ok: false,
            errors: [{ field: "city", key: "error.unknown-city", namespace: "wizard" }],
        });
        await renderWizard(
            <Harness definition={contactWizardWithoutReview} onStepChange={onStepChange} onSubmit={onSubmit} />,
        );

        await user.type(await screen.findByLabelText("label.name"), "Alice");
        await user.click(screen.getByRole("button", { name: "button.next" }));
        await user.type(await screen.findByLabelText("label.city"), "Berlin");
        await user.click(screen.getByRole("button", { name: "button.submit" }));

        expect(await screen.findByText("error.unknown-city")).toBeTruthy();
        expect(onStepChange).toHaveBeenCalledTimes(1);
        expect(onStepChange).toHaveBeenLastCalledWith("address", { replace: false });
    });

    it("keeps the last step completed in the store after a rejected submit", async () => {
        const user = userEvent.setup();
        const store = createInMemoryWizardRunStore();
        const onSubmit = async (): Promise<WizardSubmitResult<typeof contactWizard>> => ({
            ok: false,
            errors: [{ field: "name", key: "error.name-taken", namespace: "wizard" }],
        });
        await renderWizard(<Harness definition={contactWizardWithoutReview} store={store} onSubmit={onSubmit} />);

        await user.type(await screen.findByLabelText("label.name"), "Alice");
        await user.click(screen.getByRole("button", { name: "button.next" }));
        await user.type(await screen.findByLabelText("label.city"), "Berlin");
        await user.click(screen.getByRole("button", { name: "button.submit" }));
        await screen.findByText("error.name-taken");

        expect(await store.load({ wizardId: "contact", version: 1 })).toMatchObject({
            completedSteps: ["person", "address"],
            currentStep: "person",
        });
    });

    it("jumps from the step shown when the submit returns, not the one it started on", async () => {
        let reject: (() => void) | undefined;
        const onSubmit = () =>
            new Promise<WizardSubmitResult<typeof contactWizard>>((resolve) => {
                reject = () => resolve({ ok: false, errors: [{ field: "city", key: "error.x", namespace: "wizard" }] });
            });
        const onStepChange = vi.fn();
        const wizard = (step: string) => (
            <WizardFieldTypesProvider types={standardWizardFieldTypes}>
                <Suspense fallback={null}>
                    <Wizard
                        definition={contactWizard}
                        step={step}
                        onStepChange={onStepChange}
                        onSubmit={onSubmit}
                        onDone={() => {}}
                        store={reviewedStore({ name: "Bob", city: "Hamburg" })}
                    />
                </Suspense>
            </WizardFieldTypesProvider>
        );
        const { rerender } = await renderWizard(wizard("review"));

        fireEvent.submit((await screen.findByRole("button", { name: "button.submit" })).closest("form")!);
        await waitFor(() => expect(reject).toBeDefined());
        rerender(wizard("person"));
        await screen.findByLabelText("label.name");
        await act(async () => reject!());

        await waitFor(() => expect(onStepChange).toHaveBeenLastCalledWith("address", { replace: false }));
    });

    it("saves the Wizard Run through the store when changing steps", async () => {
        const user = userEvent.setup();
        const store = createInMemoryWizardRunStore();
        await renderWizard(<Harness store={store} />);

        await user.type(await screen.findByLabelText("label.name"), "Alice");
        await user.click(screen.getByRole("button", { name: "button.next" }));
        await screen.findByLabelText("label.city");

        expect(await store.load({ wizardId: "contact", version: 1 })).toEqual({
            values: {
                name: { value: "Alice", secret: false },
                city: { value: "", secret: false },
            },
            completedSteps: ["person"],
            currentStep: "address",
        });
    });

    it("continues a Wizard Run loaded from the store", async () => {
        const store = createInMemoryWizardRunStore();
        await store.save(
            { wizardId: "contact", version: 1 },
            {
                values: { name: { value: "Bob", secret: false }, city: { value: "Hamburg", secret: false } },
                completedSteps: ["person"],
                currentStep: "person",
            },
        );
        await renderWizard(<Harness store={store} />);

        expect(await screen.findByDisplayValue("Bob")).toBeTruthy();
    });

    it("continues a loaded Wizard Run on its saved step when no step is given", async () => {
        const onStepChange = vi.fn();
        const store = createInMemoryWizardRunStore();
        await store.save(
            { wizardId: "contact", version: 1 },
            {
                values: { name: { value: "Bob", secret: false }, city: { value: "", secret: false } },
                completedSteps: ["person"],
                currentStep: "address",
            },
        );
        await renderWizard(<Harness store={store} onStepChange={onStepChange} />);

        expect(await screen.findByLabelText("label.city")).toBeTruthy();
        expect(onStepChange).toHaveBeenCalledWith("address", { replace: true });
    });

    it("starts on the first step without reporting it when neither a step is given nor one was saved", async () => {
        const onStepChange = vi.fn();
        await renderWizard(<Harness onStepChange={onStepChange} />);

        expect(await screen.findByLabelText("label.name")).toBeTruthy();
        expect(onStepChange).not.toHaveBeenCalled();
    });

    it("redirects an unknown step to the first incomplete one", async () => {
        const onStepChange = vi.fn();
        await renderWizard(<Harness initialStep={"nope"} onStepChange={onStepChange} />);

        await waitFor(() => expect(onStepChange).toHaveBeenCalledWith("person", { replace: true }));
        expect(await screen.findByLabelText("label.name")).toBeTruthy();
    });

    it("redirects a step whose predecessors aren't completed to the first incomplete one", async () => {
        const onStepChange = vi.fn();
        await renderWizard(<Harness initialStep={"address"} onStepChange={onStepChange} />);

        await waitFor(() => expect(onStepChange).toHaveBeenCalledWith("person", { replace: true }));
        expect(await screen.findByLabelText("label.name")).toBeTruthy();
        expect(screen.queryByLabelText("label.city")).toBeNull();
    });

    it("opens a step whose predecessors are completed in a loaded Wizard Run", async () => {
        const store = createInMemoryWizardRunStore();
        await store.save(
            { wizardId: "contact", version: 1 },
            {
                values: { name: { value: "Bob", secret: false }, city: { value: "", secret: false } },
                completedSteps: ["person"],
                currentStep: "address",
            },
        );
        const onStepChange = vi.fn();
        await renderWizard(<Harness store={store} initialStep={"address"} onStepChange={onStepChange} />);

        expect(await screen.findByLabelText("label.city")).toBeTruthy();
        expect(onStepChange).not.toHaveBeenCalled();
    });

    it("redirects an unknown step in a loaded Wizard Run to its first incomplete step", async () => {
        const store = createInMemoryWizardRunStore();
        await store.save(
            { wizardId: "contact", version: 1 },
            {
                values: { name: { value: "Bob", secret: false }, city: { value: "", secret: false } },
                completedSteps: ["person"],
                currentStep: "address",
            },
        );
        const onStepChange = vi.fn();
        await renderWizard(<Harness store={store} initialStep={"nope"} onStepChange={onStepChange} />);

        await waitFor(() => expect(onStepChange).toHaveBeenCalledWith("address", { replace: true }));
        expect(await screen.findByLabelText("label.city")).toBeTruthy();
    });

    it("resumes a loaded Wizard Run on the Review Step", async () => {
        const onStepChange = vi.fn();
        await renderWizard(
            <Harness store={reviewedStore({ name: "Bob", city: "Hamburg" })} onStepChange={onStepChange} />,
        );

        expect(await screen.findByRole("region", { name: "label.step-person" })).toBeTruthy();
        await waitFor(() => expect(onStepChange).toHaveBeenCalledWith("review", { replace: true }));
    });

    it("redirects a saved Review Step to the first incomplete step when the Wizard opts out of it", async () => {
        const store = createInMemoryWizardRunStore();
        await store.save(
            { wizardId: "contact", version: 1 },
            {
                values: { name: { value: "Bob", secret: false }, city: { value: "", secret: false } },
                completedSteps: ["person"],
                currentStep: "review",
            },
        );
        const onStepChange = vi.fn();
        await renderWizard(
            <Harness definition={contactWizardWithoutReview} store={store} onStepChange={onStepChange} />,
        );

        await waitFor(() => expect(onStepChange).toHaveBeenCalledWith("address", { replace: true }));
        expect(await screen.findByLabelText("label.city")).toBeTruthy();
    });

    it("guards against leaving once values are entered", async () => {
        const user = userEvent.setup();
        await renderWizard(<Harness />);

        const name = await screen.findByLabelText("label.name");
        expect(screen.getByLabelText("guard").textContent).toBe("clean");
        await user.type(name, "Alice");
        expect(screen.getByLabelText("guard").textContent).toBe("dirty");
    });

    it("stays dirty after changing steps", async () => {
        const user = userEvent.setup();
        await renderWizard(<Harness />);

        await user.type(await screen.findByLabelText("label.name"), "Alice");
        await user.click(screen.getByRole("button", { name: "button.next" }));
        await screen.findByLabelText("label.city");

        expect(screen.getByLabelText("guard").textContent).toBe("dirty");
    });

    it("lifts the guard before reporting a successful submit as done", async () => {
        const user = userEvent.setup();
        let guardOnDone: string | null = null;
        const onDone = vi.fn(() => {
            guardOnDone = screen.getByLabelText("guard").textContent;
        });
        await renderWizard(<Harness onDone={onDone} />);

        await user.type(await screen.findByLabelText("label.name"), "Alice");
        await user.click(screen.getByRole("button", { name: "button.next" }));
        await screen.findByLabelText("label.city");
        await user.click(screen.getByRole("button", { name: "button.next" }));
        await user.click(await screen.findByRole("button", { name: "button.submit" }));

        await waitFor(() => expect(onDone).toHaveBeenCalledOnce());
        expect(guardOnDone).toBe("clean");
    });

    it("suspends until the store has loaded the Wizard Run, loading it once", async () => {
        const user = userEvent.setup();
        const inner = createInMemoryWizardRunStore();
        let release = () => {};
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });
        const load = vi.fn(async (key: Parameters<WizardRunStore["load"]>[0]) => {
            await gate;
            return inner.load(key);
        });
        const store: WizardRunStore = { load, save: inner.save };
        await renderWizard(<Harness store={store} fallback={"loading"} />);

        expect(screen.getByText("loading")).toBeTruthy();
        expect(screen.queryByLabelText("label.name")).toBeNull();

        await act(async () => release());

        await user.type(await screen.findByLabelText("label.name"), "Alice");
        await user.click(screen.getByRole("button", { name: "button.next" }));
        await screen.findByLabelText("label.city");
        expect(screen.queryByText("loading")).toBeNull();
        expect(load).toHaveBeenCalledTimes(1);
    });

    it("loads the saved Wizard Run again when mounted again with the same store", async () => {
        const user = userEvent.setup();
        const store = createInMemoryWizardRunStore();
        const first = await renderWizard(<Harness store={store} />);

        await user.type(await screen.findByLabelText("label.name"), "Alice");
        await user.click(screen.getByRole("button", { name: "button.next" }));
        await screen.findByLabelText("label.city");
        first.unmount();

        await renderWizard(<Harness store={store} />);
        expect(await screen.findByLabelText("label.city")).toBeTruthy();
        await user.click(screen.getByRole("button", { name: "button.back" }));
        expect(await screen.findByDisplayValue("Alice")).toBeTruthy();
    });

    it("keeps the Wizard Run when the store is passed inline", async () => {
        const user = userEvent.setup();
        await renderWizard(<Harness inlineStore={true} />);

        await user.type(await screen.findByLabelText("label.name"), "Alice");
        await user.click(screen.getByRole("button", { name: "button.next" }));
        await user.click(await screen.findByRole("button", { name: "button.back" }));

        expect(await screen.findByDisplayValue("Alice")).toBeTruthy();
    });

    it("refuses to submit while an earlier step is invalid and jumps to it", async () => {
        const user = userEvent.setup();
        const onSubmit = vi.fn(async () => ({ ok: true }) as const);
        const onStepChange = vi.fn();
        await renderWizard(
            <Harness
                store={reviewedStore({ name: "", city: "Berlin" })}
                initialStep={"review"}
                onSubmit={onSubmit}
                onStepChange={onStepChange}
            />,
        );

        await user.click(await screen.findByRole("button", { name: "button.submit" }));

        expect(await screen.findByText("error.required")).toBeTruthy();
        expect(onStepChange).toHaveBeenLastCalledWith("person", { replace: false });
        expect(onSubmit).not.toHaveBeenCalled();
    });

    it("doesn't record the Review Step as completed when submit is refused", async () => {
        const user = userEvent.setup();
        const store = reviewedStore({ name: "", city: "Berlin" });
        await renderWizard(<Harness initialStep={"review"} store={store} />);

        await user.click(await screen.findByRole("button", { name: "button.submit" }));

        await screen.findByText("error.required");
        expect(
            within(screen.getByRole("navigation"))
                .getAllByRole("listitem")
                .map((item) => item.getAttribute("data-state")),
        ).toEqual(["active", "finished", "pending"]);
        expect((await store.load({ wizardId: "contact", version: 1 }))?.completedSteps ?? []).not.toContain("review");
    });

    it("submits only once on a double submit", async () => {
        let finish = () => {};
        const onSubmit = vi.fn(
            () =>
                new Promise<WizardSubmitResult<typeof contactWizard>>((resolve) => {
                    finish = () => resolve({ ok: true });
                }),
        );
        const onDone = vi.fn();
        await renderWizard(
            <Harness
                initialStep={"review"}
                store={reviewedStore({ name: "Bob", city: "Hamburg" })}
                onSubmit={onSubmit}
                onDone={onDone}
            />,
        );

        const submit = await screen.findByRole("button", { name: "button.submit" });
        const form = submit.closest("form")!;
        fireEvent.submit(form);
        await waitFor(() => expect(onSubmit).toHaveBeenCalled());
        fireEvent.submit(form);
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 50));
            finish();
        });

        await waitFor(() => expect(onDone).toHaveBeenCalled());
        expect(onSubmit).toHaveBeenCalledTimes(1);
    });
});

const planWizard = defineWizard({
    id: "plan",
    version: 1,
    steps: [
        {
            id: "plan",
            label: "label.step-plan",
            sections: [
                {
                    id: "plan-choice",
                    fields: [
                        { id: "plan", type: "text", label: "label.plan", required: true },
                        {
                            id: "reason",
                            type: "text",
                            label: "label.reason",
                            required: true,
                            visibleWhen: { field: "plan", equals: "other" },
                        },
                    ],
                },
            ],
        },
        {
            id: "billing",
            label: "label.step-billing",
            visibleWhen: { field: "plan", equals: "paid" },
            sections: [
                { id: "billing-account", fields: [{ id: "iban", type: "text", label: "label.iban", required: true }] },
            ],
        },
        {
            id: "notes",
            label: "label.step-notes",
            sections: [
                {
                    id: "notes-invoice",
                    visibleWhen: { field: "plan", equals: "paid" },
                    fields: [{ id: "invoiceNote", type: "text", label: "label.invoice-note" }],
                },
                { id: "notes-general", fields: [{ id: "note", type: "text", label: "label.note" }] },
            ],
        },
    ],
} as const);

i18n.addResourceBundle("en", "wizard-plan", {
    label: {
        "step-plan": "label.step-plan",
        "step-billing": "label.step-billing",
        "step-notes": "label.step-notes",
        plan: "label.plan",
        reason: "label.reason",
        iban: "label.iban",
        "invoice-note": "label.invoice-note",
        note: "label.note",
    },
});

/**
 * The label of every step in the StepBar
 */
function stepLabels() {
    return within(screen.getByRole("navigation"))
        .getAllByRole("listitem")
        .map((item) => item.textContent);
}

describe("Wizard with visibleWhen", () => {
    it("shows a field once an earlier answer calls for it", async () => {
        const user = userEvent.setup();
        await renderWizard(<Harness definition={planWizard} />);

        await user.type(await screen.findByLabelText("label.plan"), "free");
        expect(screen.queryByLabelText("label.reason")).toBeNull();
        await user.clear(screen.getByLabelText("label.plan"));
        await user.type(screen.getByLabelText("label.plan"), "other");

        expect(await screen.findByLabelText("label.reason")).toBeTruthy();
    });

    it("skips a hidden step in Back/Next navigation and the StepBar", async () => {
        const user = userEvent.setup();
        const onStepChange = vi.fn();
        await renderWizard(<Harness definition={planWizard} onStepChange={onStepChange} />);

        await user.type(await screen.findByLabelText("label.plan"), "free");
        expect(stepLabels()).toEqual(["label.step-plan", "label.step-notes", "label.review"]);
        await user.click(screen.getByRole("button", { name: "button.next" }));

        expect(onStepChange).toHaveBeenLastCalledWith("notes", { replace: false });
        expect(await screen.findByLabelText("label.note")).toBeTruthy();
        expect(screen.queryByLabelText("label.invoice-note")).toBeNull();
        await user.click(screen.getByRole("button", { name: "button.back" }));
        expect(onStepChange).toHaveBeenLastCalledWith("plan", { replace: false });
    });

    it("shows a step and a section once an earlier answer calls for them", async () => {
        const user = userEvent.setup();
        const onStepChange = vi.fn();
        await renderWizard(<Harness definition={planWizard} onStepChange={onStepChange} />);

        await user.type(await screen.findByLabelText("label.plan"), "paid");
        expect(stepLabels()).toEqual(["label.step-plan", "label.step-billing", "label.step-notes", "label.review"]);
        await user.click(screen.getByRole("button", { name: "button.next" }));
        expect(onStepChange).toHaveBeenLastCalledWith("billing", { replace: false });
        await user.type(await screen.findByLabelText("label.iban"), "DE00");
        await user.click(screen.getByRole("button", { name: "button.next" }));

        expect(await screen.findByLabelText("label.invoice-note")).toBeTruthy();
    });

    it("neither validates nor submits hidden fields", async () => {
        const user = userEvent.setup();
        const onSubmit = vi.fn(async () => ({ ok: true }) as const);
        await renderWizard(<Harness definition={planWizard} onSubmit={onSubmit} />);

        await user.type(await screen.findByLabelText("label.plan"), "other");
        await user.clear(await screen.findByLabelText("label.plan"));
        await user.type(screen.getByLabelText("label.plan"), "free");
        await user.click(screen.getByRole("button", { name: "button.next" }));
        await user.type(await screen.findByLabelText("label.note"), "hi");
        await user.click(screen.getByRole("button", { name: "button.next" }));
        await user.click(await screen.findByRole("button", { name: "button.submit" }));

        await waitFor(() => expect(onSubmit).toHaveBeenCalled());
        expect(onSubmit).toHaveBeenCalledWith({ plan: "free", note: "hi" });
    });

    it("no longer shows a completed step as finished once an earlier answer changes its fields", async () => {
        const user = userEvent.setup();
        await renderWizard(<Harness definition={planWizard} store={planStore(["plan", "notes"], "plan")} />);

        const plan = await screen.findByLabelText("label.plan");
        expect(stepStates()).toEqual(["active", "finished", "pending"]);
        await user.clear(plan);
        await user.type(plan, "paid");

        expect(stepStates()).toEqual(["active", "pending", "pending", "pending"]);
        await user.clear(plan);
        await user.type(plan, "free");
        expect(stepStates()).toEqual(["active", "finished", "pending"]);
    });

    it("shows only visible steps and fields on the Review Step", async () => {
        const values = { plan: "free", reason: "because", iban: "DE00", invoiceNote: "po-42", note: "hi" };
        await renderWizard(<Harness definition={planWizard} store={planStore(["plan", "notes"], "review", values)} />);

        const plan = await screen.findByRole("region", { name: "label.step-plan" });
        expect(within(plan).getByText("free")).toBeTruthy();
        expect(within(plan).queryByText("label.reason")).toBeNull();
        const notes = screen.getByRole("region", { name: "label.step-notes" });
        expect(within(notes).getByText("hi")).toBeTruthy();
        expect(within(notes).queryByText("label.invoice-note")).toBeNull();
        expect(screen.queryByRole("region", { name: "label.step-billing" })).toBeNull();
        expect(screen.queryByText("because")).toBeNull();
        expect(screen.queryByText("DE00")).toBeNull();
        expect(screen.queryByText("po-42")).toBeNull();
    });

    it("treats a submit error for a hidden field as a general error", async () => {
        const user = userEvent.setup();
        const onStepChange = vi.fn();
        const onSubmit = async (): Promise<WizardSubmitResult<typeof planWizard>> => ({
            ok: false,
            errors: [{ field: "reason", key: "error.reason-missing", namespace: "wizard" }],
        });
        await renderWizard(
            <Harness
                definition={planWizard}
                onStepChange={onStepChange}
                onSubmit={onSubmit}
                store={planStore(["plan", "notes"], "review", { plan: "free", reason: "because", note: "hi" })}
            />,
        );
        onStepChange.mockClear();

        await user.click(await screen.findByRole("button", { name: "button.submit" }));

        expect(await screen.findByRole("alert")).toHaveProperty("textContent", "error.reason-missing");
        expect(onStepChange).not.toHaveBeenCalled();
        expect(stepStates()).toEqual(["finished", "finished", "active"]);
    });

    it.each([
        { what: "a requested", initialStep: "billing" },
        { what: "a saved", initialStep: undefined },
    ])("redirects $what hidden step to the first incomplete visible step", async ({ initialStep }) => {
        const onStepChange = vi.fn();
        await renderWizard(
            <Harness
                definition={planWizard}
                initialStep={initialStep}
                onStepChange={onStepChange}
                store={planStore(["plan"], "billing")}
            />,
        );

        expect(await screen.findByLabelText("label.note")).toBeTruthy();
        expect(onStepChange).toHaveBeenLastCalledWith("notes", { replace: true });
        expect(stepStates()).toEqual(["finished", "active", "pending"]);
    });

    it("lets the StepBar jump only up to a step an earlier answer just made visible", async () => {
        const user = userEvent.setup();
        const onStepChange = vi.fn();
        await renderWizard(
            <Harness
                definition={planWizard}
                onStepChange={onStepChange}
                store={planStore(["plan", "notes"], "review")}
            />,
        );
        const stepBar = within(await screen.findByRole("navigation"));
        await user.click(stepBar.getByRole("button", { name: "label.step-plan" }));
        const plan = await screen.findByLabelText("label.plan");

        await user.clear(plan);
        await user.type(plan, "paid");

        expect(stepLabels()).toEqual(["label.step-plan", "label.step-billing", "label.step-notes", "label.review"]);
        expect(stepBar.queryByRole("button", { name: "label.step-notes" })).toBeNull();
        expect(stepBar.queryByRole("button", { name: "label.review" })).toBeNull();
        await user.click(stepBar.getByRole("button", { name: "label.step-billing" }));
        expect(onStepChange).toHaveBeenLastCalledWith("billing", { replace: false });
        expect(await screen.findByLabelText("label.iban")).toBeTruthy();
    });

    it("keeps a step left invalid un-completed while an earlier answer hides and shows it", async () => {
        const user = userEvent.setup();
        const values = { plan: "paid", iban: "DE00", note: "hi" };
        await renderWizard(
            <Harness definition={planWizard} store={planStore(["plan", "billing", "notes"], "review", values)} />,
        );
        const stepBar = within(await screen.findByRole("navigation"));
        await user.click(stepBar.getByRole("button", { name: "label.step-billing" }));

        await user.clear(await screen.findByLabelText("label.iban"));
        await user.click(screen.getByRole("button", { name: "button.back" }));

        const plan = await screen.findByLabelText("label.plan");
        expect(stepStates()).toEqual(["active", "pending", "finished", "pending"]);
        expect(stepBar.queryByRole("button", { name: "label.step-notes" })).toBeNull();
        await user.clear(plan);
        await user.type(plan, "free");
        expect(stepStates()).toEqual(["active", "pending", "pending"]);
        await user.clear(plan);
        await user.type(plan, "paid");
        expect(stepStates()).toEqual(["active", "pending", "finished", "pending"]);
    });

    it("keeps the value of a hidden field for when it is shown again", async () => {
        const user = userEvent.setup();
        await renderWizard(<Harness definition={planWizard} />);

        await user.type(await screen.findByLabelText("label.plan"), "other");
        await user.type(await screen.findByLabelText("label.reason"), "because");
        await user.clear(screen.getByLabelText("label.plan"));
        await user.type(screen.getByLabelText("label.plan"), "other");

        expect(await screen.findByDisplayValue("because")).toBeTruthy();
    });
});

/**
 * A store holding a plan Wizard Run
 *
 * @param completedSteps The completed steps
 * @param currentStep The saved step
 * @param values The saved text values; plan `free` and a note by default
 * @returns The store
 */
function planStore(
    completedSteps: Array<string>,
    currentStep: string,
    values: Record<string, string> = { plan: "free", note: "hi" },
): WizardRunStore {
    const store = createInMemoryWizardRunStore();
    void store.save(
        { wizardId: "plan", version: 1 },
        {
            values: Object.fromEntries(
                Object.entries(values).map(([id, value]) => [id, { value, secret: false }] as const),
            ),
            completedSteps,
            currentStep,
        },
    );
    return store;
}

/** A Secret only asked for with one sign-in method */
const signInWizard = defineWizard({
    id: "sign-in",
    version: 1,
    steps: [
        {
            id: "method",
            label: "label.step-method",
            sections: [
                {
                    id: "method-choice",
                    fields: [
                        { id: "method", type: "text", label: "label.method", required: true },
                        {
                            id: "token",
                            type: "password",
                            label: "label.token",
                            required: true,
                            visibleWhen: { field: "method", equals: "token" },
                        },
                    ],
                },
            ],
        },
    ],
} as const);
i18n.addResourceBundle("en", "wizard-sign-in", {
    label: { "step-method": "label.step-method", method: "label.method", token: "label.token" },
});

describe("Wizard Secrets", () => {
    it("neither validates nor submits a hidden Secret", async () => {
        const user = userEvent.setup();
        const onSubmit = vi.fn(async () => ({ ok: true }) as const);
        await renderWizard(<Harness definition={signInWizard} onSubmit={onSubmit} />);

        await user.type(await screen.findByLabelText("label.method"), "token");
        expect(await screen.findByLabelText("label.token")).toBeTruthy();
        await user.clear(screen.getByLabelText("label.method"));
        await user.type(screen.getByLabelText("label.method"), "sso");
        await user.click(screen.getByRole("button", { name: "button.next" }));
        await user.click(await screen.findByRole("button", { name: "button.submit" }));

        await waitFor(() => expect(onSubmit).toHaveBeenCalled());
        expect(onSubmit).toHaveBeenCalledWith({ method: "sso" });
    });

    it("submits a newly entered Secret with its value", async () => {
        const user = userEvent.setup();
        const onSubmit = vi.fn(async () => ({ ok: true }) as const);
        await renderWizard(<Harness definition={accessWizard} onSubmit={onSubmit} />);

        await user.type(await screen.findByLabelText("label.user"), "alice");
        await user.type(screen.getByLabelText("label.password"), "hunter2");
        await user.click(screen.getByRole("button", { name: "button.next" }));
        await user.click(await screen.findByRole("button", { name: "button.submit" }));

        await waitFor(() =>
            expect(onSubmit).toHaveBeenCalledWith({
                user: "alice",
                password: { status: "entered", value: "hunter2" },
                token: { status: "entered", value: "" },
            }),
        );
    });

    it("saves a newly entered Secret with its value and Secret flag", async () => {
        const user = userEvent.setup();
        const inner = createInMemoryWizardRunStore();
        const save = vi.fn(inner.save);
        await renderWizard(<Harness definition={accessWizard} store={{ load: inner.load, save }} />);

        await user.type(await screen.findByLabelText("label.user"), "alice");
        await user.type(screen.getByLabelText("label.password"), "hunter2");
        await user.click(screen.getByRole("button", { name: "button.next" }));

        await waitFor(() => expect(save).toHaveBeenCalled());
        expect(save.mock.lastCall?.[1].values).toEqual({
            user: { value: "alice", secret: false },
            password: { value: { status: "entered", value: "hunter2" }, secret: true },
            token: { value: { status: "entered", value: "" }, secret: true },
        });
    });

    it("never hands a stored Secret back from the in-memory store", async () => {
        const store = createInMemoryWizardRunStore();
        await store.save(
            { wizardId: "access", version: 1 },
            {
                values: {
                    password: { value: { status: "entered", value: "hunter2" }, secret: true },
                    token: { value: { status: "entered", value: "" }, secret: true },
                },
                completedSteps: [],
                currentStep: "credentials",
            },
        );
        expect((await store.load({ wizardId: "access", version: 1 }))?.values).toEqual({
            password: { value: { status: "unchanged" }, secret: true },
        });
    });

    it("shows Secrets on the Review Step only as set or not set", async () => {
        const user = userEvent.setup();
        await renderWizard(<Harness definition={accessWizard} />);

        await user.type(await screen.findByLabelText("label.user"), "alice");
        await user.type(screen.getByLabelText("label.password"), "hunter2");
        await user.click(screen.getByRole("button", { name: "button.next" }));

        const review = await screen.findByRole("region", { name: "label.step-credentials" });
        expect(within(review).getByText("alice")).toBeTruthy();
        expect(within(review).getByText("label.secret-set")).toBeTruthy();
        expect(within(review).getByText("label.secret-not-set")).toBeTruthy();
        expect(review.textContent).not.toContain("hunter2");
    });

    it("shows an already set Secret as set and submits it unchanged", async () => {
        const user = userEvent.setup();
        const onSubmit = vi.fn(async () => ({ ok: true }) as const);
        await renderWizard(<Harness definition={accessWizard} store={accessStore()} onSubmit={onSubmit} />);

        expect(await screen.findByText("label.secret-set")).toBeTruthy();
        expect(screen.getByRole("button", { name: "button.replace" })).toBeTruthy();
        expect(screen.queryByLabelText("label.password")).toBeNull();
        await user.click(screen.getByRole("button", { name: "button.next" }));
        await user.click(await screen.findByRole("button", { name: "button.submit" }));

        await waitFor(() =>
            expect(onSubmit).toHaveBeenCalledWith({
                user: "alice",
                password: { status: "unchanged" },
                token: { status: "entered", value: "" },
            }),
        );
    });

    it("replaces an already set Secret with a newly entered one", async () => {
        const user = userEvent.setup();
        const onSubmit = vi.fn(async () => ({ ok: true }) as const);
        await renderWizard(<Harness definition={accessWizard} store={accessStore()} onSubmit={onSubmit} />);

        await user.click(await screen.findByRole("button", { name: "button.replace" }));
        expect(screen.queryByText("label.secret-set")).toBeNull();
        await user.click(screen.getByRole("button", { name: "button.next" }));
        expect(await screen.findByText("error.required")).toBeTruthy();
        await user.type(screen.getByLabelText("label.password"), "correct horse");
        await user.click(screen.getByRole("button", { name: "button.next" }));
        await user.click(await screen.findByRole("button", { name: "button.submit" }));

        await waitFor(() =>
            expect(onSubmit).toHaveBeenCalledWith({
                user: "alice",
                password: { status: "entered", value: "correct horse" },
                token: { status: "entered", value: "" },
            }),
        );
    });

    it("cancels replacing an already set Secret and keeps it unchanged", async () => {
        const user = userEvent.setup();
        const onSubmit = vi.fn(async () => ({ ok: true }) as const);
        await renderWizard(<Harness definition={accessWizard} store={accessStore()} onSubmit={onSubmit} />);

        await user.click(await screen.findByRole("button", { name: "button.replace" }));
        await user.type(screen.getByLabelText("label.password"), "oops");
        await user.click(screen.getByRole("button", { name: "button.cancel" }));
        expect(screen.getByText("label.secret-set")).toBeTruthy();
        expect(screen.queryByLabelText("label.password")).toBeNull();
        await user.click(screen.getByRole("button", { name: "button.next" }));
        await user.click(await screen.findByRole("button", { name: "button.submit" }));

        await waitFor(() =>
            expect(onSubmit).toHaveBeenCalledWith({
                user: "alice",
                password: { status: "unchanged" },
                token: { status: "entered", value: "" },
            }),
        );
    });

    it("offers no cancel for a Secret that was not set", async () => {
        await renderWizard(<Harness definition={accessWizard} />);

        expect(await screen.findByLabelText("label.password")).toBeTruthy();
        expect(screen.queryByRole("button", { name: "button.cancel" })).toBeNull();
    });

    it("jumps to the step of a Secret with a submit error and clears the error once the Secret changes", async () => {
        const user = userEvent.setup();
        const onStepChange = vi.fn();
        const onSubmit = vi.fn(async (): Promise<WizardSubmitResult<typeof apiWizard>> => ({
            ok: false,
            errors: [{ field: "apiKey", key: "error.key-rejected", namespace: "wizard" }],
        }));
        await renderWizard(
            <Harness definition={apiWizard} store={apiStore()} onStepChange={onStepChange} onSubmit={onSubmit} />,
        );

        await user.click(await screen.findByRole("button", { name: "button.submit" }));

        expect(await screen.findByText("error.key-rejected")).toBeTruthy();
        expect(screen.getByText("label.secret-set")).toBeTruthy();
        expect(onStepChange).toHaveBeenLastCalledWith("access", { replace: false });
        await user.click(screen.getByRole("button", { name: "button.back" }));
        await screen.findByLabelText("label.company-name");
        expect(stepStates()).toEqual(["active", "error", "pending"]);

        await user.click(screen.getByRole("button", { name: "button.next" }));
        await user.click(await screen.findByRole("button", { name: "button.replace" }));
        await user.type(screen.getByLabelText("label.api-key"), "new-key");

        expect(screen.queryByText("error.key-rejected")).toBeNull();
        expect(stepStates()).toEqual(["finished", "active", "pending"]);
    });

    it("never writes an entered Secret into the DOM", async () => {
        const user = userEvent.setup();
        const { container } = await renderWizard(<Harness definition={accessWizard} />);

        await user.type(await screen.findByLabelText("label.password"), "hunter2");
        expect(container.innerHTML).not.toContain("hunter2");
        await user.click(screen.getByRole("button", { name: "button.next" }));
        await user.click(await screen.findByRole("button", { name: "button.back" }));

        const password = (await screen.findByLabelText("label.password")) as HTMLInputElement;
        expect(password.value).toBe("hunter2");
        expect(container.innerHTML).not.toContain("hunter2");
    });

    it("shows a Secret that a store wrongly hands back as set, without its value", async () => {
        const inner = accessStore();
        const store: WizardRunStore = {
            ...inner,
            load: async () =>
                ({
                    values: { password: { value: { status: "entered", value: "hunter2" }, secret: true } },
                    completedSteps: [],
                    currentStep: "credentials",
                }) as unknown as WizardLoadedRunState,
        };
        const { container } = await renderWizard(<Harness definition={accessWizard} store={store} />);

        expect(await screen.findByText("label.secret-set")).toBeTruthy();
        expect(container.innerHTML).not.toContain("hunter2");
    });
});

/** A store holding an api Wizard Run on the Review Step, whose API key is already set */
function apiStore(): WizardRunStore {
    const store = createInMemoryWizardRunStore();
    void store.save(
        { wizardId: "api", version: 1 },
        {
            values: {
                companyName: { value: "ACME", secret: false },
                apiKey: { value: { status: "unchanged" }, secret: true },
            },
            completedSteps: ["company", "access"],
            currentStep: "review",
        },
    );
    return store;
}

/** A store holding an access Wizard Run whose password is already set */
function accessStore(): WizardRunStore {
    const store = createInMemoryWizardRunStore();
    void store.save(
        { wizardId: "access", version: 1 },
        {
            values: {
                user: { value: "alice", secret: false },
                password: { value: { status: "unchanged" }, secret: true },
            },
            completedSteps: [],
            currentStep: "credentials",
        },
    );
    return store;
}

/**
 * A store holding a contact Wizard Run on the Review Step, with both steps completed
 *
 * @param values The saved values, which may no longer be valid
 * @param values.name The saved name
 * @param values.city The saved city
 * @returns The store
 */
function reviewedStore(values: { name: string; city: string }): WizardRunStore {
    const store = createInMemoryWizardRunStore();
    void store.save(
        { wizardId: "contact", version: 1 },
        {
            values: { name: { value: values.name, secret: false }, city: { value: values.city, secret: false } },
            completedSteps: ["person", "address"],
            currentStep: "review",
        },
    );
    return store;
}

function _typeChecks() {
    const values = {} as WizardValues<typeof contactWizard>;
    const name: string = values.name;
    const city: string = values.city;
    // @ts-expect-error `street` is not a field of the contact wizard
    void values.street;
    void [name, city];

    const access = {} as WizardValues<typeof accessWizard>;
    const user: string = access.user;
    // @ts-expect-error a Secret may be unchanged and then carries no value
    const password: string = access.password;
    // @ts-expect-error only a newly entered Secret carries its value
    void access.password.value;
    const entered: string | undefined = access.password.status === "entered" ? access.password.value : undefined;
    void [user, password, entered];

    const signIn = {} as WizardValues<typeof signInWizard>;
    const token: WizardSecretValue<string> | undefined = signIn.token;
    // @ts-expect-error `token` is only visible when `method` is "token"
    const tokenDefined: WizardSecretValue<string> = signIn.token;
    void [token, tokenDefined];

    const _tierWizard = defineWizard({
        id: "tier",
        version: 1,
        steps: [
            {
                id: "tier",
                label: "label.step-tier",
                sections: [
                    {
                        id: "tier-choice",
                        fields: [
                            {
                                id: "tier",
                                type: "select",
                                label: "label.tier",
                                required: true,
                                config: {
                                    options: [
                                        { value: "small", label: "label.small" },
                                        { value: "large", label: "label.large" },
                                    ],
                                },
                            },
                            {
                                id: "region",
                                type: "radio",
                                label: "label.region",
                                required: true,
                                visibleWhen: { field: "tier", equals: "large" },
                                config: { options: [{ value: "eu", label: "label.eu" }] },
                            },
                        ],
                    },
                ],
            },
        ],
    } as const);
    const tier = {} as WizardValues<typeof _tierWizard>;
    const size: "small" | "large" = tier.tier;
    const region: "eu" | undefined = tier.region;
    // @ts-expect-error `region` is only visible when `tier` is "large"
    const regionDefined: "eu" = tier.region;
    void [size, region, regionDefined];

    const store: WizardRunStore = {
        // @ts-expect-error `load` can't hand back a Secret's value, only `unchanged`
        load: async () => ({
            values: { password: { value: { status: "entered", value: "hunter2" }, secret: true } },
            completedSteps: [],
            currentStep: "credentials",
        }),
        save: async () => {},
    };
    void store;

    const types: WizardFieldTypeRegistry = {
        // @ts-expect-error `text` is not a Secret, so its runtime flag can't claim it is
        text: { ...standardWizardFieldTypes.text, secret: true },
        // @ts-expect-error `password` is a Secret, so its runtime flag must say so
        password: { ...standardWizardFieldTypes.password, secret: false },
    };
    void types;

    const plan = {} as WizardValues<typeof planWizard>;
    const always: string = plan.plan;
    const note: string = plan.note;
    const reason: string | undefined = plan.reason;
    const iban: string | undefined = plan.iban;
    const invoiceNote: string | undefined = plan.invoiceNote;
    // @ts-expect-error `reason` is only visible when `plan` is "other"
    const reasonDefined: string = plan.reason;
    // @ts-expect-error `iban` is on a step only visible when `plan` is "paid"
    const ibanDefined: string = plan.iban;
    // @ts-expect-error `invoiceNote` is in a section only visible when `plan` is "paid"
    const invoiceNoteDefined: string = plan.invoiceNote;
    void [always, note, reason, iban, invoiceNote, reasonDefined, ibanDefined, invoiceNoteDefined];

    defineWizard({
        id: "broken",
        version: 1,
        steps: [
            {
                id: "step",
                label: "label.step",
                // @ts-expect-error `color` is not a registered Wizard Field Type
                sections: [{ id: "section", fields: [{ id: "field", type: "color", label: "label.field" }] }],
            },
        ],
    } as const);
}
