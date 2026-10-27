# Components

The shared React component library of the frontend apps. Its domain language is the Wizard engine (`lib/wizard`); decisions in `docs/adr/0003-wizards-are-pure-data.md` and `docs/adr/0004-wizard-secrets-are-write-only.md`.

## Language

### Wizards

**Wizard**:
The definition of a guided flow through which a user completes one task, such as providing data or applying settings. It collects input across Wizard Steps and commits it all at once at the end.
_Avoid_: Assistant, flow, form

**Wizard Run**:
One concrete filling-in of a Wizard: its entered values, progress and outcome.
_Avoid_: Wizard instance, session, draft

**Wizard Step**:
One page of a Wizard; the user can move back and forth between Wizard Steps.
_Avoid_: Page, stage

**Review Step**:
The final Wizard Step that shows all entered values for confirmation before the Wizard Run is submitted; added automatically unless the Wizard opts out.
_Avoid_: Summary, confirmation page

**Wizard Section**:
A titled group of Wizard Fields within a Wizard Step.
_Avoid_: Form part, fieldset, group

**Wizard Field**:
A single input within a Wizard Section, whose kind (text, password, phone, ...) is given by its Wizard Field Type.
_Avoid_: Input, control

**Wizard Field Type**:
The named kind of a Wizard Field, determining how it is entered and what value it yields; the library ships standard ones, an app registers its own on top.
_Avoid_: Input type, widget

**Hidden**:
A Wizard Step, Wizard Section or Wizard Field is hidden while an earlier answer in the Wizard Run excludes it; a hidden one is skipped, and its values are not submitted. Describes visibility only, never the masking of a Secret.
_Avoid_: Disabled, inactive, conditional (as a state)

**Secret**:
A value a user provides (password, API key, ...) that, once stored, is never shown again; it can only be replaced. A Wizard Field whose Wizard Field Type marks it as a Secret is masked in the Review Step.
_Avoid_: Credential, sensitive field, hidden value
