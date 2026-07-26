import { useMemo, useState } from "react";
import { filterFamilies, groupSetsIntoFamilies } from "../setFamilies";
import type { IndexedSet, SetFamily } from "../setFamilies";

/** Tri-state marker: nothing / some / every set of a family selected. */
function SetCheck({ state }: { state: "none" | "some" | "all" }) {
  const look =
    state === "all"
      ? "border-acid bg-acid shadow-[inset_0_0_0_3px_#1b1d19,inset_0_0_0_9px_var(--color-acid)]"
      : state === "some"
        ? "border-acid shadow-[inset_0_0_0_4px_var(--color-acid)]"
        : "border-white/25";
  return <span aria-hidden="true" className={`size-[17px] shrink-0 rounded-[5px] border-[1.5px] ${look}`} />;
}

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
    <div className="flex max-h-[62svh] w-full flex-col gap-2.5 rounded-[22px] border border-line bg-[#1b1d19] p-3.5" role="dialog" aria-label="Sets auswählen">
      <header className="flex items-center gap-2">
        <input
          className="min-w-0 flex-1 rounded-xl border border-line bg-black/25 px-3 py-2.5 text-[13px] text-[#e9ece3] placeholder:text-[#6f7565]"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Set oder Code suchen …"
          aria-label="Sets durchsuchen"
        />
        <button className="rounded-xl border border-line px-3 py-2.5 text-[11px] whitespace-nowrap text-muted disabled:cursor-not-allowed disabled:opacity-35" onClick={() => setSelected(new Set())} disabled={selected.size === 0}>
          Auswahl leeren
        </button>
      </header>

      <div className="-mx-1 flex-1 overflow-y-auto px-1">
        {visible.length === 0 && <p className="py-5 text-center text-xs text-muted">Kein Set gefunden.</p>}
        {visible.map((family) => {
          const codes = family.sets.map((set) => set.code.toUpperCase());
          const chosen = codes.filter((code) => selected.has(code)).length;
          const state = chosen === 0 ? "none" : chosen === codes.length ? "all" : "some";
          const isOpen = expanded.has(family.name);
          return (
            <div key={family.name} className="border-b border-white/5">
              <div className="flex items-stretch">
                <button
                  className="flex min-w-0 flex-1 items-center gap-2.5 px-1 py-[11px] text-left text-[13px] text-[#e9ece3]"
                  onClick={() => toggleFamily(family)}
                  aria-pressed={state !== "none"}
                >
                  <SetCheck state={state} />
                  <span className="min-w-0 flex-1 truncate">{family.name}</span>
                  <span className="text-[11px] tabular-nums text-muted">
                    {chosen > 0 && <b className="font-semibold text-acid">{chosen}/{codes.length}</b>}
                    {chosen === 0 && <span>{codes.length}</span>}
                  </span>
                </button>
                {codes.length > 1 && (
                  <button
                    className={`w-[34px] text-[13px] transition-transform ${isOpen ? "rotate-180 text-acid" : "text-muted"}`}
                    onClick={() => toggleExpanded(family.name)}
                    aria-label={isOpen ? `${family.name} zuklappen` : `${family.name} aufklappen`}
                    aria-expanded={isOpen}
                  >
                    ▾
                  </button>
                )}
              </div>
              {isOpen && (
                <ul className="m-0 mb-2 list-none p-0 pl-3">
                  {family.sets.map((set) => (
                    <li key={set.code}>
                      <button
                        className={`flex w-full items-center gap-[9px] px-1 py-[7px] text-left text-[11px] ${selected.has(set.code.toUpperCase()) ? "text-[#d3d8ca]" : "text-muted"}`}
                        onClick={() => toggleSet(set.code)}
                        aria-pressed={selected.has(set.code.toUpperCase())}
                      >
                        <SetCheck state={selected.has(set.code.toUpperCase()) ? "all" : "none"} />
                        <code className={`w-[46px] shrink-0 text-[10px] tracking-[0.04em] ${selected.has(set.code.toUpperCase()) ? "text-acid" : "text-[#9aa08d]"}`}>{set.code}</code>
                        <span className="min-w-0 flex-1 truncate">{set.name}</span>
                        <span className="text-[10px] tabular-nums">{set.cardCount}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      <footer className="flex items-center justify-between gap-2.5 border-t border-line pt-2.5">
        <span className="text-[11px] text-muted">
          {selected.size === 0
            ? "Keine Sets gewählt"
            : `${selected.size} Set${selected.size === 1 ? "" : "s"} · ${selectedCards.toLocaleString("de-DE")} Karten`}
        </span>
        <div className="flex gap-2">
          <button className="rounded-xl border border-line px-3.5 py-2.5 text-xs text-muted" onClick={onCancel}>Abbrechen</button>
          <button
            className="rounded-xl bg-acid px-[18px] py-2.5 text-xs font-bold text-ink disabled:cursor-not-allowed disabled:opacity-35"
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
