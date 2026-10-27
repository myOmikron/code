import type { JsonValue, WizardDefinition, WizardSecretValue, WizardUnchangedSecret } from "./definition";
import { toLoadedValue } from "./secret";

/** Identifies the Wizard a Wizard Run belongs to */
export type WizardRunKey = {
    /** The Wizard's ID */
    wizardId: string;
    /** The Wizard's version */
    version: number;
};

/**
 * The key of a Wizard's runs
 *
 * @param definition The Wizard (only `id` and `version` are used)
 * @returns The key
 */
export function wizardRunKey(definition: Pick<WizardDefinition, "id" | "version">): WizardRunKey {
    return { wizardId: definition.id, version: definition.version };
}

/** A field value that is not a Secret, as saved and loaded */
export type WizardPlainStoredValue = {
    /** The value */
    value: JsonValue;
    /** Not a Secret */
    secret: false;
};

/**
 * A field value as `save` receives it, with its Secret flag (ADR-0004).
 *
 * A Secret is either newly entered (protect and keep its value) or unchanged (keep the stored one).
 */
export type WizardStoredValue =
    | WizardPlainStoredValue
    | {
          /** The Secret */
          value: WizardSecretValue<JsonValue>;
          /** A Secret, so a persisting store must protect it */
          secret: true;
      };

/**
 * A field value as `load` hands it back: a stored Secret only ever as `unchanged`, never its value
 * (ADR-0004). A Secret that is not set is left out.
 */
export type WizardLoadedValue =
    | WizardPlainStoredValue
    | {
          /** The Secret is set; its value stays in storage */
          value: WizardUnchangedSecret;
          /** A Secret */
          secret: true;
      };

/** The persistable state of a Wizard Run, as `save` receives it */
export type WizardRunState = {
    /** Values by field ID */
    values: Record<string, WizardStoredValue>;
    /** IDs of the Wizard Steps the user has completed */
    completedSteps: Array<string>;
    /** ID of the current Wizard Step */
    currentStep: string;
};

/** The state of a Wizard Run as `load` hands it back, without any Secret's value */
export type WizardLoadedRunState = Omit<WizardRunState, "values"> & {
    /** Values by field ID */
    values: Record<string, WizardLoadedValue>;
};

/** Where Wizard Runs are kept; swap the implementation to persist them */
export type WizardRunStore = {
    /** Load a Wizard Run, `undefined` if there is none yet */
    load: (key: WizardRunKey) => Promise<WizardLoadedRunState | undefined>;
    /** Save a Wizard Run, replacing the previous state */
    save: (key: WizardRunKey, state: WizardRunState) => Promise<void>;
};

/**
 * A store keeping Wizard Runs in memory, lost on reload.
 *
 * It keeps no Secret values: a newly entered Secret isn't retained, it is kept only as set and reloads as
 * `unchanged`, so whoever resolves `unchanged` against this store finds nothing.
 *
 * @returns A new, empty store
 */
export function createInMemoryWizardRunStore(): WizardRunStore {
    const runs = new Map<string, WizardLoadedRunState>();
    /**
     * The map key of a Wizard Run
     *
     * @param key The Wizard Run's key
     * @returns `<wizardId>@<version>`
     */
    const id = (key: WizardRunKey) => `${key.wizardId}@${key.version}`;
    return {
        /** @inheritdoc */
        load: async (key) => {
            const state = runs.get(id(key));
            return state && structuredClone(state);
        },
        /** @inheritdoc */
        save: async (key, state) => {
            const values: Record<string, WizardLoadedValue> = {};
            for (const [fieldId, stored] of Object.entries(state.values)) {
                const loaded = toLoadedValue(stored);
                if (loaded) values[fieldId] = loaded;
            }
            runs.set(id(key), structuredClone({ ...state, values }));
        },
    };
}
