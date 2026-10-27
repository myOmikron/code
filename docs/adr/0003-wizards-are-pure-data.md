# Wizards are pure, serializable data

A Wizard definition (`components/lib/wizard`) is pure, JSON-serializable data in a single format, whether it is written in TypeScript or later delivered by a backend as JSON. Behavior is referenced by name, never embedded:

- A Wizard Field names its Wizard Field Type (`"password"`, `"phone"`, an app's own). The type's component, default value, built-in validation, review rendering and Secret flag come from a Field Type registry: the standard types live in `components`, each app registers its own on top (`WizardFieldTypesProvider`).
- Validation beyond the type's own is a fixed declarative vocabulary (`required`, `minLength`/`maxLength`, `min`/`max`, `pattern`), with no cross-field rules.
- Conditional visibility is the declarative `visibleWhen` condition, which may only refer to earlier fields.
- Submit logic is not part of the definition: the route passes `onSubmit` to the `Wizard`.
- Labels and descriptions are i18n keys in one namespace per Wizard (`wizard-<id>`).

Every definition is validated in full before it renders, reporting all errors at once: unknown Field Types, duplicate IDs, forward or cyclic `visibleWhen` references, missing translation keys. For the TypeScript Wizards of an app (`src/wizards/<id>.wizard.ts`) the same validation runs as a vitest test (`testWizardDefinitions` from `components/testing`). `defineWizard` adds static typing on top and infers the values `onSubmit` receives; the runtime format stays the same.

Anything a declarative rule can't express ("test connection", "repeat password") has to become a Wizard Field Type. That friction is deliberate: it keeps the format small, and a JSON Wizard can only use Field Types the frontend has registered, so a new kind of input still needs a frontend release.

## Considered Options

- Embedding validators, `render` callbacks and submit logic in TypeScript definitions: convenient, but JSON can't carry functions, so backend-delivered Wizards would become a restricted second format drifting apart from the first.
