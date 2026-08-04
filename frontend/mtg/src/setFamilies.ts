//! Grouping of the ~990 indexed sets into the products a user actually thinks in ("Secrets of
//! Strixhaven"), so the scan filter can be picked per release instead of per set code.
//!
//! Scryfall's parent/child relation is not carried in our index, so the family is derived from
//! the two conventions the data does follow:
//!
//!  1. **Code prefixes** — a companion product's code is one letter plus its parent's code
//!     (`SOS` → `ASOS` art series, `PSOS` promos, `TSOS` tokens; `SOC` → `TSOC`).
//!  2. **Name suffixes** — sibling products repeat the release name and append the product type
//!     ("Secrets of Strixhaven Commander", "… Art Series", "… Mystical Archive").
//!
//! Both are heuristics, so the picker always lets individual codes be toggled by hand.

/** One indexed set, as the manifest describes it. */
export type IndexedSet = { code: string; name: string; cardCount: number };

/** A release and every set code that belongs to it. */
export type SetFamily = {
  /** Stable key, also the label shown in the picker. */
  name: string;
  sets: IndexedSet[];
  cardCount: number;
};

// Product-type suffixes that mark a companion product rather than a release of its own. Ordered
// longest-first so "Commander Tokens" is not shortened to "Tokens" and left as "… Commander".
// Deliberately conservative: "Edition", "Masters" and years are parts of real set names.
const PRODUCT_SUFFIXES = [
  "Jumpstart Front Cards",
  "Deluxe Commander Kit",
  "Commander Tokens",
  "Substitute Cards",
  "Mystical Archive",
  "Front Cards",
  "Art Series",
  "Scene Box",
  "Minigames",
  "Oversized",
  "Commander",
  "Tokens",
  "Promos",
];

function stripProductSuffix(name: string): string {
  for (const suffix of PRODUCT_SUFFIXES) {
    if (name.endsWith(` ${suffix}`)) return name.slice(0, -(suffix.length + 1)).trim();
  }
  return name;
}

/** Walk the one-letter-prefix chain down to the release's own code (`TSOC` → `SOC`). */
function rootCode(code: string, byCode: Map<string, IndexedSet>): string {
  let current = code;
  const seen = new Set<string>();
  while (current.length >= 3 && byCode.has(current.slice(1)) && !seen.has(current)) {
    seen.add(current);
    current = current.slice(1);
  }
  return current;
}

/** Group sets into releases, sorted by name; each family's sets are sorted by code. */
export function groupSetsIntoFamilies(sets: IndexedSet[]): SetFamily[] {
  const byCode = new Map(sets.map((set) => [set.code.toUpperCase(), set]));
  const families = new Map<string, IndexedSet[]>();
  for (const set of sets) {
    const root = byCode.get(rootCode(set.code.toUpperCase(), byCode));
    const name = stripProductSuffix((root ?? set).name);
    const members = families.get(name);
    if (members) members.push(set);
    else families.set(name, [set]);
  }
  return [...families.entries()]
    .map(([name, members]) => ({
      name,
      sets: [...members].sort((left, right) => left.code.localeCompare(right.code)),
      cardCount: members.reduce((sum, set) => sum + set.cardCount, 0),
    }))
    .sort((left, right) => left.name.localeCompare(right.name, "de"));
}

/** Families whose release name or any member code matches the query. */
export function filterFamilies(families: SetFamily[], query: string): SetFamily[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return families;
  return families.filter(
    (family) =>
      family.name.toLowerCase().includes(needle) ||
      family.sets.some((set) => set.code.toLowerCase().includes(needle)),
  );
}
