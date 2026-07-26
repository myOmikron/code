import { ChevronDownIcon } from "@heroicons/react/24/outline";
import {
  Button,
  Checkbox,
  CheckboxField,
  Dialog,
  DialogActions,
  DialogBody,
  DialogTitle,
  Divider,
  Input,
  Label,
  StackedList,
  StackedListFlexRow,
  Strong,
  Text,
} from "components";
import { useMemo, useState } from "react";
import { filterFamilies, groupSetsIntoFamilies } from "../setFamilies";
import type { IndexedSet, SetFamily } from "../setFamilies";

/** Picks which sets the scanner searches. Releases are offered as one entry ("Secrets of
 *  Strixhaven" covers its commander decks, tokens, art series and promos), because that is how a
 *  box of cards actually arrives — but every set code inside stays individually toggleable, since
 *  the grouping is derived from naming conventions and cannot be right for every release. */
export function SetPicker({
  open,
  sets,
  initialSelection,
  onCancel,
  onConfirm,
}: {
  open: boolean;
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
    <Dialog open={open} onClose={onCancel} size="2xl">
      <DialogTitle>Sets auswählen</DialogTitle>
      <DialogBody>
        <div className="flex items-center gap-2">
          <Input
            className="min-w-0 flex-1"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Set oder Code suchen …"
            aria-label="Sets durchsuchen"
          />
          <Button plain className="whitespace-nowrap" onClick={() => setSelected(new Set())} disabled={selected.size === 0}>
            Auswahl leeren
          </Button>
        </div>

        <Divider className="my-4" />

        {/* `scrollbar-gutter: stable` reserves the track whether or not it is showing, so filtering
            the list down does not shift the rows sideways; the padding keeps the right-aligned
            counts off the scrollbar. */}
        <div className="max-h-[50svh] overflow-y-auto pr-3 [scrollbar-gutter:stable]">
          {visible.length === 0 && <Text className="py-6 text-center">Kein Set gefunden.</Text>}
          <StackedList>
            {visible.map((family) => {
              const codes = family.sets.map((set) => set.code.toUpperCase());
              const chosen = codes.filter((code) => selected.has(code)).length;
              const isOpen = expanded.has(family.name);
              return (
                <StackedListFlexRow key={family.name} className="flex-col !items-stretch">
                  <div className="flex items-center gap-2">
                    <CheckboxField className="min-w-0 flex-1">
                      <Checkbox
                        color="lime"
                        checked={chosen === codes.length}
                        indeterminate={chosen > 0 && chosen < codes.length}
                        onChange={() => toggleFamily(family)}
                        aria-label={family.name}
                      />
                      <Label className="flex w-full min-w-0 items-center gap-2">
                        <span className="min-w-0 flex-1 truncate">{family.name}</span>
                        <span className="shrink-0 tabular-nums">{chosen > 0 ? <Strong>{chosen}/{codes.length}</Strong> : codes.length}</span>
                      </Label>
                    </CheckboxField>
                    {codes.length > 1 && (
                      <Button
                        plain
                        onClick={() => toggleExpanded(family.name)}
                        aria-label={isOpen ? `${family.name} zuklappen` : `${family.name} aufklappen`}
                        aria-expanded={isOpen}
                      >
                        <ChevronDownIcon className={`size-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                      </Button>
                    )}
                  </div>
                  {isOpen && (
                    <div className="mt-1 mb-2 flex flex-col gap-1 pl-6">
                      {family.sets.map((set) => (
                        <CheckboxField key={set.code}>
                          <Checkbox
                            color="lime"
                            checked={selected.has(set.code.toUpperCase())}
                            onChange={() => toggleSet(set.code)}
                            aria-label={set.name}
                          />
                          <Label className="flex w-full min-w-0 items-center gap-3">
                            <code className="w-12 shrink-0 text-xs">{set.code}</code>
                            <span className="min-w-0 flex-1 truncate">{set.name}</span>
                            <span className="shrink-0 tabular-nums">{set.cardCount}</span>
                          </Label>
                        </CheckboxField>
                      ))}
                    </div>
                  )}
                </StackedListFlexRow>
              );
            })}
          </StackedList>
        </div>
        <Divider className="mt-4" />
        <Text className="mt-4">
          {selected.size === 0
            ? "Keine Sets gewählt"
            : <><Strong>{selected.size} Set{selected.size === 1 ? "" : "s"}</Strong> · {selectedCards.toLocaleString("de-DE")} Karten</>}
        </Text>
      </DialogBody>
      <DialogActions>
        <Button plain onClick={onCancel}>Abbrechen</Button>
        <Button color="lime" disabled={selected.size === 0} onClick={() => onConfirm([...selected])}>
          Scan starten
        </Button>
      </DialogActions>
    </Dialog>
  );
}
