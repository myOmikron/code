# Wizard Secrets are write-only

Once stored, a Secret entered in a Wizard is never sent back to the frontend; it can only be replaced. Wizard Runs can be kept in a run store (`WizardRunStore`) so a user can continue later, which means Secrets such as passwords and API keys get stored rather than forwarded once.

- A Wizard Field Type declares whether its value is a Secret. The run store receives Secret values together with that flag, so a persisting store can treat them accordingly (encrypted, in a vault, forwarded directly); how is up to the store.
- In a Wizard Run, a Secret field's value is either newly entered (it carries the value) or already set and unchanged (it carries none). `onSubmit` handles both.
- The UI shows a stored Secret as "set" with a "Replace" action; the Review Step only shows "set" or "not set".

Stored Secrets can't leak back through the frontend, not even to the person who entered them. In return nobody can check a stored Secret by looking at it, they re-enter it when in doubt, and submit handlers and backends resolve unchanged Secrets from their storage themselves instead of receiving every value in the submit payload.

## Considered Options

- Loading stored Secrets back into the form like any other value: simplest, but every page that resumes a Wizard Run would hold the plain Secret.
