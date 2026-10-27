//! Persistence of the advisor cockpit's open panel.

import { COCKPIT_PANELS, CockpitPanel } from "src/components/deck-advisor-cockpit-tiles";

// Per browser rather than per deck: the cockpit is the same four panels on every deck, and a
// reader last looking at the roles most likely wants the roles again on the next one.
const OPEN_PANEL_KEY = "mtg.advisor.cockpit-panel";

/**
 * Reads the panel that was open last
 *
 * @returns the panel, or `null` if the browser kept none
 */
export function loadCockpitPanel(): CockpitPanel | null {
    try {
        const held = localStorage.getItem(OPEN_PANEL_KEY);
        return (COCKPIT_PANELS as ReadonlyArray<string>).includes(held ?? "") ? (held as CockpitPanel) : null;
    } catch {
        return null;
    }
}

/**
 * Remembers the panel that was just opened
 *
 * @param panel the open panel
 */
export function saveCockpitPanel(panel: CockpitPanel): void {
    try {
        localStorage.setItem(OPEN_PANEL_KEY, panel);
    } catch {
        // storage unavailable (private mode) — the cockpit simply forgets
    }
}
