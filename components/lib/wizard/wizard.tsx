import { useForm, useStore } from "@tanstack/react-form";
import { ArrowRightIcon, CheckIcon } from "@heroicons/react/20/solid";
import { type ReactNode, use, useEffect, useRef, useState } from "react";
import { useLatest } from "./use-latest";
import { useTranslation } from "react-i18next";
import { Button } from "../components/base/button";
import { FieldGroup, Fieldset, Legend } from "../components/base/fieldset";
import { motion, useReducedMotion } from "motion/react";
import { type Step } from "../components/base/step-bar";
import { Text } from "../components/base/text";
import {
    type WizardDefinition,
    type WizardFieldDefinition,
    type WizardFieldsOf,
    type WizardStepDefinition,
    type WizardValues,
    WIZARD_REVIEW_STEP_ID,
    stepFields,
    mapFields,
    wizardNamespace,
    wizardStepIds,
} from "./definition";
import {
    type AnyWizardFieldType,
    type WizardFieldTypeRegistry,
    useWizardFieldTypes,
    useWizardAccent,
    useWizardIcons,
} from "./field-types";
import { type WizardMessage, validateWizardField } from "./rules";
import {
    type WizardLoadedRunState,
    type WizardRunKey,
    type WizardRunStore,
    createInMemoryWizardRunStore,
    wizardRunKey,
} from "./store";
import { initialFieldValue, isUnchangedSecret, toStoredValue, unchangedSecret } from "./secret";
import { validateWizardDefinition } from "./validation";
import { visibleSteps } from "./visibility";
import { WizardDefinitionErrors } from "./wizard-definition-errors";
import { WizardField } from "./wizard-field";
import { WizardReview } from "./wizard-review";
import WizardStageLayout from "./wizard-stage-layout";

/**
 * An error the backend reported for a submitted Wizard Run: an i18n-able message, tied to a field or general
 */
export type WizardSubmitError<D extends WizardDefinition = WizardDefinition> = WizardMessage & {
    /** ID of the affected Wizard Field; a general error when `undefined` */
    field?: WizardFieldsOf<D>["id"];
};

/** The result of a Wizard's `onSubmit` */
export type WizardSubmitResult<D extends WizardDefinition = WizardDefinition> =
    | {
          /** The submit succeeded */
          ok: true;
      }
    | {
          /** The backend rejected the Wizard Run */
          ok: false;
          /** What needs fixing */
          errors: Array<WizardSubmitError<D>>;
      };

/** The submit errors of a Wizard Run, split by where they are shown */
type SubmitErrors = {
    /** Errors per field ID */
    fields: Record<string, Array<WizardMessage>>;
    /** Errors not tied to a field, shown on the step submit happens on */
    general: Array<WizardMessage>;
};

/**
 * No submit errors
 *
 * @returns An empty {@link SubmitErrors}
 */
function noSubmitErrors(): SubmitErrors {
    return { fields: {}, general: [] };
}

/** How a Wizard reports a step change */
export type WizardStepChangeOptions = {
    /**
     * `true` when the Wizard corrected or restored the step on its own (redirect or resume),
     * so the route should replace the history entry instead of pushing one
     */
    replace: boolean;
};

/** How long typing has to pause before a field is validated, in ms */
const VALIDATION_DEBOUNCE_MS = 400;

/** A screen shown before or after the Wizard Steps, with already translated texts */
export type WizardScreen = {
    /** The screen's title */
    heading: string;
    /** A sentence or two below it */
    description: string;
    /** Label of the button leaving the screen */
    button: string;
};

/** What a Wizard shows: the greeting, the steps, or the confirmation after submit */
export type WizardScreenKind = "greeting" | "steps" | "done";

/** The parts of a Wizard that a {@link WizardProps.layout} arranges */
export type WizardLayoutParts = {
    /** What is shown right now */
    screen: WizardScreenKind;
    /** Every step with its state, for a {@link StepBar} */
    steps: Array<Step>;
    /** Translated label of the current step, or the heading of the greeting or done screen */
    title: string;
    /** Shown above the title, e.g. the check on the done screen */
    badge?: ReactNode;
    /** The current step's fields (or the review) with the navigation buttons, or the screen's text and button */
    form: ReactNode;
};

/**
 * The properties for {@link Wizard}
 *
 * The Wizard suspends while its i18n namespace and the Wizard Run load, so render it inside a `<Suspense>` boundary.
 */
export type WizardProps<D extends WizardDefinition> = {
    /** The Wizard to run */
    definition: D;
    /**
     * ID of the current Wizard Step. When `undefined`, the loaded Wizard Run's saved step (reported via `onStepChange`)
     * or the first step. An unknown or hidden step, or one whose predecessors aren't completed, is redirected to the
     * first incomplete visible step via `onStepChange`.
     */
    step: string | undefined;
    /** Called when the user moves to another Wizard Step, or the Wizard redirects or resumes one */
    onStepChange: (step: string, options: WizardStepChangeOptions) => void;
    /** Commits the Wizard Run */
    onSubmit: (values: WizardValues<D>) => Promise<WizardSubmitResult<D>>;
    /** Called after a successful submit, or when the user leaves the {@link WizardProps.done} screen */
    onDone: () => void;
    /** The page's title, shown on the brand panel of the default layout */
    heading?: string;
    /** A sentence below the title */
    description?: string;
    /** Shown before the first step of a Wizard Run that has no completed step yet and no requested step */
    greeting?: WizardScreen;
    /** Shown after a successful submit; without it, `onDone` is called right away */
    done?: WizardScreen;
    /** Where the Wizard Run is kept, read once on mount; a fresh in-memory store by default */
    store?: WizardRunStore;
    /**
     * Renders a guard against leaving the Wizard, e.g. `BlockUnsavedChanges`
     *
     * @param dirty Whether values were changed since the Wizard Run was loaded and not submitted yet.
     *   A resumed Wizard Run counts as clean until it is edited, as its saved values are kept by the store.
     */
    unsavedChangesGuard?: (dirty: boolean) => ReactNode;
    /**
     * Arranges the steps, title and form; by default a {@link WizardStageLayout} filling the page
     *
     * @param parts What to arrange
     */
    layout?: (parts: WizardLayoutParts) => ReactNode;
};

/**
 * Runs a Wizard: shows its steps beside a StepBar and collects the values until submit.
 *
 * Controlled and router-agnostic: the current step comes from `step` and changes go through `onStepChange`.
 * The definition is validated first; an invalid one renders an error page listing every problem instead.
 * Suspends until its i18n namespace and the Wizard Run have loaded (see {@link WizardProps}).
 */
export function Wizard<D extends WizardDefinition>(props: WizardProps<D>) {
    const { definition } = props;
    const { id, version } = definition;
    const i18nNamespace = wizardNamespace(id);
    const { i18n } = useTranslation(i18nNamespace);
    const fieldTypes = useWizardFieldTypes();
    const icons = useWizardIcons();
    const errors = validateWizardDefinition(definition, {
        fieldTypes,
        icons,
        hasTranslation: (key) => i18n.exists(key, { ns: i18nNamespace }),
    });
    const [source] = useState(() =>
        props.store ? { store: props.store, fresh: false } : { store: createInMemoryWizardRunStore(), fresh: true },
    );
    const key = wizardRunKey({ id, version });
    const runId = `${id}@${version}`;

    const [held, setHeld] = useState(() => ({ runId, promise: loadWizardRun(source.store, key) }));
    let promise = held.promise;
    if (held.runId !== runId) {
        promise = loadWizardRun(source.store, key);
        setHeld({ runId, promise });
    }

    useEffect(() => forgetWizardRun(source.store, promise), [source.store, promise]);

    if (errors.length > 0) return <WizardDefinitionErrors wizardId={id} errors={errors} />;
    const initial = source.fresh ? undefined : use(promise);
    return <WizardRun key={runId} {...props} store={source.store} initial={initial} />;
}

/** Loads not yet held by a mounted Wizard, by store and Wizard Run */
const pendingLoads = new WeakMap<WizardRunStore, Map<string, Promise<WizardLoadedRunState | undefined>>>();

/**
 * Load a Wizard Run, reusing a load that is still pending for the same store and key
 *
 * A Wizard suspending before its first mount loses its state, so the promise has to outlive it.
 *
 * @param store The store to load from
 * @param key The Wizard Run's key
 * @returns The (shared) load
 */
function loadWizardRun(store: WizardRunStore, key: WizardRunKey) {
    let loads = pendingLoads.get(store);
    if (loads === undefined) {
        loads = new Map();
        pendingLoads.set(store, loads);
    }
    const id = `${key.wizardId}@${key.version}`;
    let load = loads.get(id);
    if (load === undefined) {
        load = store.load(key);
        loads.set(id, load);
    }
    return load;
}

/**
 * Drop a load from {@link pendingLoads} once a mounted Wizard holds it
 *
 * @param store The store it was loaded from
 * @param promise The load
 */
function forgetWizardRun(store: WizardRunStore, promise: Promise<WizardLoadedRunState | undefined>) {
    const loads = pendingLoads.get(store);
    if (loads === undefined) return;
    for (const [id, load] of loads) {
        if (load === promise) loads.delete(id);
    }
}

/**
 * The properties for {@link WizardRun}
 */
type WizardRunProps<D extends WizardDefinition> = WizardProps<D> & {
    /** The store to save to */
    store: WizardRunStore;
    /** The state loaded from the store, `undefined` for a new Wizard Run */
    initial: WizardLoadedRunState | undefined;
};

/**
 * One Wizard Run of a Wizard, backed by one TanStack Form instance
 */
function WizardRun<D extends WizardDefinition>(props: WizardRunProps<D>) {
    const { definition, store } = props;
    const [t] = useTranslation(wizardNamespace(definition.id));
    const [tg, i18n] = useTranslation();
    const reducedMotion = useReducedMotion();
    const fieldI18n = { t, tg, language: i18n.language };
    const registry = useWizardFieldTypes();
    const icons = useWizardIcons();
    const accent = useWizardAccent();

    const [busy, setBusy] = useState(false);
    const [submitErrors, setSubmitErrors] = useState<SubmitErrors>(noSubmitErrors);
    const busyRef = useRef(false);
    const [revalidate, setRevalidate] = useState<string | null>(null);
    const attempted = useRef(new Set<string>());

    const [defaultValues] = useState(() => initialValues(definition, registry, props.initial));
    const form = useForm({ defaultValues });
    const changed = useStore(form.store, (state) => state.isDirty);
    const [submitted, setSubmitted] = useState(false);
    const dirty = changed && !submitted;

    const [greeting, setGreeting] = useState(
        () => props.greeting !== undefined && props.step === undefined && !props.initial?.completedSteps.length,
    );
    const screen: WizardScreenKind = greeting ? "greeting" : submitted && props.done ? "done" : "steps";

    const onDone = useLatest(props.onDone);
    const hasDoneScreen = props.done !== undefined;
    useEffect(() => {
        if (submitted && !hasDoneScreen) onDone.current();
    }, [submitted]);

    const values = useStore(form.store, (state) => state.values);
    const steps = visibleSteps(definition, values);

    const [completedWith, setCompletedWith] = useState<ReadonlyMap<string, string>>(() => {
        const loaded = new Map(visibleSteps(definition, defaultValues).map((s) => [s.id, fieldSignature(s)]));
        return new Map(
            (props.initial?.completedSteps ?? []).flatMap((id) => {
                const signature = loaded.get(id);
                return signature === undefined ? [] : [[id, signature] as const];
            }),
        );
    });
    const current = new Map(steps.map((s) => [s.id, fieldSignature(s)]));
    const completed = [...completedWith]
        .filter(([id, signature]) => (current.get(id) ?? signature) === signature)
        .map(([id]) => id);

    const stepIds = wizardStepIds({ ...definition, steps });
    const stepsById = new Map(steps.map((s) => [s.id, s]));
    const reachable = firstIncompleteIndex(stepIds, completed);
    const resumed = props.step === undefined ? props.initial?.currentStep : undefined;
    const requested = props.step ?? resumed;
    const requestedIndex = requested === undefined ? 0 : stepIds.indexOf(requested);
    const redirected = requestedIndex === -1 || requestedIndex > reachable;
    const stepIndex = redirected ? reachable : requestedIndex;
    const stepId = stepIds[stepIndex];
    const isReview = stepId === WIZARD_REVIEW_STEP_ID;
    /**
     * Whether submit happens on a step: the Review Step, or the last Wizard Step without one
     *
     * @param index The step's index, in {@link wizardStepIds}
     * @returns `true` for the last step
     */
    const isSubmitStep = (index: number) => index === stepIds.length - 1;
    const isLast = isSubmitStep(stepIndex);
    const step = isReview ? undefined : stepsById.get(stepId);
    const currentFields = step ? stepFields(step) : [];
    const currentStepRef = useRef(stepId);
    currentStepRef.current = stepId;

    /**
     * Label and description of a step for the StepBar
     *
     * @param id The step's ID
     * @returns The translated label and optional description
     */
    const describeStep = (id: string) => {
        const s = stepsById.get(id);
        if (id === WIZARD_REVIEW_STEP_ID || !s) return { label: tg("label.review") };
        return { label: t(s.label), description: s.description && t(s.description) };
    };

    const stepToReport = !greeting && (redirected || resumed !== undefined) ? stepId : undefined;
    const onStepChange = useLatest(props.onStepChange);
    useEffect(() => {
        if (stepToReport !== undefined) onStepChange.current(stepToReport, { replace: true });
    }, [stepToReport]);

    /**
     * Validate every field of the current step, showing the errors
     *
     * @returns Whether all of them are valid
     */
    const validateStep = async () => {
        attempted.current.add(stepId);
        const results = await Promise.all(currentFields.map((f) => form.validateField(f.id, "submit")));
        return results.every((errors) => toFieldErrors(errors).length === 0);
    };

    useEffect(() => {
        if (revalidate !== null && revalidate === stepId) {
            setRevalidate(null);
            validateStep();
        }
    }, [revalidate, stepId]);

    /**
     * The first step with an invalid field, checked against the current values
     *
     * @returns The step's ID, `undefined` when every step is valid
     */
    const firstInvalidStep = async () => {
        for (const s of visibleSteps(definition, form.state.values)) {
            if (!(await isStepValid(s))) return s.id;
        }
        return undefined;
    };

    /**
     * Check a step against the current values without showing errors
     *
     * @param s The step
     * @returns Whether all of its fields are valid
     */
    const isStepValid = async (s: WizardStepDefinition) => {
        const errors = await Promise.all(
            stepFields(s).map((f) => validateWizardField(f, lookup(registry, f), form.state.values[f.id])),
        );
        return errors.every((e) => e.length === 0);
    };

    /**
     * Save the Wizard Run through the store
     *
     * Called before a navigation is reported, with the step being navigated to as `currentStep`,
     * so a reload resumes where the user just went.
     *
     * @param run The Wizard Run's progress
     * @param run.completedSteps The completed steps
     * @param run.currentStep The step the user continues on, i.e. the navigation's target
     * @returns The store's promise
     */
    const save = ({ completedSteps, currentStep }: { completedSteps: ReadonlyArray<string>; currentStep: string }) =>
        store.save(wizardRunKey(definition), {
            values: mapFields(definition, (f) => toStoredValue(lookup(registry, f), form.state.values[f.id])),
            completedSteps: [...completedSteps],
            currentStep,
        });

    /**
     * Validate the current step, mark it completed and save the Wizard Run
     *
     * @param currentStep The step the user continues on
     * @returns The completed steps including the current one, `undefined` if the step was invalid
     */
    const complete = async (currentStep: string) => {
        if (!(await validateStep())) return undefined;
        const completedSteps = completed.includes(stepId) ? completed : [...completed, stepId];
        if (step) setCompletedWith((before) => new Map(before).set(step.id, fieldSignature(step)));
        await save({ completedSteps, currentStep });
        return completedSteps;
    };

    /**
     * Go to another step: backwards always, forwards only if the current step is valid.
     *
     * Leaving a step backwards in an invalid state un-completes it, so completed steps stay valid
     * and the StepBar can't jump past it. Callers only offer targets up to the first incomplete step.
     *
     * @param targetIndex The index of the step to go to, in {@link wizardStepIds}
     */
    const goTo = async (targetIndex: number) => {
        const target = stepIds[targetIndex];
        if (targetIndex < stepIndex) {
            const valid = step === undefined || (await isStepValid(step));
            const completedSteps = valid ? completed : completed.filter((id) => id !== stepId);
            if (!valid) {
                setCompletedWith((before) => {
                    const after = new Map(before);
                    after.delete(stepId);
                    return after;
                });
            }
            await save({ completedSteps, currentStep: target });
            props.onStepChange(target, { replace: false });
            return;
        }
        if (await complete(target)) props.onStepChange(target, { replace: false });
    };

    /**
     * Submit the Wizard Run if every step is valid, otherwise jump to the first invalid one.
     * Afterwards take the user to what the backend rejected.
     *
     * The Review Step is never recorded as completed: it has no values, and nothing is submitted yet.
     */
    const submit = async () => {
        const completedSteps = isReview ? completed : await complete(stepId);
        if (!completedSteps) return;
        const invalid = await firstInvalidStep();
        if (invalid !== undefined) {
            setRevalidate(invalid);
            props.onStepChange(invalid, { replace: false });
            return;
        }
        setSubmitErrors(noSubmitErrors());
        const submitting = form.state.values;
        const visible = { ...definition, steps: visibleSteps(definition, submitting) };
        const result = await props.onSubmit(mapFields(visible, (f) => submitting[f.id]) as WizardValues<D>);
        if (result.ok) {
            setSubmitted(true);
            return;
        }

        const errors = splitSubmitErrors(visible.steps, result.errors);
        setSubmitErrors(errors);
        const target = visible.steps.find((s) => stepFields(s).some((f) => f.id in errors.fields));
        if (target && target.id !== currentStepRef.current) {
            await save({ completedSteps, currentStep: target.id });
            props.onStepChange(target.id, { replace: false });
        }
    };

    /**
     * Forget the submit errors of a field, e.g. because its value changed
     *
     * @param fieldId The field's ID
     */
    const clearSubmitErrors = (fieldId: string) => {
        setSubmitErrors((prev) => {
            if (!(fieldId in prev.fields)) return prev;
            const fields = { ...prev.fields };
            delete fields[fieldId];
            return { ...prev, fields };
        });
    };

    /**
     * Whether a step contains submit errors; general errors belong to the step submit happens on
     *
     * @param id The step's ID
     * @param index The step's index, in {@link wizardStepIds}
     * @returns `true` if the user has something to fix there
     */
    const hasSubmitErrors = (id: string, index: number) => {
        const s = stepsById.get(id);
        if (s && stepFields(s).some((f) => f.id in submitErrors.fields)) return true;
        return isSubmitStep(index) && submitErrors.general.length > 0;
    };

    /**
     * Translate a Wizard Message
     *
     * @param message The message
     * @returns The translated text
     */
    const translate = (message: WizardMessage) =>
        message.namespace === "wizard" ? t(message.key, message.values) : tg(message.key, message.values);

    /**
     * Run a navigation action, disabling the Wizard meanwhile; ignored while another one is running
     *
     * @param action The action
     */
    const whileBusy = async (action: () => Promise<void>) => {
        if (busyRef.current) return;
        busyRef.current = true;
        setBusy(true);
        try {
            await action();
        } finally {
            busyRef.current = false;
            setBusy(false);
        }
    };

    const stepBarSteps: Array<Step> = stepIds.map((id, index) => ({
        id,
        ...describeStep(id),
        state:
            id === stepId
                ? "active"
                : hasSubmitErrors(id, index)
                  ? "error"
                  : completed.includes(id)
                    ? "finished"
                    : "pending",
        onSelect: index !== stepIndex && index <= reachable && !busy ? () => whileBusy(() => goTo(index)) : undefined,
    }));
    const title = isReview ? tg("heading.review") : describeStep(stepId).label;

    const stepForm = (
        <form
            className={"flex flex-col gap-8"}
            onSubmit={(e) => {
                e.preventDefault();
                whileBusy(isLast ? submit : () => goTo(stepIndex + 1));
            }}
        >
            <motion.div
                key={stepId}
                className={"flex flex-col gap-10"}
                initial={reducedMotion ? false : { opacity: 0.4, y: 12, filter: "blur(3px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            >
                {isReview && (
                    <WizardReview
                        steps={steps.map((s) => ({
                            step: s,
                            fields: stepFields(s).map((field) => ({
                                field,
                                fieldType: lookup(registry, field),
                                value: form.state.values[field.id],
                            })),
                        }))}
                        onEdit={(target) => whileBusy(() => goTo(stepIds.indexOf(target)))}
                        disabled={busy}
                        i18n={fieldI18n}
                    />
                )}
                {step?.sections.map((section) => (
                    <Fieldset
                        key={section.id}
                        className={"border-zinc-950/5 not-first:border-t not-first:pt-10 dark:border-white/5"}
                    >
                        {section.label && <Legend>{t(section.label)}</Legend>}
                        {section.description && <Text>{t(section.description)}</Text>}
                        <FieldGroup className={"space-y-6!"}>
                            {section.fields.map((field) => {
                                const fieldType = lookup(registry, field);
                                return (
                                    <form.Field
                                        key={field.id}
                                        name={field.id}
                                        validators={{
                                            onChangeAsyncDebounceMs: VALIDATION_DEBOUNCE_MS,
                                            onChangeAsync: async ({ value }) => {
                                                if (fieldType.deferValidation && !attempted.current.has(stepId)) {
                                                    return undefined;
                                                }
                                                const errors = await validateWizardField(field, fieldType, value);
                                                return errors.length > 0 ? errors : undefined;
                                            },
                                        }}
                                    >
                                        {(fieldApi) => (
                                            <WizardField
                                                field={field}
                                                fieldType={fieldType}
                                                value={fieldApi.state.value}
                                                onChange={(value) => {
                                                    clearSubmitErrors(field.id);
                                                    fieldApi.handleChange(value);
                                                }}
                                                onCancelReplace={
                                                    isUnchangedSecret(fieldType, defaultValues[field.id])
                                                        ? () => fieldApi.handleChange(unchangedSecret())
                                                        : undefined
                                                }
                                                errors={[
                                                    ...toFieldErrors(fieldApi.state.meta.errors),
                                                    ...(submitErrors.fields[field.id] ?? []),
                                                ].map(translate)}
                                                disabled={busy}
                                                i18n={fieldI18n}
                                                icons={icons}
                                            />
                                        )}
                                    </form.Field>
                                );
                            })}
                        </FieldGroup>
                    </Fieldset>
                ))}

                {isLast &&
                    submitErrors.general.map((error, index) => (
                        <Text
                            key={`${index}:${error.namespace}:${error.key}`}
                            role={"alert"}
                            className={"text-red-600! dark:text-red-500!"}
                        >
                            {translate(error)}
                        </Text>
                    ))}
            </motion.div>

            <div className={"flex justify-between gap-4"}>
                {stepIndex > 0 ? (
                    <Button plain={true} disabled={busy} onClick={() => whileBusy(() => goTo(stepIndex - 1))}>
                        {tg("button.back")}
                    </Button>
                ) : (
                    <span />
                )}
                <Button color={accent} type={"submit"} disabled={busy}>
                    {isLast ? tg("button.submit") : tg("button.next")}
                </Button>
            </div>
        </form>
    );

    const ease = [0.16, 1, 0.3, 1] as const;
    /** Eases in from an already visible state, like each step */
    const screenMotion = {
        initial: reducedMotion ? false : { opacity: 0.4, y: 16, filter: "blur(4px)" },
        animate: { opacity: 1, y: 0, filter: "blur(0px)" },
        transition: { duration: 0.6, ease },
    };

    /**
     * The text and button of the greeting or done screen
     *
     * @param content The screen's texts
     * @param onLeave Called by its button
     * @returns The screen's body
     */
    const screenBody = (content: WizardScreen, onLeave: () => void) => (
        <motion.div className={"flex flex-col items-start gap-8"} {...screenMotion}>
            <Text className={"max-w-prose text-base/7!"}>{content.description}</Text>
            <Button color={accent} onClick={onLeave}>
                {content.button}
                <ArrowRightIcon data-slot={"icon"} />
            </Button>
        </motion.div>
    );

    const stage = screen === "greeting" ? props.greeting : screen === "done" ? props.done : undefined;

    /**
     * Leave the greeting for the first step, or the done screen for whatever follows the Wizard
     */
    const leaveScreen = () => {
        if (greeting) setGreeting(false);
        else onDone.current();
    };

    const parts: WizardLayoutParts =
        screen === "greeting" && props.greeting
            ? {
                  screen,
                  steps: stepBarSteps,
                  title: props.greeting.heading,
                  form: screenBody(props.greeting, leaveScreen),
              }
            : screen === "done" && props.done
              ? {
                    screen,
                    steps: stepBarSteps.map((s) => ({ ...s, state: "finished" as const, onSelect: undefined })),
                    title: props.done.heading,
                    badge: (
                        <motion.span
                            className={
                                "flex size-14 items-center justify-center rounded-full bg-(--color-brand-600) text-white shadow-(--color-brand-600)/50 shadow-[0_8px_24px_-6px]"
                            }
                            initial={reducedMotion ? false : { scale: 0.6, rotate: -12 }}
                            animate={{ scale: 1, rotate: 0 }}
                            transition={{ type: "spring", stiffness: 260, damping: 16 }}
                        >
                            <CheckIcon className={"size-7"} aria-hidden={"true"} />
                        </motion.span>
                    ),
                    form: screenBody(props.done, leaveScreen),
                }
              : { screen: "steps", steps: stepBarSteps, title, form: stepForm };

    return (
        <>
            {props.unsavedChangesGuard?.(dirty)}
            {props.layout ? (
                props.layout(parts)
            ) : (
                <WizardStageLayout
                    parts={parts}
                    heading={props.heading}
                    description={props.description}
                    screen={stage}
                    onLeaveScreen={leaveScreen}
                />
            )}
        </>
    );
}

/**
 * The index of the first step that is not completed
 *
 * The Review Step is never completed, so once every Wizard Step is, it is the Review Step's.
 *
 * @param stepIds The IDs of every step, see {@link wizardStepIds}
 * @param completed The completed steps
 * @returns The index, or the last step's if all are completed
 */
function firstIncompleteIndex(stepIds: ReadonlyArray<string>, completed: ReadonlyArray<string>): number {
    const index = stepIds.findIndex((id) => !completed.includes(id));
    return index === -1 ? stepIds.length - 1 : index;
}

/**
 * The Field Type of a field; the definition was validated, so it exists
 *
 * @param registry The Field Type registry
 * @param field The field
 * @returns The field's type
 */
function lookup(registry: WizardFieldTypeRegistry, field: WizardFieldDefinition): AnyWizardFieldType {
    const fieldType = registry[field.type];
    if (!fieldType) throw new Error(`Wizard Field Type "${field.type}" is not registered`);
    return fieldType as AnyWizardFieldType;
}

/**
 * Identifies which fields a visible step shows, to notice when an earlier answer changed them
 *
 * @param step A step as returned by {@link visibleSteps}
 * @returns Its visible field IDs, joined
 */
function fieldSignature(step: WizardStepDefinition): string {
    return stepFields(step)
        .map((f) => f.id)
        .join("\n");
}

/**
 * The values a Wizard Run starts with
 *
 * @param definition The Wizard
 * @param registry The Field Type registry
 * @param initial The state loaded from the store
 * @returns The stored value of every field, or its type's default (as a newly entered Secret for Secrets)
 */
function initialValues(
    definition: WizardDefinition,
    registry: WizardFieldTypeRegistry,
    initial: WizardLoadedRunState | undefined,
): Record<string, unknown> {
    return mapFields(definition, (f) => initialFieldValue(lookup(registry, f), initial?.values[f.id]));
}

/**
 * Split the errors of a rejected submit into field and general errors
 *
 * @param steps The visible steps, see {@link visibleSteps}
 * @param errors The errors `onSubmit` returned
 * @returns The errors per field; errors without a field, or for an unknown or hidden one, are general
 */
function splitSubmitErrors(
    steps: ReadonlyArray<WizardStepDefinition>,
    errors: ReadonlyArray<WizardSubmitError>,
): SubmitErrors {
    const known = new Set(steps.flatMap(stepFields).map((f) => f.id));
    const result = noSubmitErrors();
    for (const { field, ...message } of errors) {
        if (field !== undefined && known.has(field)) {
            (result.fields[field] ??= []).push(message);
        } else {
            result.general.push(message);
        }
    }
    return result;
}

/**
 * The Wizard errors among TanStack Form's field errors
 *
 * @param errors `meta.errors` of a field, one entry per failed validator
 * @returns The flattened {@link WizardMessage}s
 */
function toFieldErrors(errors: ReadonlyArray<unknown>): Array<WizardMessage> {
    return errors.flat().filter((e): e is WizardMessage => typeof e === "object" && e !== null && "key" in e);
}
