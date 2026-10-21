# Release notes

What each Release of mtg changed for players, shown on the "What's new" page
(`/whats-new`). See the mtg glossary (`services/mtg/GLOSSARY.md`) for *Release*
and *Release note*.

A change players notice (website, scanner or deck advisor) adds one fragment to
`unreleased/` in the same commit as the change. Changes only Admins notice get none.

```yaml
kind: new # new | improved | fixed
de: Deck-Änderungen lassen sich rückgängig machen und wiederholen, auch mit Strg+Z / Strg+Y.
en: Undo and redo deck changes, also with Ctrl+Z / Ctrl+Y.
```

- One file per Release note, named freely (`deck-undo.yaml`). Within one kind the
  page orders notes by file name.
- `kind`, `de` and `en` are required, nothing else is allowed.
- Plain text in the players' words, one or two sentences, no Markdown, no links.
  Quote a text that holds `: ` or starts with a quote.
- `pnpm run release-notes:check` validates every fragment; the frontend CI runs it.

`just release mtg <version>` moves the pending fragments into `<version>/`, writes
its `release.yaml` (version and Release date), commits and creates the signed tag.
Dev builds show the pending fragments as "Unreleased", release builds never do.
