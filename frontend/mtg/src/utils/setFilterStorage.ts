//! Persistence of the scan set filter.

// The chosen scan filter survives restarts: sorting one box is many sessions, and re-picking the
// sets every time would be the annoying part. An empty list means "all sets".
const SET_FILTER_KEY = "cardlens.setFilter.v1";

export function loadSetFilter(): string[] {
  try {
    const raw = localStorage.getItem(SET_FILTER_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((code): code is string => typeof code === "string") : [];
  } catch {
    return [];
  }
}

export function saveSetFilter(codes: string[]): void {
  try {
    localStorage.setItem(SET_FILTER_KEY, JSON.stringify(codes));
  } catch {
    // storage unavailable (private mode) — the filter simply does not persist
  }
}
