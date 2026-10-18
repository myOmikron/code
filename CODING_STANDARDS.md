# Coding Standards

The rules a review holds every change to. Rules marked _(checked)_ are enforced by
tooling; the rest are judgement calls the reviewer applies. Existing code that
predates a rule stays as it is until a change touches it.

## Prose in code

- **Comments**: code carries its own meaning. Write doc comments (Rust `//!` per
  module and `///` per public item, JSDoc on exported TS symbols), short. Reasons
  behind a change go in the commit message or the PR, not into inline `//`, `/* */`,
  `{/* */}` or `#` comments, in source and config/CI files alike, whatever the
  surrounding comment density.
- **Dashes**: separate clauses with a comma, colon, semicolon, parentheses or a
  second sentence. This covers UI strings, comments and doc comments; the em dash (—)
  and the parenthetical en dash (–) are out. Number ranges keep the en dash ("5–20 €").

## Rust

- **Docs**: services set `#![warn(missing_docs)]`; `just doc` fails on broken
  intra-doc links _(checked)_.
- **Transactions**: every rorm transaction is resolved explicitly on every path:
  `commit` on success and on read-only paths, `rollback` before an early `Ok(..)`
  that discards the writes. No `ast-grep-ignore` _(checked: `uncommitted-transaction*`
  in `.ast-grep/rules/`)_.
- **Output**: long-running code logs through `tracing`. One-shot cli subcommands may
  print their result for the operator (an invite link, a sync report) with `println!`,
  and config errors before tracing init go to `eprintln!`.
- **Panics**: "panic anywhere -> restart". Let a panic reach `service-bootstrap`'s
  hook; never catch one to keep the process alive.

### HTTP API

- Auth lives in the route groups' middleware (`AuthRequiredLayer`, role layers),
  never in per-handler checks.
- Schemas derive `Serialize`/`Deserialize` + `JsonSchema` (via
  `galvyn::core::re_exports::schemars`). Every inbound string is bounded with
  `MaxStr<N>`; timestamps are `SchemaDateTime`/`SchemaDate`.
- `MaxStr<N>` counts bytes. Cut a string to fit on a char boundary within N bytes,
  never by `chars().take(N)`.
- Handler function names are OpenAPI operation ids: unique across the service.

### NATS and Proto

- Subjects come from `libs/nats-subjects`; a string literal subject is a finding.
- Metadata (correlation-id, source) travels in NATS headers, not in the proto payload.
- Proto types become validated domain types through `o2o`.
- Datetimes are unix timestamps (`int64`) with a doc comment;
  `google.protobuf.Timestamp` only where sub-second precision matters.

## Frontend

- **Styling**: Tailwind utilities only. Raw CSS is kept to what utilities cannot
  express (`@keyframes`, SVG dash animation, `env(safe-area-inset-*)`) and lives in
  the Tailwind entry file; a new stylesheet or a grown one is a finding.
- **Dark mode**: text goes through `Text`, `Strong`, `Subheading`, `Description`,
  `Badge` from `components`. A raw element with a colour class carries its `dark:`
  twin (`text-zinc-500 dark:text-zinc-400`, `border-zinc-950/10 dark:border-white/10`).
- **Dropdowns**: `Listbox`/`ListboxOption`/`ListboxLabel` from `components`; it is
  generic over its value, where `Select` yields a string that every call site casts.
  A `<Select>` in a touched file gets converted.
- **Route files**: a `.tsx` under `routes/` defines exactly one component, the route
  component. App-local components go in `src/components/`, reusable ones in the
  shared `components` library.
- **Sidebar brand**: the app brand/logo in a sidebar or mobile navbar links to `/`
  with `activeOptions={{ exact: true }}`; pointed at a section, fuzzy matching would
  keep it highlighted throughout that section. Section defaults are chosen by index
  routes and their redirects (`/admin` -> `/admin/items`).

### i18n

- **Keys** _(checked: `just lint-i18n`)_: exactly `category.slug`. The category is
  one of `heading` (headings, dialog titles), `label` (labels, short notes), `button`
  (anything clickable: buttons, links, menu items), `description` (longer text),
  `error`, `toast`, `accessibility` (e.g. `aria-label`). The slug is kebab-case;
  i18next plural suffixes (`label.positions_one`) belong to it.
- **Namespaces** _(checked)_: a component binds at most two. Its page namespace as
  `const [t] = useTranslation("<namespace>")`, and the general one as
  `const [tg] = useTranslation()`. A page string another page needs is promoted to
  the general namespace, never pulled in as a third namespace or via the `ns` option.
- German (`de`) is primary; `en` carries the same keys (`scripts/translation_scanner.py`).

## mtg

- **Scaling**: mtg is built for ~1M users, and the reference account holds ~20,000
  copies. No hot query touches more rows than it returns: "how many do I own" comes
  from the `collection_stock` rollup (`migrations/0026`-`0028`), hot indexes lead
  with `owner`, and match predicates are sargable alternatives (a `CASE` over a
  switch hides the index and scans). Known debt on the old pattern:
  `read_candidates` in deck sourcing, the collection summaries, the global card tag
  match in `collection/listing.rs`.
- **Wording**: the thing cards live in is a collection (de: Sammlung), in UI strings,
  identifiers and doc comments. The icon slug `"box"`, `ArchiveBoxIcon` and CSS/layout
  boxes keep their names.
- **Switches**: every `Switch` gets `color={"blue"}`.
