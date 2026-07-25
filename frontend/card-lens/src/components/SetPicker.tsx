import { useMemo, useState } from "react";
import { filterFamilies, groupSetsIntoFamilies } from "../setFamilies";
import type { IndexedSet, SetFamily } from "../setFamilies";

/** Picks which sets the scanner searches. Releases are offered as one entry ("Secrets of
 *  Strixhaven" covers its commander decks, tokens, art series and promos), because that is how a
 *  box of cards actually arrives — but every set code inside stays individually toggleable, since
 *  the grouping is derived from naming conventions and cannot be right for every release. */
export function SetPicker({
  sets,
  initialSelection,
  onCancel,
  onConfirm,
}: {
  sets: IndexedSet[];
  /** Set codes selected on open; empty means nothing chosen yet. */
  initialSelection: string[];
  onCancel: () => void;
  onConfirm: (codes: string[]) => void;
}) {
  const families = useMemo(() => groupSetsIntoFamilies(sets), [sets]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initialSelection.map((c) => c.toUpperCase())));
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const visible = useMemo(() => filterFamilies(families, query), [families, query]);
  const selectedCards = useMemo(
    () => families.reduce(
      (sum, family) => sum + family.sets.reduce((inner, set) => inner + (selected.has(set.code.toUpperCase()) ? set.cardCount : 0), 0),
      0,
    ),
    [families, selected],
  );

  function update(mutate: (next: Set<string>) => void) {
    setSelected((current) => {
      const next = new Set(current);
      mutate(next);
      return next;
    });
  }

  function toggleFamily(family: SetFamily) {
    const codes = family.sets.map((set) => set.code.toUpperCase());
    const allOn = codes.every((code) => selected.has(code));
    update((next) => codes.forEach((code) => (allOn ? next.delete(code) : next.add(code))));
  }

  function toggleSet(code: string) {
    const key = code.toUpperCase();
    update((next) => (next.has(key) ? next.delete(key) : next.add(key)));
  }

  function toggleExpanded(name: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  return (
    <div className="set-picker" role="dialog" aria-label="Sets auswählen">
      <header className="set-picker-head">
        <input
          className="set-picker-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Set oder Code suchen …"
          aria-label="Sets durchsuchen"
        />
        <button className="set-picker-clear" onClick={() => setSelected(new Set())} disabled={selected.size === 0}>
          Auswahl leeren
        </button>
      </header>

      <div className="set-picker-list">
        {visible.length === 0 && <p className="set-picker-empty">Kein Set gefunden.</p>}
        {visible.map((family) => {
          const codes = family.sets.map((set) => set.code.toUpperCase());
          const chosen = codes.filter((code) => selected.has(code)).length;
          const state = chosen === 0 ? "none" : chosen === codes.length ? "all" : "some";
          const isOpen = expanded.has(family.name);
          return (
            <div key={family.name} className={`set-family ${state}`}>
              <div className="set-family-row">
                <button
                  className="set-family-toggle"
                  onClick={() => toggleFamily(family)}
                  aria-pressed={state !== "none"}
                >
                  <span className={`set-check ${state}`} aria-hidden="true" />
                  <span className="set-family-name">{family.name}</span>
                  <span className="set-family-meta">
                    {chosen > 0 && <b>{chosen}/{codes.length}</b>}
                    {chosen === 0 && <span>{codes.length}</span>}
                  </span>
                </button>
                {codes.length > 1 && (
                  <button
                    className={`set-family-expand ${isOpen ? "open" : ""}`}
                    onClick={() => toggleExpanded(family.name)}
                    aria-label={isOpen ? `${family.name} zuklappen` : `${family.name} aufklappen`}
                    aria-expanded={isOpen}
                  >
                    ▾
                  </button>
                )}
              </div>
              {isOpen && (
                <ul className="set-code-list">
                  {family.sets.map((set) => (
                    <li key={set.code}>
                      <button
                        className={`set-code ${selected.has(set.code.toUpperCase()) ? "on" : ""}`}
                        onClick={() => toggleSet(set.code)}
                        aria-pressed={selected.has(set.code.toUpperCase())}
                      >
                        <span className={`set-check ${selected.has(set.code.toUpperCase()) ? "all" : "none"}`} aria-hidden="true" />
                        <code>{set.code}</code>
                        <span className="set-code-name">{set.name}</span>
                        <span className="set-code-count">{set.cardCount}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      <footer className="set-picker-foot">
        <span className="set-picker-summary">
          {selected.size === 0
            ? "Keine Sets gewählt"
            : `${selected.size} Set${selected.size === 1 ? "" : "s"} · ${selectedCards.toLocaleString("de-DE")} Karten`}
        </span>
        <div className="set-picker-buttons">
          <button className="set-picker-cancel" onClick={onCancel}>Abbrechen</button>
          <button
            className="set-picker-start"
            disabled={selected.size === 0}
            onClick={() => onConfirm([...selected])}
          >
            Scan starten
          </button>
        </div>
      </footer>
    </div>
  );
}
